-- LOCAL simulated managed session rows; never an issued-JWT/hosted certification.
BEGIN;
CREATE TEMP TABLE phase3_test_claims AS SELECT gen_random_uuid() subject,gen_random_uuid() sid,gen_random_uuid() other_sid;
GRANT SELECT ON phase3_test_claims TO synapse_case_reader,synapse_session_validator;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',subject,'session_id',sid,'role','authenticated','exp',extract(epoch FROM now())+3600)::text,true) FROM phase3_test_claims;
INSERT INTO auth.sessions(id,user_id,not_after) SELECT sid,subject,now()+interval '1 hour' FROM phase3_test_claims;
GRANT synapse_case_reader TO postgres WITH SET TRUE;
SET LOCAL ROLE synapse_case_reader;
DO $$ BEGIN IF synapse.phase1_auth_subject() IS NULL THEN RAISE EXCEPTION 'Live provider session must be accepted'; END IF; END $$;
RESET ROLE;
-- Provider-only logout deletes the row; an unchanged unexpired JWT must now fail.
DELETE FROM auth.sessions WHERE id=(SELECT sid FROM phase3_test_claims);
SET LOCAL ROLE synapse_case_reader;
DO $$ BEGIN IF synapse.phase1_auth_subject() IS NOT NULL THEN RAISE EXCEPTION 'Provider-only logout replay must fail'; END IF; END $$;
RESET ROLE;
-- A different user's session with the original session ID does not authenticate.
INSERT INTO auth.sessions(id,user_id) SELECT sid,gen_random_uuid() FROM phase3_test_claims;
SET LOCAL ROLE synapse_case_reader;
DO $$ BEGIN IF synapse.phase1_auth_subject() IS NOT NULL THEN RAISE EXCEPTION 'Cross-subject session must fail'; END IF; END $$;
RESET ROLE;
UPDATE auth.sessions SET user_id=(SELECT subject FROM phase3_test_claims),not_after=now()-interval '1 second';
SET LOCAL ROLE synapse_case_reader;
DO $$ BEGIN IF synapse.phase1_auth_subject() IS NOT NULL THEN RAISE EXCEPTION 'Provider session expiry must fail'; END IF; END $$;
RESET ROLE;
DO $$ BEGIN
 IF has_function_privilege('authenticated','synapse.phase3_session_is_active()','EXECUTE') OR
    has_function_privilege('anon','synapse.phase3_session_is_active()','EXECUTE') OR
    has_function_privilege('service_role','synapse.phase3_session_is_active()','EXECUTE') THEN RAISE EXCEPTION 'Private session helper exposed'; END IF;
 IF has_schema_privilege('synapse_case_reader','auth','USAGE') THEN RAISE EXCEPTION 'Reader gained Auth schema access'; END IF;
 IF (SELECT rolbypassrls OR rolcanlogin OR rolinherit FROM pg_roles WHERE rolname='synapse_session_validator') THEN RAISE EXCEPTION 'Validator role is unsafe'; END IF;
 IF has_column_privilege('synapse_session_validator','auth.sessions','refresh_token','SELECT') THEN RAISE EXCEPTION 'Validator can read provider secrets'; END IF;
END $$;
ROLLBACK;
