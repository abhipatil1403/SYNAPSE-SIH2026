-- Synthetic claim-policy tests, not real issued JWTs. Every row is rolled back.
BEGIN;
CREATE TEMP TABLE phase2_results(test text PRIMARY KEY) ON COMMIT DROP;
GRANT SELECT,INSERT ON phase2_results TO authenticated,synapse_case_reader,synapse_session_revoker;
CREATE FUNCTION pg_temp.p2assert(label text,condition boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %',label; END IF;
  INSERT INTO phase2_results VALUES(label); END $$;
CREATE FUNCTION pg_temp.p2error(label text,statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text;
BEGIN BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE; END;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'FAILED: %, expected %, got %',label,expected,actual; END IF;
  INSERT INTO phase2_results VALUES(label); END $$;

SELECT pg_temp.p2assert('Revoker is NOLOGIN NOBYPASSRLS NOINHERIT',
  (SELECT NOT rolcanlogin AND NOT rolbypassrls AND NOT rolinherit FROM pg_roles WHERE rolname='synapse_session_revoker'));
SELECT pg_temp.p2assert('Revoker cannot read cases or documents',
  NOT has_any_column_privilege('synapse_session_revoker','synapse.cases','SELECT') AND NOT has_any_column_privilege('synapse_session_revoker','synapse.documents','SELECT'));
SELECT pg_temp.p2assert('Revoker has no business-table writes',NOT EXISTS(
  SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='synapse' AND c.relkind='r' AND c.relname<>'auth_session_revocations'
  AND (has_any_column_privilege('synapse_session_revoker',c.oid,'INSERT,UPDATE') OR has_table_privilege('synapse_session_revoker',c.oid,'DELETE,TRUNCATE'))));
SELECT pg_temp.p2assert('Revocation table forces RLS',(SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='synapse.auth_session_revocations'::regclass));
SELECT pg_temp.p2assert('Anonymous and service role cannot invoke logout RPC',
  NOT has_function_privilege('anon','public.synapse_phase2_revoke_session()','EXECUTE') AND NOT has_function_privilege('service_role','public.synapse_phase2_revoke_session()','EXECUTE'));
SELECT pg_temp.p2assert('Authenticated cannot assume either internal role',
  NOT pg_has_role('authenticated','synapse_session_revoker','MEMBER') AND NOT pg_has_role('authenticated','synapse_case_reader','MEMBER'));
SELECT pg_temp.p2assert('Reader remains unable to insert revocations',NOT has_any_column_privilege('synapse_case_reader','synapse.auth_session_revocations','INSERT'));
SELECT pg_temp.p2assert('Session RPC owner uses fixed search path and RLS',(SELECT p.proowner='synapse_session_revoker'::regrole AND p.proconfig @> ARRAY['row_security=on','search_path=""'] FROM pg_proc p WHERE oid='public.synapse_phase2_revoke_session()'::regprocedure));

SELECT set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'session_id',gen_random_uuid(),'role','authenticated','exp',extract(epoch FROM now())-1)::text,true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.p2error('Expired subject cannot revoke session','SELECT public.synapse_phase2_revoke_session()','28000');
SELECT pg_temp.p2error('Expired subject cannot read identity','SELECT public.synapse_phase1_me()','28000');
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated','exp',extract(epoch FROM now())+3600)::text,true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.p2error('Missing session ID is rejected','SELECT public.synapse_phase2_revoke_session()','28000');
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'session_id','invalid','role','authenticated','exp',extract(epoch FROM now())+3600)::text,true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.p2error('Malformed session ID is rejected','SELECT public.synapse_phase2_revoke_session()','28000');
RESET ROLE;
CREATE TEMP TABLE phase2_claims(name text PRIMARY KEY,claims jsonb) ON COMMIT DROP;
INSERT INTO phase2_claims VALUES('A',jsonb_build_object('sub',gen_random_uuid(),'session_id',gen_random_uuid(),'role','authenticated','exp',extract(epoch FROM now())+3600)),('B',jsonb_build_object('sub',gen_random_uuid(),'session_id',gen_random_uuid(),'role','authenticated','exp',extract(epoch FROM now())+3600));
GRANT SELECT ON phase2_claims TO authenticated,synapse_case_reader;
SELECT set_config('request.jwt.claims',(SELECT claims::text FROM phase2_claims WHERE name='A'),true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.p2assert('Current session can be revoked',public.synapse_phase2_revoke_session());
SELECT pg_temp.p2assert('Repeated logout is idempotent',public.synapse_phase2_revoke_session());
SELECT pg_temp.p2error('Logged-out access JWT cannot read registry','SELECT public.synapse_phase1_cases()','28000');
RESET ROLE;
SET LOCAL ROLE synapse_case_reader;
SELECT pg_temp.p2assert('Logged-out subject is denied immediately',synapse.phase1_auth_subject() IS NULL);
RESET ROLE;
SELECT set_config('request.jwt.claims',(SELECT claims::text FROM phase2_claims WHERE name='B'),true);
SET LOCAL ROLE synapse_case_reader;
SELECT pg_temp.p2assert('Second account session is not revoked',synapse.phase1_auth_subject() IS NOT NULL);
SELECT pg_temp.p2assert('Second account cannot read first session revocation',(SELECT count(*)=0 FROM synapse.auth_session_revocations));
RESET ROLE;
-- Count this transaction's synthetic sessions; existing real tombstones must survive untouched.
SELECT pg_temp.p2assert('Only the first session was revoked',(SELECT count(*)=1 FROM synapse.auth_session_revocations
  WHERE session_id IN (SELECT (claims->>'session_id')::uuid FROM phase2_claims)));
UPDATE synapse.phase1_access_config SET read_enabled=true,read_until=now()-interval '1 second';
SET LOCAL ROLE authenticated;
SELECT pg_temp.p2error('Expired read lease fails closed','SELECT public.synapse_phase1_cases()','55000');
RESET ROLE;
SELECT test FROM phase2_results ORDER BY test;
ROLLBACK;
