-- Application-owned configuration only. No managed Auth changes, source-table
-- ownership, case/document grants, public RPCs, or activation flags are changed.
GRANT SELECT(user_role_assignment_id) ON synapse.user_role_assignments TO synapse_account_manager;
GRANT synapse_account_manager TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA synapse_gateway TO synapse_account_manager;
SET LOCAL ROLE synapse_account_manager;
CREATE FUNCTION synapse_gateway.roles(p_claims jsonb,p_operation text,p_input jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $roles$
DECLARE actor uuid; subject uuid; target record; prior record; membership record;
 request_id uuid; next_role uuid; next_assignment uuid; requested_until timestamptz; outcome jsonb;
BEGIN
 PERFORM set_config('request.jwt.claims',p_claims::text,true); subject:=synapse.phase2_verified_subject();
 IF subject IS NULL OR synapse.phase2_session_id() IS NULL OR EXISTS(SELECT FROM synapse.auth_session_revocations WHERE session_id=synapse.phase2_session_id()) THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
 SELECT u.user_id INTO actor FROM synapse.users u JOIN synapse.auth_identity_links l ON l.internal_user_id=u.user_id
  WHERE l.auth_user_id=subject AND l.revoked_at IS NULL AND u.account_status='ACTIVE' FOR SHARE OF u,l;
 IF actor IS NULL THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 PERFORM a.user_id FROM synapse.user_role_assignments a JOIN synapse.roles r USING(role_id)
  WHERE a.user_id=actor AND a.scope_type='GLOBAL' AND r.role_code='SYSTEM_ADMIN' AND r.is_active
  AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now()) FOR SHARE OF a;
 IF NOT FOUND THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 IF p_operation='list' THEN
  RETURN jsonb_build_object('assignments',coalesce((SELECT jsonb_agg(row ORDER BY ordering) FROM (
   SELECT jsonb_build_object('id',a.user_role_assignment_id,'userId',a.user_id,'email',u.email,'bureauId',a.bureau_id,'bureau',b.bureau_name,
    'role',r.role_code,'validFrom',a.valid_from,'validUntil',a.valid_until,'canManage',a.user_id<>actor) row,a.user_role_assignment_id ordering
   FROM synapse.user_role_assignments a JOIN synapse.users u USING(user_id) JOIN synapse.roles r USING(role_id) JOIN synapse.bureaus b USING(bureau_id)
   WHERE a.scope_type='BUREAU' AND u.account_status='ACTIVE' AND r.is_active AND b.is_active
    AND r.role_code IN('CASE_OFFICER','BUREAU_HEAD','AUDITOR','REVIEWER') AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now())
   ORDER BY a.user_role_assignment_id LIMIT 100
  ) rows),'[]'::jsonb),'truncated',(SELECT count(*)>100 FROM synapse.user_role_assignments a JOIN synapse.users u USING(user_id)
   JOIN synapse.roles r USING(role_id) JOIN synapse.bureaus b USING(bureau_id) WHERE a.scope_type='BUREAU' AND u.account_status='ACTIVE' AND r.is_active AND b.is_active
    AND r.role_code IN('CASE_OFFICER','BUREAU_HEAD','AUDITOR','REVIEWER') AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now())));
 END IF;
 IF p_operation IS DISTINCT FROM 'decide' OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR
  length(btrim(coalesce(p_input->>'reason',''))) NOT BETWEEN 5 AND 1000 OR NOT (p_input ? 'expectedUntil') OR
  jsonb_typeof(p_input->'revoke') IS DISTINCT FROM 'boolean' OR
  coalesce(p_input->>'expectedRole','') NOT IN('CASE_OFFICER','BUREAU_HEAD','AUDITOR','REVIEWER') OR
  p_input-ARRAY['requestId','assignmentId','expectedRole','expectedUntil','revoke','role','until','reason'] <> '{}'::jsonb
 THEN RAISE EXCEPTION 'Review fields required' USING ERRCODE='22023'; END IF;
 request_id:=(p_input->>'requestId')::uuid;
 IF request_id IS NULL OR (p_input->>'assignmentId')::uuid IS NULL THEN RAISE EXCEPTION 'Review identity required' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(request_id::text,0));
 SELECT actor_user_id,action,detail INTO prior FROM synapse_gateway.account_audit WHERE event_id=request_id;
 IF FOUND THEN
  IF prior.actor_user_id<>actor OR prior.action<>'ROLE_REVIEW' OR prior.detail->'request' IS DISTINCT FROM p_input THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='40001'; END IF;
  RETURN prior.detail->'result' || jsonb_build_object('replayed',true);
 END IF;
 -- Lock current authority and the exact target assignment through the commit.
 SELECT a.user_role_assignment_id,a.user_id,a.role_id,a.bureau_id,a.valid_from,a.valid_until,r.role_code,l.auth_user_id INTO target
  FROM synapse.user_role_assignments a JOIN synapse.users u USING(user_id) JOIN synapse.roles r USING(role_id)
  JOIN synapse.bureaus b USING(bureau_id) JOIN synapse.auth_identity_links l ON l.internal_user_id=u.user_id AND l.revoked_at IS NULL
  WHERE a.user_role_assignment_id=(p_input->>'assignmentId')::uuid AND a.scope_type='BUREAU' AND u.account_status='ACTIVE' AND b.is_active
   AND r.is_active AND r.role_code IN('CASE_OFFICER','BUREAU_HEAD','AUDITOR','REVIEWER')
  FOR UPDATE OF a FOR SHARE OF u,l;
 IF NOT FOUND OR target.user_id=actor THEN RAISE EXCEPTION 'Independent Bureau assignment required' USING ERRCODE='42501'; END IF;
 IF target.role_code<>p_input->>'expectedRole' OR target.valid_until IS DISTINCT FROM (p_input->>'expectedUntil')::timestamptz OR
  target.valid_from>now() OR (target.valid_until IS NOT NULL AND target.valid_until<=now()) THEN RAISE EXCEPTION 'Assignment changed' USING ERRCODE='40001'; END IF;
 next_assignment:=target.user_role_assignment_id;
 IF (p_input->>'revoke')::boolean THEN
  IF p_input ? 'role' OR p_input ? 'until' THEN RAISE EXCEPTION 'Ambiguous review' USING ERRCODE='22023'; END IF;
  UPDATE synapse.user_role_assignments SET valid_until=clock_timestamp() WHERE user_role_assignment_id=target.user_role_assignment_id;
 ELSE
  IF coalesce(p_input->>'role','') NOT IN('CASE_OFFICER','BUREAU_HEAD','AUDITOR','REVIEWER') OR coalesce(p_input->>'until','')='' THEN RAISE EXCEPTION 'Bounded Bureau role required' USING ERRCODE='22023'; END IF;
  requested_until:=(p_input->>'until')::timestamptz;
  IF requested_until NOT BETWEEN now()+interval '1 hour' AND now()+interval '90 days' THEN RAISE EXCEPTION 'Bounded expiry required' USING ERRCODE='22023'; END IF;
  SELECT m.membership_id INTO membership FROM synapse.user_bureau_memberships m WHERE m.user_id=target.user_id AND m.bureau_id=target.bureau_id
   AND m.valid_from<=now() AND (m.valid_until IS NULL OR m.valid_until>=requested_until) ORDER BY m.membership_id LIMIT 1 FOR SHARE OF m;
  IF NOT FOUND THEN RAISE EXCEPTION 'Current membership must cover the role window' USING ERRCODE='22023'; END IF;
  SELECT role_id INTO next_role FROM synapse.roles WHERE role_code=p_input->>'role' AND is_active;
  IF next_role IS NULL THEN RAISE EXCEPTION 'Active Bureau role required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('synapse.role:'||target.user_id::text||':'||target.bureau_id::text,0));
  IF next_role<>target.role_id AND EXISTS(SELECT FROM synapse.user_role_assignments a WHERE a.user_id=target.user_id AND a.bureau_id=target.bureau_id
   AND a.scope_type='BUREAU' AND a.role_id=next_role AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now()))
  THEN RAISE EXCEPTION 'Current assignment already exists' USING ERRCODE='40001'; END IF;
  IF next_role=target.role_id THEN
   UPDATE synapse.user_role_assignments SET valid_until=requested_until WHERE user_role_assignment_id=target.user_role_assignment_id;
  ELSE
   -- Keep the original assignment in history; changing its role_id would erase it.
   UPDATE synapse.user_role_assignments SET valid_until=clock_timestamp() WHERE user_role_assignment_id=target.user_role_assignment_id;
   INSERT INTO synapse.user_role_assignments(user_id,role_id,scope_type,bureau_id,valid_until,assigned_by_user_id)
    VALUES(target.user_id,next_role,'BUREAU',target.bureau_id,requested_until,actor) RETURNING user_role_assignment_id INTO next_assignment;
  END IF;
 END IF;
 outcome:=jsonb_build_object('saved',true,'replayed',false,'assignmentId',next_assignment);
 INSERT INTO synapse_gateway.account_audit(event_id,auth_user_id,actor_user_id,action,detail)
  VALUES(request_id,target.auth_user_id,actor,'ROLE_REVIEW',jsonb_build_object('request',p_input,'result',outcome,
   'before',jsonb_build_object('role',target.role_code,'validUntil',target.valid_until,'userId',target.user_id,'bureauId',target.bureau_id)));
 RETURN outcome;
END $roles$;
REVOKE ALL ON FUNCTION synapse_gateway.roles(jsonb,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION synapse_gateway.roles(jsonb,text,jsonb) TO synapse_web_gateway;
RESET ROLE;
REVOKE CREATE ON SCHEMA synapse_gateway FROM synapse_account_manager;
GRANT synapse_account_manager TO postgres WITH INHERIT FALSE,SET FALSE;
