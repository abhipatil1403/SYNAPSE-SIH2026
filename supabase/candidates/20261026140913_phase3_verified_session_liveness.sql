-- CANDIDATE ONLY. Requires a principal authorized to manage auth.sessions policy/ACL
-- AND application functions/roles. Never run automatically or with current operator.
-- Owner preflight runs before any mutation. No read gate or business-write enablement.
DO $review$ BEGIN
 IF NOT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid='auth.sessions'::regclass),'USAGE') THEN
   RAISE EXCEPTION 'Authorized auth.sessions policy owner is required; migration remains unapplied' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='synapse_session_validator') THEN
   RAISE EXCEPTION 'Unexpected existing session validator; review drift before applying'; END IF;
END $review$;
CREATE ROLE synapse_session_validator NOLOGIN NOINHERIT NOBYPASSRLS;
GRANT USAGE ON SCHEMA auth,synapse TO synapse_session_validator;
GRANT SELECT(id,user_id,not_after) ON auth.sessions TO synapse_session_validator;
CREATE POLICY synapse_phase3_current_session ON auth.sessions FOR SELECT TO synapse_session_validator
 USING (id=(SELECT synapse.phase2_session_id()) AND user_id=(SELECT synapse.phase2_verified_subject()));
GRANT EXECUTE ON FUNCTION synapse.phase2_verified_subject(),synapse.phase2_session_id() TO synapse_session_validator;
CREATE FUNCTION synapse.phase3_session_is_active() RETURNS boolean LANGUAGE sql STABLE
 SECURITY DEFINER SET search_path='' SET row_security=on AS $function$
 SELECT synapse.phase2_verified_subject() IS NOT NULL AND EXISTS(
  SELECT FROM auth.sessions s WHERE s.id=synapse.phase2_session_id()
   AND s.user_id=synapse.phase2_verified_subject() AND (s.not_after IS NULL OR s.not_after>now()))
$function$;
REVOKE ALL ON FUNCTION synapse.phase3_session_is_active() FROM PUBLIC,anon,authenticated,service_role;
-- Only migration administrator temporarily assumes the new function-owner role.
GRANT synapse_session_validator TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA synapse TO synapse_session_validator;
ALTER FUNCTION synapse.phase3_session_is_active() OWNER TO synapse_session_validator;
SET LOCAL ROLE synapse_session_validator;
GRANT EXECUTE ON FUNCTION synapse.phase3_session_is_active() TO synapse_case_reader;
RESET ROLE;
REVOKE CREATE ON SCHEMA synapse FROM synapse_session_validator;
GRANT synapse_session_validator TO postgres WITH INHERIT FALSE,SET FALSE;
CREATE OR REPLACE FUNCTION synapse.phase1_auth_subject() RETURNS uuid LANGUAGE sql STABLE
 SECURITY INVOKER SET search_path='' AS $function$
 SELECT synapse.phase2_verified_subject() WHERE synapse.phase2_verified_subject() IS NOT NULL
  AND synapse.phase3_session_is_active()
  AND NOT EXISTS(SELECT FROM synapse.auth_session_revocations r WHERE r.session_id=synapse.phase2_session_id())
$function$;
-- The private helper is not exposed through public RPC. Current-session-only logout
-- remains idempotent even after provider removal; no protected business data is returned.
