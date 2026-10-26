-- Fail closed for absent optimistic versions and absent bounded assignment fields.
-- The trusted HTTP API validates these too; SQL must not interpret NULL expiry
-- as an unrestricted membership. Current approver locks remain unchanged.
GRANT synapse_account_manager TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA synapse_gateway TO synapse_account_manager;
SET LOCAL ROLE synapse_account_manager;
CREATE OR REPLACE FUNCTION synapse_gateway.account(p_claims jsonb,p_operation text,p_input jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $guard$
DECLARE actor uuid;
BEGIN
 IF p_operation='decide' THEN
  IF coalesce(p_input->>'revision','') !~ '^[1-9][0-9]*$' OR (p_input->>'decision'='APPROVED' AND
    (coalesce(p_input->>'until','')='' OR coalesce(p_input->>'bureauId','')='' OR coalesce(p_input->>'role','')='')) THEN
    RAISE EXCEPTION 'Version and bounded approval fields required' USING ERRCODE='22023'; END IF;
  SELECT u.user_id INTO actor FROM synapse.users u JOIN synapse.auth_identity_links l ON l.internal_user_id=u.user_id
    WHERE l.auth_user_id=(p_claims->>'sub')::uuid AND l.revoked_at IS NULL AND u.account_status='ACTIVE' FOR SHARE OF u,l;
  IF actor IS NULL THEN RAISE EXCEPTION 'Current administrator required' USING ERRCODE='42501'; END IF;
  PERFORM a.user_id FROM synapse.user_role_assignments a JOIN synapse.roles r USING(role_id)
    WHERE a.user_id=actor AND a.scope_type='GLOBAL' AND r.role_code='SYSTEM_ADMIN' AND r.is_active
    AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now()) FOR SHARE OF a;
  IF NOT FOUND THEN RAISE EXCEPTION 'Current administrator required' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN synapse_gateway.account_locked_impl(p_claims,p_operation,p_input);
END $guard$;
RESET ROLE;
REVOKE CREATE ON SCHEMA synapse_gateway FROM synapse_account_manager;
GRANT synapse_account_manager TO postgres WITH INHERIT FALSE,SET FALSE;
