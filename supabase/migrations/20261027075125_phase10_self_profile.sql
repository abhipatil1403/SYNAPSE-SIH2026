-- Reviewed self-service display-name metadata only. No complaint or Auth writes.
GRANT UPDATE(display_name) ON synapse.users TO synapse_account_manager;
GRANT synapse_account_manager TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA synapse_gateway TO synapse_account_manager;
SET LOCAL ROLE synapse_account_manager;
CREATE FUNCTION synapse_gateway.profile(p_claims jsonb,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $$
DECLARE subject uuid; actor uuid; prior_name text; requested_name text;
BEGIN
 PERFORM set_config('request.jwt.claims',p_claims::text,true);
 subject:=synapse.phase2_verified_subject();
 IF subject IS NULL OR synapse.phase2_session_id() IS NULL OR EXISTS(SELECT FROM synapse.auth_session_revocations WHERE session_id=synapse.phase2_session_id()) THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR EXISTS(SELECT FROM jsonb_object_keys(p_input) k WHERE k<>'name') THEN RAISE EXCEPTION 'Only a display name may be changed' USING ERRCODE='22023'; END IF;
 requested_name:=btrim(p_input->>'name');
 IF requested_name IS NULL OR length(requested_name) NOT BETWEEN 2 AND 150 THEN RAISE EXCEPTION 'Valid display name required' USING ERRCODE='22023'; END IF;
 SELECT u.user_id,u.display_name INTO actor,prior_name FROM synapse.users u JOIN synapse.auth_identity_links l ON l.internal_user_id=u.user_id
 WHERE l.auth_user_id=subject AND l.revoked_at IS NULL AND u.account_status='ACTIVE' FOR UPDATE OF u FOR SHARE OF l;
 IF actor IS NULL THEN RAISE EXCEPTION 'Approved active identity required' USING ERRCODE='42501'; END IF;
 PERFORM a.user_id FROM synapse.user_role_assignments a JOIN synapse.roles r USING(role_id)
 WHERE a.user_id=actor AND r.is_active AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now())
 AND ((a.scope_type='GLOBAL' AND r.role_code='SYSTEM_ADMIN') OR EXISTS(SELECT FROM synapse.user_bureau_memberships m WHERE m.user_id=actor AND m.valid_from<=now() AND (m.valid_until IS NULL OR m.valid_until>now()) AND (a.scope_type='GLOBAL' OR a.bureau_id=m.bureau_id))) FOR SHARE OF a;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current role and membership required' USING ERRCODE='42501'; END IF;
 UPDATE synapse.users SET display_name=requested_name WHERE user_id=actor;
 UPDATE synapse_gateway.onboarding SET display_name=requested_name WHERE auth_user_id=subject;
 INSERT INTO synapse_gateway.account_audit(auth_user_id,actor_user_id,action,detail)
 VALUES(subject,actor,'PROFILE_NAME_UPDATED',jsonb_build_object('field','display_name','priorName',prior_name,'newName',requested_name));
 RETURN jsonb_build_object('saved',true,'displayName',requested_name);
END $$;
REVOKE ALL ON FUNCTION synapse_gateway.profile(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION synapse_gateway.profile(jsonb,jsonb) TO synapse_web_gateway;
RESET ROLE;
REVOKE CREATE ON SCHEMA synapse_gateway FROM synapse_account_manager;
GRANT synapse_account_manager TO postgres WITH INHERIT FALSE,SET FALSE;
