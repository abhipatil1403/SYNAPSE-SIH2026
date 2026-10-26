-- Configuration-only Bureau membership management. Does not change role codes,
-- grant complaint access by itself, or allow self-approval/privilege extension.
GRANT SELECT(membership_id) ON synapse.user_bureau_memberships TO synapse_account_manager;
GRANT SELECT(event_id,auth_user_id,actor_user_id,action,detail) ON synapse_gateway.account_audit TO synapse_account_manager;
CREATE POLICY account_manager_audit_read ON synapse_gateway.account_audit FOR SELECT TO synapse_account_manager USING(true);
GRANT synapse_account_manager TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA synapse_gateway TO synapse_account_manager;
SET LOCAL ROLE synapse_account_manager;
CREATE FUNCTION synapse_gateway.memberships(p_claims jsonb,p_operation text,p_input jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $memberships$
DECLARE actor uuid; subject uuid; target record; prior record; request_id uuid;
BEGIN
 PERFORM set_config('request.jwt.claims',p_claims::text,true);subject:=synapse.phase2_verified_subject();
 IF subject IS NULL OR synapse.phase2_session_id() IS NULL OR EXISTS(SELECT FROM synapse.auth_session_revocations WHERE session_id=synapse.phase2_session_id()) THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
 SELECT u.user_id INTO actor FROM synapse.users u JOIN synapse.auth_identity_links l ON l.internal_user_id=u.user_id
  WHERE l.auth_user_id=subject AND l.revoked_at IS NULL AND u.account_status='ACTIVE' FOR SHARE OF u,l;
 IF actor IS NULL THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 PERFORM a.user_id FROM synapse.user_role_assignments a JOIN synapse.roles r USING(role_id) WHERE a.user_id=actor AND a.scope_type='GLOBAL'
  AND r.role_code='SYSTEM_ADMIN' AND r.is_active AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now()) FOR SHARE OF a;
 IF NOT FOUND THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 IF p_operation='list' THEN RETURN jsonb_build_object('memberships',coalesce((SELECT jsonb_agg(row) FROM (
  SELECT jsonb_build_object('id',m.membership_id,'userId',m.user_id,'email',u.email,'bureau',b.bureau_name,'bureauId',m.bureau_id,
    'validFrom',m.valid_from,'validUntil',m.valid_until,'canManage',m.user_id<>actor) row
   FROM synapse.user_bureau_memberships m JOIN synapse.users u USING(user_id) JOIN synapse.bureaus b USING(bureau_id)
   WHERE u.account_status='ACTIVE' AND m.valid_from<=now() AND (m.valid_until IS NULL OR m.valid_until>now()) ORDER BY m.valid_from DESC LIMIT 100
  ) rows),'[]'::jsonb)); END IF;
 IF p_operation<>'decide' OR length(coalesce(p_input->>'reason','')) NOT BETWEEN 5 AND 1000 OR NOT (p_input ? 'expectedUntil') THEN RAISE EXCEPTION 'Review fields required' USING ERRCODE='22023'; END IF;
 request_id:=(p_input->>'requestId')::uuid;
 IF request_id IS NULL THEN RAISE EXCEPTION 'Idempotency key required' USING ERRCODE='22023'; END IF;
 -- Serialize both matching and conflicting replays of the same actor request.
 PERFORM pg_advisory_xact_lock(hashtextextended(request_id::text,0));
 SELECT event_id,actor_user_id,action,detail INTO prior FROM synapse_gateway.account_audit WHERE event_id=request_id;
 IF FOUND THEN
  IF prior.actor_user_id<>actor OR prior.action<>'MEMBERSHIP_REVIEW' OR prior.detail<>p_input THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('saved',true,'replayed',true);
 END IF;
 SELECT m.membership_id,m.user_id,m.valid_from,m.valid_until INTO target FROM synapse.user_bureau_memberships m JOIN synapse.users u USING(user_id)
  WHERE m.membership_id=(p_input->>'membershipId')::uuid AND u.account_status='ACTIVE' AND m.valid_from<=now() AND (m.valid_until IS NULL OR m.valid_until>now()) FOR UPDATE OF m;
 IF NOT FOUND OR target.user_id=actor THEN RAISE EXCEPTION 'Independent current membership required' USING ERRCODE='42501'; END IF;
 IF target.valid_until IS DISTINCT FROM (p_input->>'expectedUntil')::timestamptz THEN RAISE EXCEPTION 'Membership changed' USING ERRCODE='40001'; END IF;
 IF coalesce((p_input->>'revoke')::boolean,false) THEN
  UPDATE synapse.user_bureau_memberships SET valid_until=clock_timestamp() WHERE membership_id=target.membership_id;
 ELSE
  IF coalesce(p_input->>'until','')='' OR (p_input->>'until')::timestamptz NOT BETWEEN now()+interval '1 hour' AND now()+interval '90 days' THEN RAISE EXCEPTION 'Bounded expiry required' USING ERRCODE='22023'; END IF;
  UPDATE synapse.user_bureau_memberships SET valid_until=(p_input->>'until')::timestamptz WHERE membership_id=target.membership_id;
 END IF;
 INSERT INTO synapse_gateway.account_audit(event_id,auth_user_id,actor_user_id,action,detail) VALUES(request_id,subject,actor,'MEMBERSHIP_REVIEW',p_input);
 RETURN jsonb_build_object('saved',true,'replayed',false);
END $memberships$;
REVOKE ALL ON FUNCTION synapse_gateway.memberships(jsonb,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION synapse_gateway.memberships(jsonb,text,jsonb) TO synapse_web_gateway;
RESET ROLE;
REVOKE CREATE ON SCHEMA synapse_gateway FROM synapse_account_manager;
GRANT synapse_account_manager TO postgres WITH INHERIT FALSE,SET FALSE;
