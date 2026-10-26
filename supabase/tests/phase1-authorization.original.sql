-- Run as the migration administrator, never through an application connection.
-- Every synthetic row and configuration change is rolled back. No Auth records are written.
-- Deferred FK permits synthetic signed-subject claims ONLY inside this uncommitted test.
BEGIN;
SELECT set_config('request.jwt.claim.sub','',true);
SET CONSTRAINTS synapse.auth_identity_links_auth_user_id_fkey DEFERRED;
CREATE TEMP TABLE phase1_test_ids (name text PRIMARY KEY,id uuid NOT NULL DEFAULT gen_random_uuid()) ON COMMIT DROP;
INSERT INTO phase1_test_ids(name) SELECT unnest(ARRAY[
  'bureauA','bureauB','institution','category','officer','other','head','auditor','admin','supervisor','reviewer',
  'authOfficer','authOther','authHead','authAuditor','authAdmin','authSupervisor','authReviewer','authUnknown',
  'caseOwn','caseOther','caseHidden','caseDisposed','caseDraft','grantReviewer','grantSupervisor']);
CREATE TEMP TABLE phase1_test_results(test text PRIMARY KEY) ON COMMIT DROP;
GRANT SELECT ON phase1_test_ids TO authenticated,anon,synapse_case_reader;
GRANT SELECT,INSERT ON phase1_test_results TO authenticated,anon,synapse_case_reader;
CREATE FUNCTION pg_temp.test_id(k text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM phase1_test_ids WHERE name=k $$;
CREATE FUNCTION pg_temp.assert_test(label text,condition boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %',label; END IF;
  INSERT INTO phase1_test_results VALUES(label); END $$;
CREATE FUNCTION pg_temp.expect_error(label text,statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text; detail text;
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE,detail=MESSAGE_TEXT; END;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'FAILED: %, expected %, got % (%)',label,expected,actual,detail; END IF;
  INSERT INTO phase1_test_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.claims(k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('sub',pg_temp.test_id(k),'role','authenticated',
    'user_metadata',jsonb_build_object('role','SYSTEM_ADMIN','bureau_id',pg_temp.test_id('bureauB')))::text $$;

INSERT INTO synapse.bureaus(bureau_id,bureau_code,bureau_name) VALUES
  (pg_temp.test_id('bureauA'),'PHASE1_TEST_A','Phase 1 test A'),(pg_temp.test_id('bureauB'),'PHASE1_TEST_B','Phase 1 test B');
INSERT INTO synapse.institutions(institution_id,canonical_name) VALUES(pg_temp.test_id('institution'),'Phase 1 synthetic institution');
INSERT INTO synapse.case_categories(category_id,category_code,category_name) VALUES(pg_temp.test_id('category'),'PHASE1_TEST','Phase 1 synthetic category');
INSERT INTO synapse.users(user_id,email,display_name,is_global_admin)
SELECT pg_temp.test_id(k),k||'@phase1-test.invalid','Synthetic '||k,k='admin'
FROM unnest(ARRAY['officer','other','head','auditor','admin','supervisor','reviewer'])k;
INSERT INTO synapse.auth_identity_links(auth_user_id,internal_user_id)
SELECT pg_temp.test_id(a),pg_temp.test_id(u) FROM (VALUES
  ('authOfficer','officer'),('authOther','other'),('authHead','head'),('authAuditor','auditor'),
  ('authAdmin','admin'),('authSupervisor','supervisor'),('authReviewer','reviewer'))x(a,u);
INSERT INTO synapse.user_bureau_memberships(user_id,bureau_id,membership_type,valid_from)
SELECT pg_temp.test_id(u),pg_temp.test_id(b),'MEMBER',now()-interval '2 days'
FROM (VALUES('officer','bureauA'),('other','bureauB'),('head','bureauA'),('auditor','bureauA'),('reviewer','bureauA'))x(u,b);
INSERT INTO synapse.user_role_assignments(user_id,role_id,scope_type,bureau_id,valid_from)
SELECT pg_temp.test_id(u),r.role_id,CASE WHEN b IS NULL THEN 'GLOBAL' ELSE 'BUREAU' END,
  pg_temp.test_id(b),now()-interval '2 days'
FROM (VALUES('officer','CASE_OFFICER','bureauA'),('other','CASE_OFFICER','bureauB'),('head','BUREAU_HEAD','bureauA'),
  ('auditor','AUDITOR','bureauA'),('admin','SYSTEM_ADMIN',NULL),('supervisor','SENIOR_MANAGEMENT',NULL),('reviewer','REVIEWER','bureauA'))x(u,role_code,b)
JOIN synapse.roles r ON r.role_code=x.role_code;

SELECT set_config('synapse.user_id',pg_temp.test_id('admin')::text,true);
-- Explicit synthetic numbers avoid nontransactional sequence advancement on the deployed DB.
INSERT INTO synapse.cases(case_id,case_number,institution_id,category_id,current_status_code,lead_bureau_id,accountable_officer_id,title,priority_code,created_by_user_id)
OVERRIDING SYSTEM VALUE
SELECT pg_temp.test_id(k),9000000000000000+row_number() OVER (ORDER BY k),pg_temp.test_id('institution'),pg_temp.test_id('category'),s,
  pg_temp.test_id(b),pg_temp.test_id(o),label,p,pg_temp.test_id('admin')
FROM (VALUES('caseOwn','NEW','bureauA','officer','Authorized own case','NORMAL'),
  ('caseOther','NEW','bureauA','other','Other officer same Bureau','HIGH'),
  ('caseHidden','NEW','bureauB','other','Hidden cross-Bureau case','URGENT'),
  ('caseDisposed','NEW','bureauA','officer','Disposed own case','LOW'),
  ('caseDraft','DRAFT','bureauA','officer','Unregistered draft excluded','NORMAL'))x(k,s,b,o,label,p);
SELECT set_config('synapse.workflow_action','STATUS_TRANSITION',true);
UPDATE synapse.cases SET current_status_code='UNDER_REVIEW' WHERE case_id=pg_temp.test_id('caseOther');
SELECT set_config('synapse.workflow_action','DISPOSE',true);
UPDATE synapse.cases SET current_status_code='DISPOSED',disposed_at=now() WHERE case_id=pg_temp.test_id('caseDisposed');
SELECT set_config('synapse.workflow_action','',true);
SELECT set_config('synapse.access_grant_workflow','APPROVE_REQUEST',true);
INSERT INTO synapse.case_access_grants(case_access_grant_id,case_id,user_id,granted_scope,granted_by_user_id,valid_from,valid_until) VALUES
  (pg_temp.test_id('grantReviewer'),pg_temp.test_id('caseOther'),pg_temp.test_id('reviewer'),'DETAILS',pg_temp.test_id('head'),now()-interval '1 day',now()+interval '1 day'),
  (pg_temp.test_id('grantSupervisor'),pg_temp.test_id('caseHidden'),pg_temp.test_id('supervisor'),'DETAILS',pg_temp.test_id('head'),now()-interval '1 day',now()+interval '1 day');
SELECT set_config('synapse.access_grant_workflow','',true);

SELECT pg_temp.assert_test('Reader is NOLOGIN, NOINHERIT and NOBYPASSRLS',
  (SELECT NOT rolcanlogin AND NOT rolbypassrls AND NOT rolinherit FROM pg_roles WHERE rolname='synapse_case_reader'));
SELECT pg_temp.assert_test('Reader owns no source tables',NOT EXISTS
  (SELECT FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE r.rolname='synapse_case_reader' AND c.relkind='r'));
SELECT pg_temp.assert_test('Every reader SELECT source is RLS protected',NOT EXISTS
  (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='synapse' AND c.relkind='r'
    AND has_any_column_privilege('synapse_case_reader',c.oid,'SELECT') AND NOT c.relrowsecurity));
SELECT pg_temp.assert_test('Reader has no table or column write privileges',NOT EXISTS
  (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='synapse' AND c.relkind='r'
    AND (has_any_column_privilege('synapse_case_reader',c.oid,'INSERT,UPDATE,REFERENCES') OR has_table_privilege('synapse_case_reader',c.oid,'DELETE,TRUNCATE,TRIGGER'))));
SELECT pg_temp.assert_test('Authenticated API still has no private schema usage',NOT has_schema_privilege('authenticated','synapse','USAGE'));
SELECT pg_temp.assert_test('Authenticated cannot SET ROLE to reader',NOT pg_has_role('authenticated','synapse_case_reader','MEMBER'));
SELECT pg_temp.assert_test('Reader has no managed Auth schema usage',NOT has_schema_privilege('synapse_case_reader','auth','USAGE'));
SELECT pg_temp.assert_test('Service-role API key is not an allowed registry principal',NOT has_function_privilege('service_role','public.synapse_phase1_cases(text,text,text,integer,integer,text)','EXECUTE'));
SELECT pg_temp.assert_test('Reader cannot execute legacy identity or bypass functions',
  NOT has_function_privilege('synapse_case_reader','synapse.current_user_id()','EXECUTE')
  AND NOT has_function_privilege('synapse_case_reader','synapse.can_view_case(uuid)','EXECUTE'));
SELECT pg_temp.assert_test('RPC owners enforce row security with fixed search path',
  (SELECT count(*)=2 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
    WHERE n.nspname='public' AND p.proname IN ('synapse_phase1_cases','synapse_phase1_me')
      AND r.rolname='synapse_case_reader' AND NOT r.rolbypassrls AND p.proconfig @> ARRAY['row_security=on','search_path=""']));

SELECT set_config('request.jwt.claims',pg_temp.claims('authOfficer'),true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error('Database read gate is disabled by default','SELECT public.synapse_phase1_me()','55000');
RESET ROLE;
UPDATE synapse.phase1_access_config SET read_enabled=true;

SET LOCAL ROLE anon;
SELECT pg_temp.expect_error('Anonymous cannot execute registry RPC','SELECT public.synapse_phase1_cases()','42501');
SELECT pg_temp.expect_error('Anonymous cannot execute identity RPC','SELECT public.synapse_phase1_me()','42501');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error('Missing Auth subject is rejected','SELECT public.synapse_phase1_me()','28000');
RESET ROLE;
SELECT set_config('request.jwt.claims',pg_temp.claims('authUnknown'),true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error('Unmapped Auth subject is rejected','SELECT public.synapse_phase1_cases()','42501');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"not-a-uuid","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error('Malformed Auth subject fails closed','SELECT public.synapse_phase1_me()','28000');
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.test_id('authOfficer'),'role','service_role')::text,true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error('Non-user JWT role cannot authorize a staff read','SELECT public.synapse_phase1_me()','28000');
RESET ROLE;
SELECT set_config('request.jwt.claims',pg_temp.claims('authOfficer'),true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_test('Identity comes from explicit Auth link, not forged metadata',
  public.synapse_phase1_me()->>'internalUserId'=pg_temp.test_id('officer')::text);
SELECT pg_temp.assert_test('Officer sees assigned registered cases only',
  public.synapse_phase1_cases()->>'total'='2');
SELECT pg_temp.assert_test('Same-Bureau other officer and cross-Bureau titles are absent',
  public.synapse_phase1_cases()::text NOT LIKE '%Other officer%' AND public.synapse_phase1_cases()::text NOT LIKE '%Hidden cross%');
SELECT pg_temp.assert_test('Drafts never enter registered case list',public.synapse_phase1_cases()::text NOT LIKE '%Unregistered draft%');
SELECT pg_temp.assert_test('Missing SLA remains null',public.synapse_phase1_cases()->'items'->0->'dueAt'='null'::jsonb);
SELECT pg_temp.assert_test('Case numbers and versions are strings',
  jsonb_typeof(public.synapse_phase1_cases()->'items'->0->'caseNumber')='string'
  AND jsonb_typeof(public.synapse_phase1_cases()->'items'->0->'version')='string');
SELECT pg_temp.assert_test('Search counts only authorized rows',public.synapse_phase1_cases(p_search=>'Hidden')->>'total'='0');
SELECT pg_temp.assert_test('Status filter preserves deployed lifecycle',public.synapse_phase1_cases(p_status=>'DISPOSED')->>'total'='1');
SELECT pg_temp.assert_test('Priority filter preserves deployed codes',public.synapse_phase1_cases(p_priority=>'NORMAL')->>'total'='1');
SELECT pg_temp.assert_test('Pagination total does not depend on current page',
  public.synapse_phase1_cases(p_page=>2,p_page_size=>1)->>'total'='2'
  AND jsonb_array_length(public.synapse_phase1_cases(p_page=>2,p_page_size=>1)->'items')=1);
SELECT pg_temp.assert_test('Out-of-range page is honest empty page with scoped total',
  public.synapse_phase1_cases(p_page=>3,p_page_size=>1)->>'total'='2'
  AND jsonb_array_length(public.synapse_phase1_cases(p_page=>3,p_page_size=>1)->'items')=0);
SELECT pg_temp.expect_error('Unreviewed canonical state is not accepted as deployed state',
  $q$SELECT public.synapse_phase1_cases(p_status=>'RESOLUTION_REVIEW')$q$,'22023');
SELECT pg_temp.expect_error('Oversized page is rejected','SELECT public.synapse_phase1_cases(p_page_size=>51)','22023');
SELECT pg_temp.expect_error('Invalid sort is rejected',$q$SELECT public.synapse_phase1_cases(p_sort=>'title;DROP TABLE cases')$q$,'22023');
SELECT pg_temp.expect_error('Authenticated cannot read private tables directly','SELECT case_id FROM synapse.cases','42501');
SELECT pg_temp.expect_error('Authenticated cannot invoke legacy disposal','SELECT synapse.dispose_case(null,null,null)','42501');
SELECT pg_temp.expect_error('Authenticated cannot write cases',$q$UPDATE synapse.cases SET title='forged'$q$,'42501');
RESET ROLE;

-- A stale legacy context naming the global admin never expands the new JWT-bound scope.
SELECT set_config('synapse.user_id',pg_temp.test_id('admin')::text,true);
SELECT set_config('request.jwt.claim.sub',pg_temp.test_id('authAdmin')::text,true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_test('Legacy browser actor setting cannot impersonate administrator',public.synapse_phase1_cases()->>'total'='2');
RESET ROLE;
SELECT set_config('request.jwt.claims',pg_temp.claims('authHead'),true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_test('Bureau Head sees own Bureau only',public.synapse_phase1_cases()->>'total'='3');
RESET ROLE;
SELECT set_config('request.jwt.claims',pg_temp.claims('authAuditor'),true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_test('Auditor reads only authorized Bureau',public.synapse_phase1_cases()->>'total'='3');
SELECT pg_temp.expect_error('Auditor has no task-write path',$q$UPDATE synapse.case_work_items SET title='forged'$q$,'42501');
RESET ROLE;
SELECT set_config('request.jwt.claims',pg_temp.claims('authAdmin'),true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_test('Global administrator flag gives no case-content bypass',public.synapse_phase1_cases()->>'total'='0');
SELECT pg_temp.assert_test('Empty authorized scope contains no record payload',jsonb_array_length(public.synapse_phase1_cases()->'items')=0);
RESET ROLE;
SELECT set_config('request.jwt.claims',pg_temp.claims('authSupervisor'),true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_test('Supervisor reads explicit delegation only',
  public.synapse_phase1_cases()->>'total'='1' AND public.synapse_phase1_cases()::text LIKE '%Hidden cross-Bureau%');
RESET ROLE;
SELECT set_config('request.jwt.claims',pg_temp.claims('authReviewer'),true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_test('Reviewer reads only explicit DETAILS grant',public.synapse_phase1_cases()->>'total'='1');
RESET ROLE;
SELECT set_config('synapse.access_grant_workflow','APPROVE_REQUEST',true);
UPDATE synapse.case_access_grants SET granted_scope='DOCUMENTS' WHERE case_access_grant_id=pg_temp.test_id('grantReviewer');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_test('DOCUMENTS grant alone does not confer registry details',public.synapse_phase1_cases()->>'total'='0');
RESET ROLE;
UPDATE synapse.case_access_grants SET granted_scope='DETAILS',valid_until=now()-interval '1 hour' WHERE case_access_grant_id=pg_temp.test_id('grantReviewer');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_test('Expired DETAILS grant is ignored immediately',public.synapse_phase1_cases()->>'total'='0');
RESET ROLE;
UPDATE synapse.case_access_grants SET valid_until=now()+interval '1 day',revoked_at=now(),revoke_reason='Synthetic revocation test' WHERE case_access_grant_id=pg_temp.test_id('grantReviewer');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_test('Revoked DETAILS grant is ignored immediately',public.synapse_phase1_cases()->>'total'='0');
RESET ROLE;
SELECT set_config('request.jwt.claims',pg_temp.claims('authOfficer'),true);
UPDATE synapse.users SET account_status='SUSPENDED' WHERE user_id=pg_temp.test_id('officer');
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error('Suspension invalidates mapped account reads','SELECT public.synapse_phase1_cases()','42501');
RESET ROLE;
UPDATE synapse.users SET account_status='ACTIVE' WHERE user_id=pg_temp.test_id('officer');
UPDATE synapse.user_role_assignments SET valid_until=now()-interval '1 hour' WHERE user_id=pg_temp.test_id('officer');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_test('Expired role revokes case reads without token refresh',public.synapse_phase1_cases()->>'total'='0');
RESET ROLE;
UPDATE synapse.user_role_assignments SET valid_until=NULL WHERE user_id=pg_temp.test_id('officer');
UPDATE synapse.user_bureau_memberships SET valid_until=now()-interval '1 hour' WHERE user_id=pg_temp.test_id('officer');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_test('Expired membership revokes Bureau-scoped role reads',public.synapse_phase1_cases()->>'total'='0');
RESET ROLE;
UPDATE synapse.user_bureau_memberships SET valid_until=NULL WHERE user_id=pg_temp.test_id('officer');
UPDATE synapse.auth_identity_links SET revoked_at=now() WHERE internal_user_id=pg_temp.test_id('officer');
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error('Revoked Auth link rejects reads','SELECT public.synapse_phase1_me()','42501');
RESET ROLE;
SELECT test FROM phase1_test_results ORDER BY test;
DO $$ BEGIN IF (SELECT count(*) FROM phase1_test_results)<>49 THEN RAISE EXCEPTION 'Unexpected assertion count'; END IF; END $$;
ROLLBACK;
SELECT 'PASS: all authorization assertions completed; fixtures and configuration rolled back' AS status,49 AS authorization_checks;
