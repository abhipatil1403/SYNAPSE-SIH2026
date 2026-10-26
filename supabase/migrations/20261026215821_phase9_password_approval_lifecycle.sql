-- Reviewed application-owned lifecycle extension. No managed object/setting or
-- complaint permissions change. Public reads and all hosted business writes stay off.
CREATE TABLE synapse_gateway.deleted_applications (
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),auth_user_id uuid NOT NULL,
 archived_at timestamptz NOT NULL DEFAULT now(),application jsonb NOT NULL
);
ALTER TABLE synapse_gateway.deleted_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE synapse_gateway.deleted_applications FORCE ROW LEVEL SECURITY;
CREATE POLICY manager_archive_insert ON synapse_gateway.deleted_applications FOR INSERT TO synapse_account_manager WITH CHECK(true);
GRANT INSERT ON synapse_gateway.deleted_applications TO synapse_account_manager;
GRANT SELECT(event_id,auth_user_id,actor_user_id,action,occurred_at,detail) ON synapse_gateway.account_audit TO synapse_account_manager;
CREATE POLICY manager_audit_review ON synapse_gateway.account_audit FOR SELECT TO synapse_account_manager USING(true);
GRANT SELECT(display_name) ON synapse.users TO synapse_account_manager;
GRANT synapse_account_manager TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA synapse_gateway TO synapse_account_manager;
SET LOCAL ROLE synapse_account_manager;
CREATE FUNCTION synapse_gateway.archive_application() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $$
BEGIN
 INSERT INTO synapse_gateway.deleted_applications(auth_user_id,application) VALUES(OLD.auth_user_id,to_jsonb(OLD));
 INSERT INTO synapse_gateway.account_audit(auth_user_id,actor_user_id,action,detail)
 VALUES(OLD.auth_user_id,NULL,'AUTH_APPLICATION_ARCHIVED',jsonb_build_object('priorStatus',OLD.status,'source','Application-owned FK cascade after owner/provider Auth deletion; no application user history removed'));
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION synapse_gateway.archive_application() FROM PUBLIC,anon,authenticated,service_role,synapse_web_gateway;
GRANT EXECUTE ON FUNCTION synapse_gateway.archive_application() TO postgres;
CREATE FUNCTION synapse_gateway.applicants(p_claims jsonb,p_operation text,p_input jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $$
DECLARE subject uuid; actor uuid; result jsonb; application jsonb; profile jsonb;
BEGIN
 PERFORM set_config('request.jwt.claims',p_claims::text,true);
 subject:=synapse.phase2_verified_subject();
 IF subject IS NULL OR synapse.phase2_session_id() IS NULL OR EXISTS(SELECT FROM synapse.auth_session_revocations WHERE session_id=synapse.phase2_session_id()) THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
 IF p_operation='self' THEN
  SELECT jsonb_build_object('status',o.status,'requestedAt',o.requested_at,'decidedAt',o.decided_at) INTO application FROM synapse_gateway.onboarding o WHERE o.auth_user_id=subject;
  SELECT l.internal_user_id INTO actor FROM synapse.auth_identity_links l JOIN synapse.users u ON u.user_id=l.internal_user_id WHERE l.auth_user_id=subject AND l.revoked_at IS NULL AND u.account_status='ACTIVE';
  IF actor IS NOT NULL THEN
   SELECT jsonb_build_object('id',u.user_id,'authId',subject,'name',u.display_name,'active',true,
    'memberships',coalesce((SELECT jsonb_agg(jsonb_build_object('bureauId',m.bureau_id,'from',m.valid_from,'until',m.valid_until)) FROM synapse.user_bureau_memberships m WHERE m.user_id=actor AND m.valid_from<=now() AND (m.valid_until IS NULL OR m.valid_until>now())),'[]'::jsonb),
    'roles',coalesce((SELECT jsonb_agg(jsonb_build_object('code',r.role_code,'bureauId',a.bureau_id,'from',a.valid_from,'until',a.valid_until)) FROM synapse.user_role_assignments a JOIN synapse.roles r USING(role_id) WHERE a.user_id=actor AND r.is_active AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now()) AND (a.scope_type='GLOBAL' OR EXISTS(SELECT FROM synapse.user_bureau_memberships m WHERE m.user_id=actor AND m.bureau_id=a.bureau_id AND m.valid_from<=now() AND (m.valid_until IS NULL OR m.valid_until>now())))),'[]'::jsonb)) INTO profile FROM synapse.users u WHERE u.user_id=actor;
  END IF;
  RETURN jsonb_strip_nulls(jsonb_build_object('application',application,'profile',profile));
 ELSIF p_operation='list' THEN
  -- Existing administrator predicate remains authoritative; never an email check.
  result:=synapse_gateway.account(p_claims,'list','{}');
  SELECT coalesce(jsonb_agg(o||jsonb_build_object('history',coalesce((SELECT jsonb_agg(h.body ORDER BY h.at DESC) FROM (SELECT a.occurred_at at,jsonb_build_object('action',a.action,'at',a.occurred_at,'actorId',a.actor_user_id,'detail',a.detail) body FROM synapse_gateway.account_audit a WHERE a.auth_user_id=(o->>'auth_user_id')::uuid ORDER BY a.occurred_at DESC LIMIT 20) h),'[]'::jsonb))),'[]'::jsonb) INTO application FROM jsonb_array_elements(result->'requests') o;
  RETURN jsonb_set(result,'{requests}',application);
 END IF;
 RAISE EXCEPTION 'Unsupported applicant operation' USING ERRCODE='22023';
END $$;
REVOKE ALL ON FUNCTION synapse_gateway.applicants(jsonb,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION synapse_gateway.applicants(jsonb,text,jsonb) TO synapse_web_gateway;
RESET ROLE;
CREATE TRIGGER archive_application_before_delete BEFORE DELETE ON synapse_gateway.onboarding FOR EACH ROW EXECUTE FUNCTION synapse_gateway.archive_application();
SET LOCAL ROLE synapse_account_manager;
REVOKE EXECUTE ON FUNCTION synapse_gateway.archive_application() FROM postgres;
RESET ROLE;
-- Only owner/provider deletion of Auth users initiates these cascades. The web
-- runtime still has no DELETE, user-deletion API, or managed Auth privileges.
ALTER TABLE synapse_gateway.onboarding DROP CONSTRAINT onboarding_auth_user_id_fkey;
ALTER TABLE synapse_gateway.onboarding ADD CONSTRAINT onboarding_auth_user_id_fkey FOREIGN KEY(auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE synapse_gateway.recovery_grants DROP CONSTRAINT recovery_grants_auth_user_id_fkey;
ALTER TABLE synapse_gateway.recovery_grants ADD CONSTRAINT recovery_grants_auth_user_id_fkey FOREIGN KEY(auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
REVOKE CREATE ON SCHEMA synapse_gateway FROM synapse_account_manager;
GRANT synapse_account_manager TO postgres WITH INHERIT FALSE,SET FALSE;
