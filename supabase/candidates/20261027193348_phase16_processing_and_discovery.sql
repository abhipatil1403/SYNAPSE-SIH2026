-- Additive hosted processing and metadata discovery. No release activation.
ALTER TABLE synapse_gateway.processing_jobs ADD COLUMN lease_token uuid,ADD COLUMN result jsonb,ADD COLUMN available_at timestamptz NOT NULL DEFAULT now();
GRANT SELECT(lease_token,result,available_at),UPDATE(lease_token,result,available_at) ON synapse_gateway.processing_jobs TO synapse_operations_runtime;
CREATE INDEX phase16_jobs_due ON synapse_gateway.processing_jobs(status,available_at,created_at);
CREATE INDEX phase16_cases_institution_recent ON synapse.cases(institution_id,received_at DESC);
CREATE INDEX phase16_cases_lexical ON synapse.cases USING gin(to_tsvector('simple',coalesce(title,'')||' '||coalesce(summary,'')));
ALTER TABLE synapse.submission_translations ADD COLUMN source_revision bigint CHECK(source_revision>0),ADD COLUMN review_state text NOT NULL DEFAULT 'NEEDS_REVIEW' CHECK(review_state IN('NEEDS_REVIEW','REVIEWED','SUPERSEDED'));
GRANT SELECT(source_revision,review_state),INSERT(translation_id,submission_id,source_language_code,target_language_code,translated_subject,translated_body,provider_name,provider_model_version,translation_version,provenance,source_revision,review_state),UPDATE(review_state) ON synapse.submission_translations TO synapse_operations_runtime;
GRANT INSERT(match_run_id,submission_id,algorithm_code,run_stage,run_status,parameters,completed_at) ON synapse.match_runs TO synapse_operations_runtime;
GRANT INSERT(match_candidate_id,match_run_id,candidate_case_id,match_classification,overall_score,feature_scores,explanation,review_status) ON synapse.match_candidates TO synapse_operations_runtime;
-- The preceding grants target separate canonical tables; never grant arbitrary model/config writes.
CREATE TABLE synapse_gateway.category_suggestions(submission_id uuid NOT NULL REFERENCES synapse.case_submissions(submission_id),source_revision bigint NOT NULL CHECK(source_revision>0),category_id uuid NOT NULL REFERENCES synapse.case_categories(category_id),similarity double precision NOT NULL CHECK(similarity BETWEEN -1 AND 1),model_version text NOT NULL,PRIMARY KEY(submission_id,source_revision,category_id));
ALTER TABLE synapse_gateway.category_suggestions ENABLE ROW LEVEL SECURITY;ALTER TABLE synapse_gateway.category_suggestions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON synapse_gateway.category_suggestions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT(submission_id,source_revision,category_id,similarity,model_version),INSERT(submission_id,source_revision,category_id,similarity,model_version) ON synapse_gateway.category_suggestions TO synapse_operations_runtime;
CREATE POLICY phase16_read ON synapse_gateway.category_suggestions FOR SELECT TO synapse_operations_runtime USING(synapse_gateway.ops_draft(submission_id,false));
CREATE POLICY phase16_insert ON synapse_gateway.category_suggestions FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND synapse_gateway.ops_draft(submission_id,true));
CREATE ROLE synapse_discovery_reader NOLOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT USAGE ON SCHEMA synapse,synapse_gateway TO synapse_discovery_reader;
GRANT SELECT(case_id,case_number,institution_id,category_id,lead_bureau_id,discoverable) ON synapse.cases TO synapse_discovery_reader;
GRANT synapse_case_reader TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA synapse_gateway TO synapse_case_reader;
SET LOCAL ROLE synapse_case_reader;
CREATE FUNCTION synapse_gateway.ops_discovery_allowed() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET row_security=on AS $$
 SELECT synapse_gateway.ops_actor() IS NOT NULL AND EXISTS(SELECT FROM synapse.user_role_assignments a JOIN synapse.roles r USING(role_id) JOIN synapse.user_bureau_memberships m ON m.user_id=a.user_id AND (a.scope_type='GLOBAL' OR a.bureau_id=m.bureau_id) WHERE a.user_id=synapse_gateway.ops_actor() AND r.is_active AND r.role_code IN('CASE_OFFICER','BUREAU_HEAD','AUDITOR') AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now()) AND m.valid_from<=now() AND (m.valid_until IS NULL OR m.valid_until>now()))
$$;
REVOKE ALL ON FUNCTION synapse_gateway.ops_discovery_allowed() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION synapse_gateway.ops_discovery_allowed() TO synapse_operations_runtime,synapse_discovery_reader;
RESET ROLE;
REVOKE CREATE ON SCHEMA synapse_gateway FROM synapse_case_reader;
GRANT synapse_case_reader TO postgres WITH INHERIT FALSE,SET FALSE;
CREATE POLICY phase16_discovery ON synapse.cases FOR SELECT TO synapse_discovery_reader USING(discoverable AND (SELECT synapse_gateway.ops_discovery_allowed()));
GRANT synapse_discovery_reader TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA synapse_gateway TO synapse_discovery_reader;
SET LOCAL ROLE synapse_discovery_reader;
CREATE FUNCTION synapse_gateway.ops_discovery() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET row_security=on AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.case_id,'caseNumber',c.case_number::text,'institutionId',c.institution_id,'categoryId',c.category_id,'bureauId',c.lead_bureau_id)),'[]'::jsonb) FROM (SELECT case_id,case_number,institution_id,category_id,lead_bureau_id FROM synapse.cases ORDER BY case_number DESC LIMIT 500) c
$$;
REVOKE ALL ON FUNCTION synapse_gateway.ops_discovery() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION synapse_gateway.ops_discovery() TO synapse_operations_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA synapse_gateway FROM synapse_discovery_reader;
GRANT synapse_discovery_reader TO postgres WITH INHERIT FALSE,SET FALSE;

GRANT synapse_discovery_reader TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA synapse_gateway TO synapse_discovery_reader;
SET LOCAL ROLE synapse_discovery_reader;
CREATE FUNCTION synapse_gateway.ops_discoverable(cid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET row_security=on AS $$SELECT EXISTS(SELECT FROM synapse.cases WHERE case_id=cid)$$;
REVOKE ALL ON FUNCTION synapse_gateway.ops_discoverable(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION synapse_gateway.ops_discoverable(uuid) TO synapse_operations_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA synapse_gateway FROM synapse_discovery_reader;
GRANT synapse_discovery_reader TO postgres WITH INHERIT FALSE,SET FALSE;
ALTER POLICY phase14_insert ON synapse.case_access_requests WITH CHECK(synapse_gateway.ops_write() AND requester_user_id=synapse_gateway.ops_actor() AND request_status='PENDING' AND approver_user_id IS NULL AND expires_at>now() AND expires_at<=now()+interval '7 days' AND (synapse_gateway.ops_scope(case_id,false,false) OR synapse_gateway.ops_discoverable(case_id)));

-- Queue real source work automatically, including the private Gmail insertion path.
GRANT USAGE ON SCHEMA synapse_gateway TO synapse_gmail_manager;
GRANT SELECT(id,submission_id,actor_id,kind,source_version),INSERT(submission_id,actor_id,kind,source_version) ON synapse_gateway.processing_jobs TO synapse_gmail_manager;
CREATE POLICY phase16_mail_jobs_read ON synapse_gateway.processing_jobs FOR SELECT TO synapse_gmail_manager USING(EXISTS(SELECT FROM synapse.case_submissions d WHERE d.submission_id=processing_jobs.submission_id AND d.mail_connection_id::text=current_setting('synapse.gmail_connection',true)));
CREATE POLICY phase16_mail_jobs_insert ON synapse_gateway.processing_jobs FOR INSERT TO synapse_gmail_manager WITH CHECK(EXISTS(SELECT FROM synapse.case_submissions d WHERE d.submission_id=processing_jobs.submission_id AND d.intake_owner_user_id=processing_jobs.actor_id AND d.mail_connection_id::text=current_setting('synapse.gmail_connection',true)));
CREATE FUNCTION synapse_gateway.enqueue_submission_processing() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.intake_bureau_id IS NULL OR coalesce(NEW.submitted_by_user_id,NEW.intake_owner_user_id) IS NULL OR NEW.submission_status NOT IN('DRAFT','UNDER_REVIEW') THEN RETURN NEW;END IF;
 IF TG_OP='INSERT' OR NEW.original_language_code IS DISTINCT FROM OLD.original_language_code OR NEW.institution_id IS DISTINCT FROM OLD.institution_id THEN
  INSERT INTO synapse_gateway.processing_jobs(submission_id,actor_id,kind,source_version) VALUES(NEW.submission_id,coalesce(NEW.submitted_by_user_id,NEW.intake_owner_user_id),'MATCH',NEW.row_version) ON CONFLICT(submission_id,kind,source_version) DO NOTHING;
  IF NEW.original_language_code IS DISTINCT FROM 'en' THEN INSERT INTO synapse_gateway.processing_jobs(submission_id,actor_id,kind,source_version) VALUES(NEW.submission_id,coalesce(NEW.submitted_by_user_id,NEW.intake_owner_user_id),'TRANSLATE',NEW.row_version) ON CONFLICT(submission_id,kind,source_version) DO NOTHING;END IF;
 END IF;RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION synapse_gateway.enqueue_submission_processing() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION synapse_gateway.enqueue_submission_processing() TO synapse_operations_runtime,synapse_gmail_manager;
CREATE TRIGGER phase16_submission_jobs AFTER INSERT OR UPDATE OF original_language_code,institution_id ON synapse.case_submissions FOR EACH ROW EXECUTE FUNCTION synapse_gateway.enqueue_submission_processing();

GRANT SELECT(intake_owner_user_id,mail_connection_id) ON synapse.case_submissions TO synapse_gmail_manager;

GRANT INSERT(grant_id) ON synapse.case_access_grant_approvals TO synapse_operations_runtime;

-- Active Bureau state is reference metadata, exposed only through a private boolean helper.
GRANT SELECT(bureau_id,is_active) ON synapse.bureaus TO synapse_discovery_reader;
CREATE POLICY phase16_discovery_bureau ON synapse.bureaus FOR SELECT TO synapse_discovery_reader USING(is_active);
GRANT synapse_discovery_reader TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA synapse_gateway TO synapse_discovery_reader;
SET LOCAL ROLE synapse_discovery_reader;
CREATE FUNCTION synapse_gateway.ops_active_bureau(bid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET row_security=on AS $$SELECT EXISTS(SELECT FROM synapse.bureaus WHERE bureau_id=bid AND is_active)$$;
REVOKE ALL ON FUNCTION synapse_gateway.ops_active_bureau(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION synapse_gateway.ops_active_bureau(uuid) TO synapse_case_reader,synapse_operations_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA synapse_gateway FROM synapse_discovery_reader;
GRANT synapse_discovery_reader TO postgres WITH INHERIT FALSE,SET FALSE;
ALTER POLICY phase16_discovery ON synapse.cases USING(discoverable AND synapse_gateway.ops_active_bureau(lead_bureau_id) AND (SELECT synapse_gateway.ops_discovery_allowed()));

-- Resolve verified identity once per helper invocation; retain RLS, expiry and tombstone checks.
GRANT synapse_case_reader TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA synapse_gateway TO synapse_case_reader;
SET LOCAL ROLE synapse_case_reader;
CREATE OR REPLACE FUNCTION synapse_gateway.ops_actor() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET row_security=on AS $$
 WITH actor AS MATERIALIZED(SELECT synapse.phase1_actor_id() id)
 SELECT id FROM actor WHERE id IS NOT NULL AND EXISTS(SELECT FROM synapse_gateway.operations_control WHERE enabled)
 AND EXISTS(SELECT FROM synapse.user_role_assignments a JOIN synapse.roles r USING(role_id) WHERE a.user_id=actor.id AND r.is_active AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now()) AND (r.role_code='SYSTEM_ADMIN' AND a.scope_type='GLOBAL' OR EXISTS(SELECT FROM synapse.user_bureau_memberships m WHERE m.user_id=a.user_id AND m.valid_from<=now() AND (m.valid_until IS NULL OR m.valid_until>now()) AND synapse_gateway.ops_active_bureau(m.bureau_id) AND (a.scope_type='GLOBAL' OR a.bureau_id=m.bureau_id))))
$$;
CREATE OR REPLACE FUNCTION synapse_gateway.ops_role(code text DEFAULT NULL,bureau uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET row_security=on AS $$
 WITH actor AS MATERIALIZED(SELECT synapse_gateway.ops_actor() id)
 SELECT actor.id IS NOT NULL AND EXISTS(SELECT FROM synapse.user_role_assignments a JOIN synapse.roles r USING(role_id) WHERE a.user_id=actor.id AND r.is_active AND (code IS NULL AND r.role_code<>'SYSTEM_ADMIN' OR r.role_code=code) AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now()) AND (bureau IS NULL AND a.scope_type='GLOBAL' OR bureau IS NOT NULL AND (a.scope_type='GLOBAL' OR a.bureau_id=bureau) AND EXISTS(SELECT FROM synapse.user_bureau_memberships m WHERE m.user_id=a.user_id AND m.bureau_id=bureau AND m.valid_from<=now() AND (m.valid_until IS NULL OR m.valid_until>now()) AND synapse_gateway.ops_active_bureau(m.bureau_id)))) FROM actor
$$;
CREATE OR REPLACE FUNCTION synapse_gateway.ops_member(bureau uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET row_security=on AS $$
 WITH actor AS MATERIALIZED(SELECT synapse_gateway.ops_actor() id)
 SELECT actor.id IS NOT NULL AND EXISTS(SELECT FROM synapse.user_bureau_memberships m WHERE m.user_id=actor.id AND m.bureau_id=bureau AND m.valid_from<=now() AND (m.valid_until IS NULL OR m.valid_until>now()) AND synapse_gateway.ops_active_bureau(m.bureau_id)) FROM actor
$$;
CREATE OR REPLACE FUNCTION synapse_gateway.ops_case(cid uuid,bid uuid,officer uuid,editing boolean DEFAULT false,documents boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET row_security=on AS $$
 WITH actor AS MATERIALIZED(SELECT synapse_gateway.ops_actor() id),members AS MATERIALIZED(SELECT m.bureau_id FROM synapse.user_bureau_memberships m,actor WHERE m.user_id=actor.id AND m.valid_from<=now() AND (m.valid_until IS NULL OR m.valid_until>now()) AND synapse_gateway.ops_active_bureau(m.bureau_id)),roles AS MATERIALIZED(SELECT r.role_code,a.scope_type,a.bureau_id FROM synapse.user_role_assignments a JOIN synapse.roles r USING(role_id),actor WHERE a.user_id=actor.id AND r.is_active AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now()))
 SELECT actor.id IS NOT NULL AND synapse_gateway.ops_active_bureau(bid) AND (
 EXISTS(SELECT FROM roles r WHERE r.role_code='BUREAU_HEAD' AND (r.scope_type='GLOBAL' OR r.bureau_id=bid) AND EXISTS(SELECT FROM members WHERE bureau_id=bid))
 OR NOT editing AND EXISTS(SELECT FROM roles r WHERE r.role_code='AUDITOR' AND (r.scope_type='GLOBAL' OR r.bureau_id=bid) AND EXISTS(SELECT FROM members WHERE bureau_id=bid))
 OR officer=actor.id AND EXISTS(SELECT FROM roles r WHERE r.role_code='CASE_OFFICER' AND (r.scope_type='GLOBAL' OR r.bureau_id=bid) AND EXISTS(SELECT FROM members WHERE bureau_id=bid))
 OR EXISTS(SELECT FROM synapse.case_access_grants g WHERE g.case_id=cid AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now()) AND (g.user_id=actor.id OR EXISTS(SELECT FROM members WHERE bureau_id=g.bureau_id)) AND (editing AND g.granted_scope='COORDINATE' AND EXISTS(SELECT FROM roles r WHERE r.role_code='CASE_OFFICER' AND (r.scope_type='GLOBAL' OR r.bureau_id=bid) AND EXISTS(SELECT FROM members WHERE bureau_id=bid)) OR NOT editing AND NOT documents AND g.granted_scope IN('DETAILS','COORDINATE') OR NOT editing AND documents AND g.granted_scope='DOCUMENTS')) AND (EXISTS(SELECT FROM members WHERE bureau_id=bid) OR EXISTS(SELECT FROM roles WHERE role_code<>'SYSTEM_ADMIN'))
 ) FROM actor
$$;
RESET ROLE;
REVOKE CREATE ON SCHEMA synapse_gateway FROM synapse_case_reader;
GRANT synapse_case_reader TO postgres WITH INHERIT FALSE,SET FALSE;
