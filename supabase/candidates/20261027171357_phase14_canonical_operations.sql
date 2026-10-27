-- Canonical hosted operations. Additive schema reconciliation; no data reset.
-- Source schemas stay unexposed. The runtime is NOLOGIN/NOBYPASSRLS and owns no table.
-- Deployment activation remains disabled until the reviewed migration and security checks pass.
CREATE ROLE synapse_operations_runtime NOLOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT USAGE ON SCHEMA synapse,synapse_gateway TO synapse_operations_runtime;
ALTER TABLE synapse.case_submissions ADD COLUMN intake_bureau_id uuid REFERENCES synapse.bureaus(bureau_id),
 ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0),
 ADD COLUMN human_verified boolean NOT NULL DEFAULT false,
 ADD COLUMN course_hint text CHECK(length(course_hint)<=200), ADD COLUMN issue_hint text CHECK(length(issue_hint)<=200),
 ADD COLUMN category_hint uuid REFERENCES synapse.case_categories(category_id);
ALTER TABLE synapse.institutions ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0), ADD COLUMN region_label text;
ALTER TABLE synapse.cases ADD COLUMN discoverable boolean NOT NULL DEFAULT false;
ALTER TABLE synapse.case_transfers ADD COLUMN requested_case_version bigint CHECK(requested_case_version>0);
CREATE INDEX phase14_submission_scope ON synapse.case_submissions(intake_bureau_id,submitted_by_user_id,received_at DESC);
CREATE UNIQUE INDEX phase14_institution_permanent_id ON synapse.institution_identifiers(upper(identifier_value)) WHERE identifier_type='AICTE_PERMANENT_ID';
CREATE TABLE synapse_gateway.operations_control(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false,
 writes_enabled boolean NOT NULL DEFAULT false, revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), release_review text, approved_by uuid REFERENCES synapse.users(user_id), approved_at timestamptz,
 CHECK(NOT enabled OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND length(release_review)>10)),CHECK(NOT writes_enabled OR enabled));
INSERT INTO synapse_gateway.operations_control(singleton) VALUES(true);
CREATE TABLE synapse_gateway.operation_receipts(user_id uuid NOT NULL REFERENCES synapse.users(user_id),request_id uuid NOT NULL,input text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,request_id));
CREATE TABLE synapse_gateway.calendar_events(id uuid PRIMARY KEY,case_id uuid NOT NULL REFERENCES synapse.cases(case_id),title text NOT NULL,at timestamptz NOT NULL,
 kind text NOT NULL CHECK(kind IN('HEARING','REVIEW','APPROVAL','BUREAU_ACTIVITY')),cancelled_at timestamptz,cancelled_by uuid REFERENCES synapse.users(user_id),created_by uuid NOT NULL REFERENCES synapse.users(user_id));
CREATE INDEX phase14_event_case ON synapse_gateway.calendar_events(case_id,at);
CREATE TABLE synapse_gateway.evaluation_fingerprints(evaluation_id uuid PRIMARY KEY REFERENCES synapse.closure_evaluations(closure_evaluation_id),case_id uuid NOT NULL REFERENCES synapse.cases(case_id),fingerprint text NOT NULL CHECK(length(fingerprint)=64),checks jsonb NOT NULL);
CREATE TABLE synapse_gateway.document_bytes(version_id uuid PRIMARY KEY REFERENCES synapse.document_versions(document_version_id),case_id uuid NOT NULL REFERENCES synapse.cases(case_id),bytes bytea NOT NULL CHECK(octet_length(bytes)<=2097152));
CREATE TABLE synapse_gateway.processing_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),submission_id uuid NOT NULL REFERENCES synapse.case_submissions(submission_id),actor_id uuid NOT NULL REFERENCES synapse.users(user_id),
 kind text NOT NULL CHECK(kind IN('MATCH','TRANSLATE')),source_version bigint NOT NULL,status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN('QUEUED','RUNNING','COMPLETED','BLOCKED','FAILED','SUPERSEDED')),
 attempts integer NOT NULL DEFAULT 0,lease_until timestamptz,error_code text,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,UNIQUE(submission_id,kind,source_version));
REVOKE ALL ON synapse_gateway.operations_control,synapse_gateway.operation_receipts,synapse_gateway.calendar_events,synapse_gateway.evaluation_fingerprints,synapse_gateway.document_bytes,synapse_gateway.processing_jobs FROM PUBLIC,anon,authenticated,service_role;
-- Existing gateway principals retain their original explicit grants.
GRANT synapse_case_reader TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA synapse_gateway TO synapse_case_reader;
GRANT SELECT(enabled,writes_enabled) ON synapse_gateway.operations_control TO synapse_case_reader;
ALTER TABLE synapse_gateway.operations_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE synapse_gateway.operations_control FORCE ROW LEVEL SECURITY;
CREATE POLICY phase14_control_reader ON synapse_gateway.operations_control FOR SELECT TO synapse_case_reader,synapse_operations_runtime USING(true);
SET LOCAL ROLE synapse_case_reader;
CREATE FUNCTION synapse_gateway.ops_actor() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET row_security=on AS $$
 SELECT synapse.phase1_actor_id() WHERE synapse.phase2_verified_subject() IS NOT NULL AND EXISTS(SELECT FROM synapse_gateway.operations_control WHERE enabled)
 AND EXISTS(SELECT FROM synapse.user_role_assignments a JOIN synapse.roles r USING(role_id) WHERE a.user_id=synapse.phase1_actor_id() AND r.is_active AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now())
 AND (r.role_code='SYSTEM_ADMIN' AND a.scope_type='GLOBAL' OR EXISTS(SELECT FROM synapse.user_bureau_memberships m WHERE m.user_id=a.user_id AND m.valid_from<=now() AND (m.valid_until IS NULL OR m.valid_until>now()) AND (a.scope_type='GLOBAL' OR a.bureau_id=m.bureau_id))))
$$;
CREATE FUNCTION synapse_gateway.ops_role(code text DEFAULT NULL,bureau uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET row_security=on AS $$
 SELECT synapse_gateway.ops_actor() IS NOT NULL AND EXISTS(SELECT FROM synapse.user_role_assignments a JOIN synapse.roles r USING(role_id)
 WHERE a.user_id=synapse_gateway.ops_actor() AND r.is_active AND (code IS NULL AND r.role_code<>'SYSTEM_ADMIN' OR r.role_code=code)
 AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now())
 AND (bureau IS NULL AND a.scope_type='GLOBAL' OR bureau IS NOT NULL AND (a.scope_type='GLOBAL' OR a.bureau_id=bureau)
 AND EXISTS(SELECT FROM synapse.user_bureau_memberships m WHERE m.user_id=a.user_id AND m.bureau_id=bureau AND m.valid_from<=now() AND (m.valid_until IS NULL OR m.valid_until>now()))))
$$;
CREATE FUNCTION synapse_gateway.ops_member(bureau uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET row_security=on AS $$
 SELECT synapse_gateway.ops_actor() IS NOT NULL AND EXISTS(SELECT FROM synapse.user_bureau_memberships m WHERE m.user_id=synapse_gateway.ops_actor() AND m.bureau_id=bureau AND m.valid_from<=now() AND (m.valid_until IS NULL OR m.valid_until>now()))
$$;
CREATE FUNCTION synapse_gateway.ops_case(cid uuid,bid uuid,officer uuid,editing boolean DEFAULT false,documents boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET row_security=on AS $$
 SELECT synapse_gateway.ops_actor() IS NOT NULL AND (
 synapse_gateway.ops_role('BUREAU_HEAD',bid)
 OR NOT editing AND synapse_gateway.ops_role('AUDITOR',bid)
 OR synapse_gateway.ops_role('CASE_OFFICER',bid) AND officer=synapse_gateway.ops_actor()
 OR EXISTS(SELECT FROM synapse.case_access_grants g WHERE g.case_id=cid AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
 AND (g.user_id=synapse_gateway.ops_actor() OR synapse_gateway.ops_member(g.bureau_id))
 AND (editing AND g.granted_scope='COORDINATE' AND synapse_gateway.ops_role('CASE_OFFICER',bid)
 OR NOT editing AND NOT documents AND g.granted_scope IN('DETAILS','COORDINATE')
 OR NOT editing AND documents AND g.granted_scope='DOCUMENTS'))
 AND (synapse_gateway.ops_member(bid) OR EXISTS(SELECT FROM synapse.user_role_assignments a JOIN synapse.roles r USING(role_id) WHERE a.user_id=synapse_gateway.ops_actor() AND r.role_code<>'SYSTEM_ADMIN' AND r.is_active))
 )
$$;
CREATE FUNCTION synapse_gateway.ops_write() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET row_security=on AS $$SELECT coalesce((SELECT writes_enabled FROM synapse_gateway.operations_control WHERE enabled),false) AND synapse_gateway.ops_actor() IS NOT NULL$$;
RESET ROLE;
REVOKE CREATE ON SCHEMA synapse_gateway FROM synapse_case_reader;
GRANT synapse_case_reader TO postgres WITH INHERIT FALSE,SET FALSE;
REVOKE ALL ON FUNCTION synapse_gateway.ops_actor(),synapse_gateway.ops_role(text,uuid),synapse_gateway.ops_member(uuid),synapse_gateway.ops_case(uuid,uuid,uuid,boolean,boolean),synapse_gateway.ops_write() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION synapse_gateway.ops_actor(),synapse_gateway.ops_role(text,uuid),synapse_gateway.ops_member(uuid),synapse_gateway.ops_case(uuid,uuid,uuid,boolean,boolean),synapse_gateway.ops_write() TO synapse_operations_runtime,synapse_case_reader;
CREATE FUNCTION synapse_gateway.ops_scope(cid uuid,editing boolean DEFAULT false,documents boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM synapse.cases c WHERE c.case_id=cid AND synapse_gateway.ops_case(c.case_id,c.lead_bureau_id,c.accountable_officer_id,editing,documents))
$$;
CREATE FUNCTION synapse_gateway.ops_draft(sid uuid,editing boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM synapse.case_submissions d WHERE d.submission_id=sid AND (NOT editing OR (d.submitted_by_user_id=synapse_gateway.ops_actor() AND (synapse_gateway.ops_role('CASE_OFFICER',d.intake_bureau_id) OR synapse_gateway.ops_role('BUREAU_HEAD',d.intake_bureau_id)) OR synapse_gateway.ops_role('BUREAU_HEAD',d.intake_bureau_id))))
$$;
REVOKE ALL ON FUNCTION synapse_gateway.ops_scope(uuid,boolean,boolean),synapse_gateway.ops_draft(uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION synapse_gateway.ops_scope(uuid,boolean,boolean),synapse_gateway.ops_draft(uuid,boolean) TO synapse_operations_runtime;

DO $narrow$ DECLARE p record; BEGIN FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='synapse' AND 'public'=ANY(roles) AND tablename=ANY(ARRAY['users','auth_identity_links','user_bureau_memberships','user_role_assignments','roles','bureaus','case_categories','institutions','institution_identifiers','cases','case_submissions','submission_case_links','case_assignments','case_work_items','case_comments','case_relationships','notifications','audit_events','case_status_history','case_access_requests','case_access_grants','case_access_grant_approvals','case_transfers','case_transfer_approvals','policy_sources','policy_versions','closure_checklists','closure_checklist_versions','closure_requirements','closure_evaluations','closure_evaluation_items','closure_approvals','sla_policies','sla_policy_versions','sla_instances','sla_events','regulatory_actions','regulatory_action_participants','conflict_findings','conflict_finding_actions','contradiction_findings','evidence_claims','documents','document_versions','evidence_items','submission_translations','match_runs','match_candidates']) LOOP EXECUTE format('ALTER POLICY %I ON synapse.%I TO synapse_app,synapse_ingest',p.policyname,p.tablename);END LOOP;END $narrow$;
ALTER TABLE synapse.users ENABLE ROW LEVEL SECURITY;
GRANT SELECT(user_id,display_name,account_status) ON synapse.users TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.users FOR SELECT TO synapse_operations_runtime USING((SELECT synapse_gateway.ops_actor()) IS NOT NULL AND account_status='ACTIVE');
ALTER TABLE synapse.auth_identity_links ENABLE ROW LEVEL SECURITY;
GRANT SELECT(auth_user_id,internal_user_id,revoked_at) ON synapse.auth_identity_links TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.auth_identity_links FOR SELECT TO synapse_operations_runtime USING((SELECT synapse_gateway.ops_actor()) IS NOT NULL AND revoked_at IS NULL);
ALTER TABLE synapse.user_bureau_memberships ENABLE ROW LEVEL SECURITY;
GRANT SELECT(user_id,bureau_id,valid_from,valid_until) ON synapse.user_bureau_memberships TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.user_bureau_memberships FOR SELECT TO synapse_operations_runtime USING((SELECT synapse_gateway.ops_actor()) IS NOT NULL AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()));
ALTER TABLE synapse.user_role_assignments ENABLE ROW LEVEL SECURITY;
GRANT SELECT(user_id,role_id,scope_type,bureau_id,valid_from,valid_until) ON synapse.user_role_assignments TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.user_role_assignments FOR SELECT TO synapse_operations_runtime USING((SELECT synapse_gateway.ops_actor()) IS NOT NULL AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()));
ALTER TABLE synapse.roles ENABLE ROW LEVEL SECURITY;
GRANT SELECT(role_id,role_code,is_active) ON synapse.roles TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.roles FOR SELECT TO synapse_operations_runtime USING((SELECT synapse_gateway.ops_actor()) IS NOT NULL AND is_active);
ALTER TABLE synapse.bureaus ENABLE ROW LEVEL SECURITY;
GRANT SELECT(bureau_id,bureau_name,is_active) ON synapse.bureaus TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.bureaus FOR SELECT TO synapse_operations_runtime USING((SELECT synapse_gateway.ops_actor()) IS NOT NULL AND is_active);
ALTER TABLE synapse.case_categories ENABLE ROW LEVEL SECURITY;
GRANT SELECT(category_id,category_name,is_active) ON synapse.case_categories TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.case_categories FOR SELECT TO synapse_operations_runtime USING((SELECT synapse_gateway.ops_actor()) IS NOT NULL AND is_active);
GRANT INSERT(category_id,category_code,category_name,is_active) ON synapse.case_categories TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.case_categories FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)));
-- No runtime UPDATE privilege: immutable case_categories.
CREATE POLICY phase14_update ON synapse.case_categories FOR UPDATE TO synapse_operations_runtime USING(synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)) WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)));
ALTER TABLE synapse.institutions ENABLE ROW LEVEL SECURITY;
GRANT SELECT(institution_id,canonical_name,institution_type,region_id,address_line1,address_line2,city,district,state_name,postal_code,country_code,institution_status,source_system,source_record_id,created_at,updated_at,row_version,region_label) ON synapse.institutions TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.institutions FOR SELECT TO synapse_operations_runtime USING((SELECT synapse_gateway.ops_actor()) IS NOT NULL);
GRANT INSERT(institution_id,canonical_name,state_name,region_label,row_version,updated_at) ON synapse.institutions TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.institutions FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND ((SELECT synapse_gateway.ops_actor()) IS NOT NULL));
GRANT UPDATE(canonical_name,state_name,region_label,row_version,updated_at) ON synapse.institutions TO synapse_operations_runtime;
CREATE POLICY phase14_update ON synapse.institutions FOR UPDATE TO synapse_operations_runtime USING((SELECT synapse_gateway.ops_actor()) IS NOT NULL) WITH CHECK(synapse_gateway.ops_write() AND ((SELECT synapse_gateway.ops_actor()) IS NOT NULL));
ALTER TABLE synapse.institution_identifiers ENABLE ROW LEVEL SECURITY;
GRANT SELECT(institution_identifier_id,institution_id,identifier_type,identifier_value,issuing_authority,valid_from,valid_until,is_primary,created_at) ON synapse.institution_identifiers TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.institution_identifiers FOR SELECT TO synapse_operations_runtime USING((SELECT synapse_gateway.ops_actor()) IS NOT NULL);
GRANT INSERT(institution_identifier_id,institution_id,identifier_type,identifier_value,issuing_authority,is_primary) ON synapse.institution_identifiers TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.institution_identifiers FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND ((SELECT synapse_gateway.ops_actor()) IS NOT NULL));
-- No runtime UPDATE privilege: immutable institution_identifiers.
CREATE POLICY phase14_update ON synapse.institution_identifiers FOR UPDATE TO synapse_operations_runtime USING((SELECT synapse_gateway.ops_actor()) IS NOT NULL) WITH CHECK(synapse_gateway.ops_write() AND ((SELECT synapse_gateway.ops_actor()) IS NOT NULL));
ALTER TABLE synapse.cases ENABLE ROW LEVEL SECURITY;
GRANT SELECT(case_id,case_number,institution_id,campus_id,category_id,current_status_code,lead_bureau_id,accountable_officer_id,title,summary,priority_code,confidentiality_level,received_at,opened_at,disposed_at,created_by_user_id,created_at,updated_at,row_version,discoverable) ON synapse.cases TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.cases FOR SELECT TO synapse_operations_runtime USING(current_status_code<>'DRAFT' AND synapse_gateway.ops_case(case_id,lead_bureau_id,accountable_officer_id,false,false));
GRANT INSERT(case_id,case_number,institution_id,category_id,current_status_code,lead_bureau_id,accountable_officer_id,title,summary,priority_code,received_at,created_by_user_id,discoverable) ON synapse.cases TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.cases FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_case(case_id,lead_bureau_id,accountable_officer_id,true,false)));
GRANT UPDATE(current_status_code,lead_bureau_id,accountable_officer_id,title,summary,priority_code,disposed_at,discoverable) ON synapse.cases TO synapse_operations_runtime;
CREATE POLICY phase14_update ON synapse.cases FOR UPDATE TO synapse_operations_runtime USING(synapse_gateway.ops_case(case_id,lead_bureau_id,accountable_officer_id,true,false)) WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_case(case_id,lead_bureau_id,accountable_officer_id,true,false)));
ALTER TABLE synapse.case_submissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT(submission_id,inbound_message_id,source_type,source_reference,institution_id,submitted_by_user_id,complainant_reference,original_language_code,original_subject,original_body,submission_status,duplicate_of_submission_id,received_at,reviewed_by_user_id,reviewed_at,review_reason,created_at,intake_bureau_id,row_version,human_verified,course_hint,issue_hint,category_hint) ON synapse.case_submissions TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.case_submissions FOR SELECT TO synapse_operations_runtime USING(submitted_by_user_id=(SELECT synapse_gateway.ops_actor()) AND synapse_gateway.ops_member(intake_bureau_id) OR synapse_gateway.ops_role('BUREAU_HEAD',intake_bureau_id));
GRANT INSERT(submission_id,source_type,source_reference,submitted_by_user_id,intake_bureau_id,original_subject,original_body,received_at,institution_id,submission_status,human_verified,reviewed_by_user_id,reviewed_at,review_reason,row_version,original_language_code,course_hint,issue_hint,category_hint) ON synapse.case_submissions TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.case_submissions FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (submitted_by_user_id=(SELECT synapse_gateway.ops_actor()) AND synapse_gateway.ops_member(intake_bureau_id) OR synapse_gateway.ops_role('BUREAU_HEAD',intake_bureau_id)));
GRANT UPDATE(institution_id,submission_status,human_verified,reviewed_by_user_id,reviewed_at,review_reason,row_version,original_language_code,course_hint,issue_hint,category_hint) ON synapse.case_submissions TO synapse_operations_runtime;
CREATE POLICY phase14_update ON synapse.case_submissions FOR UPDATE TO synapse_operations_runtime USING(submitted_by_user_id=(SELECT synapse_gateway.ops_actor()) AND synapse_gateway.ops_member(intake_bureau_id) OR synapse_gateway.ops_role('BUREAU_HEAD',intake_bureau_id)) WITH CHECK(synapse_gateway.ops_write() AND (submitted_by_user_id=(SELECT synapse_gateway.ops_actor()) AND synapse_gateway.ops_member(intake_bureau_id) OR synapse_gateway.ops_role('BUREAU_HEAD',intake_bureau_id)));
ALTER TABLE synapse.submission_case_links ENABLE ROW LEVEL SECURITY;
GRANT SELECT(submission_id,case_id,link_type,confirmed_by_user_id,confirmed_at) ON synapse.submission_case_links TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.submission_case_links FOR SELECT TO synapse_operations_runtime USING(synapse_gateway.ops_draft(submission_id,false) AND synapse_gateway.ops_scope(case_id,false,false));
GRANT INSERT(submission_id,case_id,link_type,confirmed_by_user_id,confirmed_at) ON synapse.submission_case_links TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.submission_case_links FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_draft(submission_id,false) AND synapse_gateway.ops_scope(case_id,false,false)));
ALTER TABLE synapse.case_assignments ENABLE ROW LEVEL SECURITY;
GRANT SELECT(case_assignment_id,case_id,bureau_id,officer_id,assignment_role,valid_from,valid_until,assigned_by_user_id,reason,created_at) ON synapse.case_assignments TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.case_assignments FOR SELECT TO synapse_operations_runtime USING(synapse_gateway.ops_scope(case_id,false,false));
-- No runtime INSERT privilege: case_assignments.
CREATE POLICY phase14_insert ON synapse.case_assignments FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(case_id,false,false)));
-- No runtime UPDATE privilege: immutable case_assignments.
CREATE POLICY phase14_update ON synapse.case_assignments FOR UPDATE TO synapse_operations_runtime USING(synapse_gateway.ops_scope(case_id,false,false)) WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(case_id,false,false)));
ALTER TABLE synapse.case_work_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT(work_item_id,case_id,bureau_id,assigned_to_user_id,work_item_type,title,description,status_code,due_at,completed_at,created_by_user_id,created_at,updated_at) ON synapse.case_work_items TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.case_work_items FOR SELECT TO synapse_operations_runtime USING(synapse_gateway.ops_scope(case_id,false,false));
GRANT INSERT(work_item_id,case_id,bureau_id,assigned_to_user_id,work_item_type,created_by_user_id,title,status_code,due_at,completed_at,updated_at) ON synapse.case_work_items TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.case_work_items FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(case_id,true,false)));
GRANT UPDATE(title,status_code,due_at,completed_at,updated_at) ON synapse.case_work_items TO synapse_operations_runtime;
CREATE POLICY phase14_update ON synapse.case_work_items FOR UPDATE TO synapse_operations_runtime USING(synapse_gateway.ops_scope(case_id,true,false)) WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(case_id,true,false)));
ALTER TABLE synapse.case_comments ENABLE ROW LEVEL SECURITY;
GRANT SELECT(case_comment_id,case_id,work_item_id,author_user_id,comment_body,visibility,created_at,edited_at) ON synapse.case_comments TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.case_comments FOR SELECT TO synapse_operations_runtime USING(synapse_gateway.ops_scope(case_id,false,false));
GRANT INSERT(case_comment_id,case_id,author_user_id,comment_body,visibility,created_at) ON synapse.case_comments TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.case_comments FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(case_id,true,false)));
ALTER TABLE synapse.case_relationships ENABLE ROW LEVEL SECURITY;
GRANT SELECT(case_relationship_id,source_case_id,target_case_id,relationship_type,relationship_status,proposed_by_user_id,reviewed_by_user_id,rationale,source_conflict_finding_id,created_at,reviewed_at) ON synapse.case_relationships TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.case_relationships FOR SELECT TO synapse_operations_runtime USING(synapse_gateway.ops_scope(source_case_id,false,false) AND synapse_gateway.ops_scope(target_case_id,false,false));
GRANT INSERT(case_relationship_id,source_case_id,target_case_id,relationship_type,proposed_by_user_id,relationship_status,reviewed_by_user_id,rationale,reviewed_at) ON synapse.case_relationships TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.case_relationships FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(source_case_id,true,false) AND synapse_gateway.ops_scope(target_case_id,false,false)));
GRANT UPDATE(relationship_status,reviewed_by_user_id,rationale,reviewed_at) ON synapse.case_relationships TO synapse_operations_runtime;
CREATE POLICY phase14_update ON synapse.case_relationships FOR UPDATE TO synapse_operations_runtime USING(synapse_gateway.ops_scope(source_case_id,true,false) AND synapse_gateway.ops_scope(target_case_id,false,false)) WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(source_case_id,true,false) AND synapse_gateway.ops_scope(target_case_id,false,false)));
ALTER TABLE synapse.notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT(notification_id,recipient_user_id,notification_type,subject,body,related_case_id,created_at,read_at) ON synapse.notifications TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.notifications FOR SELECT TO synapse_operations_runtime USING(recipient_user_id=(SELECT synapse_gateway.ops_actor()) AND (related_case_id IS NULL OR synapse_gateway.ops_scope(related_case_id,false,false)));
GRANT INSERT(notification_id,recipient_user_id,notification_type,subject,body,related_case_id,created_at,read_at) ON synapse.notifications TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.notifications FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(related_case_id,false,false)));
GRANT UPDATE(read_at) ON synapse.notifications TO synapse_operations_runtime;
CREATE POLICY phase14_update ON synapse.notifications FOR UPDATE TO synapse_operations_runtime USING(synapse_gateway.ops_scope(related_case_id,false,false)) WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(related_case_id,false,false)));
ALTER TABLE synapse.audit_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT(audit_event_id,actor_user_id,event_type,entity_type,entity_id,occurred_at,reason) ON synapse.audit_events TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.audit_events FOR SELECT TO synapse_operations_runtime USING(actor_user_id=(SELECT synapse_gateway.ops_actor()) OR entity_type='case' AND synapse_gateway.ops_scope(entity_id,false,false));
GRANT INSERT(audit_event_id,actor_user_id,event_type,entity_type,entity_id,occurred_at,reason) ON synapse.audit_events TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.audit_events FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (actor_user_id=(SELECT synapse_gateway.ops_actor())));
ALTER TABLE synapse.case_status_history ENABLE ROW LEVEL SECURITY;
GRANT SELECT(case_status_history_id,case_id,from_status_code,to_status_code,changed_by_user_id,change_reason,changed_at) ON synapse.case_status_history TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.case_status_history FOR SELECT TO synapse_operations_runtime USING(synapse_gateway.ops_scope(case_id,false,false));
GRANT INSERT(case_status_history_id,case_id,from_status_code,to_status_code,changed_by_user_id,change_reason,changed_at) ON synapse.case_status_history TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.case_status_history FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(case_id,true,false)));
ALTER TABLE synapse.case_access_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT(case_access_request_id,case_id,requester_user_id,requested_scope,reason,request_status,approver_user_id,requested_at,decided_at,expires_at,decision_reason) ON synapse.case_access_requests TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.case_access_requests FOR SELECT TO synapse_operations_runtime USING(requester_user_id=(SELECT synapse_gateway.ops_actor()) OR synapse_gateway.ops_scope(case_id,false,false));
GRANT INSERT(case_access_request_id,case_id,requester_user_id,requested_scope,reason,expires_at,request_status,approver_user_id,decided_at,decision_reason) ON synapse.case_access_requests TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.case_access_requests FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (requester_user_id=(SELECT synapse_gateway.ops_actor()) OR synapse_gateway.ops_scope(case_id,false,false)));
GRANT UPDATE(request_status,approver_user_id,decided_at,decision_reason) ON synapse.case_access_requests TO synapse_operations_runtime;
CREATE POLICY phase14_update ON synapse.case_access_requests FOR UPDATE TO synapse_operations_runtime USING(requester_user_id=(SELECT synapse_gateway.ops_actor()) OR synapse_gateway.ops_scope(case_id,false,false)) WITH CHECK(synapse_gateway.ops_write() AND (requester_user_id=(SELECT synapse_gateway.ops_actor()) OR synapse_gateway.ops_scope(case_id,false,false)));
ALTER TABLE synapse.case_access_grants ENABLE ROW LEVEL SECURITY;
GRANT SELECT(case_access_grant_id,case_id,user_id,bureau_id,granted_scope,granted_by_user_id,source_request_id,valid_from,valid_until,revoked_at,revoke_reason) ON synapse.case_access_grants TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.case_access_grants FOR SELECT TO synapse_operations_runtime USING(user_id=(SELECT synapse_gateway.ops_actor()) OR synapse_gateway.ops_member(bureau_id) OR synapse_gateway.ops_scope(case_id,true,false));
GRANT INSERT(case_access_grant_id,case_id,user_id,granted_scope,granted_by_user_id,source_request_id,valid_from,valid_until) ON synapse.case_access_grants TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.case_access_grants FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (user_id=(SELECT synapse_gateway.ops_actor()) OR synapse_gateway.ops_member(bureau_id) OR synapse_gateway.ops_scope(case_id,true,false)));
GRANT UPDATE(revoked_at,revoke_reason) ON synapse.case_access_grants TO synapse_operations_runtime;
CREATE POLICY phase14_update ON synapse.case_access_grants FOR UPDATE TO synapse_operations_runtime USING(user_id=(SELECT synapse_gateway.ops_actor()) OR synapse_gateway.ops_member(bureau_id) OR synapse_gateway.ops_scope(case_id,true,false)) WITH CHECK(synapse_gateway.ops_write() AND (user_id=(SELECT synapse_gateway.ops_actor()) OR synapse_gateway.ops_member(bureau_id) OR synapse_gateway.ops_scope(case_id,true,false)));
ALTER TABLE synapse.case_access_grant_approvals ENABLE ROW LEVEL SECURITY;
GRANT SELECT(case_access_grant_approval_id,case_access_request_id,case_id,approver_user_id,approving_bureau_id,decision,decision_reason,decided_at,grant_id) ON synapse.case_access_grant_approvals TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.case_access_grant_approvals FOR SELECT TO synapse_operations_runtime USING(synapse_gateway.ops_scope(case_id,false,false));
GRANT INSERT(case_access_grant_approval_id,case_access_request_id,case_id,approver_user_id,approving_bureau_id,decision,decision_reason,decided_at) ON synapse.case_access_grant_approvals TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.case_access_grant_approvals FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(case_id,false,false)));
ALTER TABLE synapse.case_transfers ENABLE ROW LEVEL SECURITY;
GRANT SELECT(case_transfer_id,case_id,from_bureau_id,to_bureau_id,from_officer_id,to_officer_id,requested_by_user_id,approved_by_user_id,transfer_status,reason,requested_at,decided_at,completed_at,requested_case_version) ON synapse.case_transfers TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.case_transfers FOR SELECT TO synapse_operations_runtime USING(synapse_gateway.ops_scope(case_id,false,false) OR synapse_gateway.ops_role('BUREAU_HEAD',to_bureau_id));
GRANT INSERT(case_transfer_id,case_id,from_bureau_id,to_bureau_id,from_officer_id,to_officer_id,requested_by_user_id,transfer_status,reason,requested_case_version) ON synapse.case_transfers TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.case_transfers FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(case_id,false,false) OR synapse_gateway.ops_role('BUREAU_HEAD',to_bureau_id)));
GRANT UPDATE(transfer_status,approved_by_user_id,decided_at,completed_at) ON synapse.case_transfers TO synapse_operations_runtime;
CREATE POLICY phase14_update ON synapse.case_transfers FOR UPDATE TO synapse_operations_runtime USING(synapse_gateway.ops_scope(case_id,false,false) OR synapse_gateway.ops_role('BUREAU_HEAD',to_bureau_id)) WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(case_id,false,false) OR synapse_gateway.ops_role('BUREAU_HEAD',to_bureau_id)));
ALTER TABLE synapse.case_transfer_approvals ENABLE ROW LEVEL SECURITY;
GRANT SELECT(case_transfer_approval_id,case_transfer_id,approval_side,approver_user_id,decision,decision_reason,decided_at) ON synapse.case_transfer_approvals TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.case_transfer_approvals FOR SELECT TO synapse_operations_runtime USING(EXISTS(SELECT FROM synapse.case_transfers t WHERE t.case_transfer_id=case_transfer_approvals.case_transfer_id));
GRANT INSERT(case_transfer_approval_id,case_transfer_id,approval_side,approver_user_id,decision,decision_reason,decided_at) ON synapse.case_transfer_approvals TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.case_transfer_approvals FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (EXISTS(SELECT FROM synapse.case_transfers t WHERE t.case_transfer_id=case_transfer_approvals.case_transfer_id)));
ALTER TABLE synapse.policy_sources ENABLE ROW LEVEL SECURITY;
GRANT SELECT(policy_source_id,source_code,title,issuing_authority,source_uri,source_type,created_at) ON synapse.policy_sources TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.policy_sources FOR SELECT TO synapse_operations_runtime USING((SELECT synapse_gateway.ops_actor()) IS NOT NULL);
GRANT INSERT(policy_source_id,source_code,title,issuing_authority,source_type) ON synapse.policy_sources TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.policy_sources FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)));
-- No runtime UPDATE privilege: immutable policy_sources.
CREATE POLICY phase14_update ON synapse.policy_sources FOR UPDATE TO synapse_operations_runtime USING(synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)) WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)));
ALTER TABLE synapse.policy_versions ENABLE ROW LEVEL SECURITY;
GRANT SELECT(policy_version_id,policy_source_id,version_label,effective_from,effective_until,content_hash,approved_by_user_id,approved_at,status,created_at) ON synapse.policy_versions TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.policy_versions FOR SELECT TO synapse_operations_runtime USING((SELECT synapse_gateway.ops_actor()) IS NOT NULL);
GRANT INSERT(policy_version_id,policy_source_id,version_label,effective_from,effective_until,approved_by_user_id,approved_at,status) ON synapse.policy_versions TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.policy_versions FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)));
-- No runtime UPDATE privilege: immutable policy_versions.
CREATE POLICY phase14_update ON synapse.policy_versions FOR UPDATE TO synapse_operations_runtime USING(synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)) WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)));
ALTER TABLE synapse.closure_checklists ENABLE ROW LEVEL SECURITY;
GRANT SELECT(closure_checklist_id,checklist_code,checklist_name,category_id,is_active) ON synapse.closure_checklists TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.closure_checklists FOR SELECT TO synapse_operations_runtime USING((SELECT synapse_gateway.ops_actor()) IS NOT NULL);
GRANT INSERT(closure_checklist_id,checklist_code,checklist_name,is_active) ON synapse.closure_checklists TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.closure_checklists FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)));
-- No runtime UPDATE privilege: immutable closure_checklists.
CREATE POLICY phase14_update ON synapse.closure_checklists FOR UPDATE TO synapse_operations_runtime USING(synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)) WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)));
ALTER TABLE synapse.closure_checklist_versions ENABLE ROW LEVEL SECURITY;
GRANT SELECT(closure_checklist_version_id,closure_checklist_id,version_number,policy_version_id,effective_from,effective_until,approved_by_user_id,approved_at,status) ON synapse.closure_checklist_versions TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.closure_checklist_versions FOR SELECT TO synapse_operations_runtime USING((SELECT synapse_gateway.ops_actor()) IS NOT NULL);
GRANT INSERT(closure_checklist_version_id,closure_checklist_id,version_number,policy_version_id,effective_from,effective_until,approved_by_user_id,approved_at,status) ON synapse.closure_checklist_versions TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.closure_checklist_versions FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)));
-- No runtime UPDATE privilege: immutable closure_checklist_versions.
CREATE POLICY phase14_update ON synapse.closure_checklist_versions FOR UPDATE TO synapse_operations_runtime USING(synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)) WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)));
ALTER TABLE synapse.closure_requirements ENABLE ROW LEVEL SECURITY;
GRANT SELECT(closure_requirement_id,closure_checklist_version_id,requirement_code,requirement_text,requirement_type,is_mandatory,blocks_disposal,sort_order) ON synapse.closure_requirements TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.closure_requirements FOR SELECT TO synapse_operations_runtime USING((SELECT synapse_gateway.ops_actor()) IS NOT NULL);
GRANT INSERT(closure_requirement_id,closure_checklist_version_id,requirement_code,requirement_text,requirement_type,is_mandatory,blocks_disposal,sort_order) ON synapse.closure_requirements TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.closure_requirements FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)));
-- No runtime UPDATE privilege: immutable closure_requirements.
CREATE POLICY phase14_update ON synapse.closure_requirements FOR UPDATE TO synapse_operations_runtime USING(synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)) WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)));
ALTER TABLE synapse.closure_evaluations ENABLE ROW LEVEL SECURITY;
GRANT SELECT(closure_evaluation_id,case_id,closure_checklist_version_id,evaluation_status,evaluated_by_user_id,evaluated_at,evaluation_summary,is_final) ON synapse.closure_evaluations TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.closure_evaluations FOR SELECT TO synapse_operations_runtime USING(synapse_gateway.ops_scope(case_id,false,false));
GRANT INSERT(closure_evaluation_id,case_id,closure_checklist_version_id,evaluation_status,evaluated_by_user_id,evaluated_at,evaluation_summary,is_final) ON synapse.closure_evaluations TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.closure_evaluations FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(case_id,true,false)));
-- No runtime UPDATE privilege: immutable closure_evaluations.
CREATE POLICY phase14_update ON synapse.closure_evaluations FOR UPDATE TO synapse_operations_runtime USING(synapse_gateway.ops_scope(case_id,true,false)) WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(case_id,true,false)));
ALTER TABLE synapse.closure_evaluation_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT(closure_evaluation_id,closure_requirement_id,result_code,evidence_item_id,notes) ON synapse.closure_evaluation_items TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.closure_evaluation_items FOR SELECT TO synapse_operations_runtime USING(EXISTS(SELECT FROM synapse.closure_evaluations e WHERE e.closure_evaluation_id=closure_evaluation_items.closure_evaluation_id));
GRANT INSERT(closure_evaluation_id,closure_requirement_id,result_code,notes) ON synapse.closure_evaluation_items TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.closure_evaluation_items FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (EXISTS(SELECT FROM synapse.closure_evaluations e WHERE e.closure_evaluation_id=closure_evaluation_items.closure_evaluation_id)));
ALTER TABLE synapse.closure_approvals ENABLE ROW LEVEL SECURITY;
GRANT SELECT(closure_approval_id,case_id,closure_evaluation_id,approver_user_id,decision,decision_reason,decided_at) ON synapse.closure_approvals TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.closure_approvals FOR SELECT TO synapse_operations_runtime USING(synapse_gateway.ops_scope(case_id,false,false));
GRANT INSERT(closure_approval_id,case_id,closure_evaluation_id,approver_user_id,decision,decision_reason,decided_at) ON synapse.closure_approvals TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.closure_approvals FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(case_id,true,false)));
ALTER TABLE synapse.sla_policies ENABLE ROW LEVEL SECURITY;
GRANT SELECT(sla_policy_id,policy_code,policy_name,description,is_active) ON synapse.sla_policies TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.sla_policies FOR SELECT TO synapse_operations_runtime USING((SELECT synapse_gateway.ops_actor()) IS NOT NULL);
GRANT INSERT(sla_policy_id,policy_code,policy_name,is_active) ON synapse.sla_policies TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.sla_policies FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)));
-- No runtime UPDATE privilege: immutable sla_policies.
CREATE POLICY phase14_update ON synapse.sla_policies FOR UPDATE TO synapse_operations_runtime USING(synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)) WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)));
ALTER TABLE synapse.sla_policy_versions ENABLE ROW LEVEL SECURITY;
GRANT SELECT(sla_policy_version_id,sla_policy_id,version_number,policy_version_id,applies_to_category_id,applies_to_work_item_type,start_event_code,duration_minutes,calendar_code,pause_conditions,warning_threshold_minutes,escalation_after_minutes,effective_from,effective_until,approved_by_user_id,approved_at,created_at) ON synapse.sla_policy_versions TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.sla_policy_versions FOR SELECT TO synapse_operations_runtime USING((SELECT synapse_gateway.ops_actor()) IS NOT NULL);
GRANT INSERT(sla_policy_version_id,sla_policy_id,version_number,policy_version_id,start_event_code,duration_minutes,effective_from,effective_until,approved_by_user_id,approved_at) ON synapse.sla_policy_versions TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.sla_policy_versions FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)));
-- No runtime UPDATE privilege: immutable sla_policy_versions.
CREATE POLICY phase14_update ON synapse.sla_policy_versions FOR UPDATE TO synapse_operations_runtime USING(synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)) WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)));
ALTER TABLE synapse.sla_instances ENABLE ROW LEVEL SECURITY;
GRANT SELECT(sla_instance_id,sla_policy_version_id,case_id,work_item_id,cycle_number,started_at,original_due_at,current_due_at,sla_status,completed_at,created_at) ON synapse.sla_instances TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.sla_instances FOR SELECT TO synapse_operations_runtime USING(synapse_gateway.ops_scope(case_id,false,false));
GRANT INSERT(sla_instance_id,sla_policy_version_id,case_id,work_item_id,cycle_number,started_at,original_due_at,current_due_at,sla_status) ON synapse.sla_instances TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.sla_instances FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(case_id,true,false)));
GRANT UPDATE(sla_status,completed_at) ON synapse.sla_instances TO synapse_operations_runtime;
CREATE POLICY phase14_update ON synapse.sla_instances FOR UPDATE TO synapse_operations_runtime USING(synapse_gateway.ops_scope(case_id,true,false)) WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(case_id,true,false)));
ALTER TABLE synapse.sla_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT(sla_event_id,sla_instance_id,event_type,occurred_at,actor_user_id,reason,previous_due_at,new_due_at,policy_version_id) ON synapse.sla_events TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.sla_events FOR SELECT TO synapse_operations_runtime USING(EXISTS(SELECT FROM synapse.sla_instances i WHERE i.sla_instance_id=sla_events.sla_instance_id));
GRANT INSERT(sla_event_id,sla_instance_id,event_type,actor_user_id,reason,occurred_at,new_due_at,policy_version_id) ON synapse.sla_events TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.sla_events FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (EXISTS(SELECT FROM synapse.sla_instances i WHERE i.sla_instance_id=sla_events.sla_instance_id)));
ALTER TABLE synapse.regulatory_actions ENABLE ROW LEVEL SECURITY;
GRANT SELECT(regulatory_action_id,institution_id,case_id,lead_bureau_id,action_type,action_title,action_status,planned_start_at,planned_end_at,actual_start_at,actual_end_at,policy_version_id,created_by_user_id,created_at,updated_at) ON synapse.regulatory_actions TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.regulatory_actions FOR SELECT TO synapse_operations_runtime USING(synapse_gateway.ops_scope(case_id,false,false));
GRANT INSERT(regulatory_action_id,institution_id,case_id,lead_bureau_id,action_type,action_title,action_status,planned_start_at,planned_end_at,created_by_user_id) ON synapse.regulatory_actions TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.regulatory_actions FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(case_id,true,false)));
-- No runtime UPDATE privilege: immutable regulatory_actions.
CREATE POLICY phase14_update ON synapse.regulatory_actions FOR UPDATE TO synapse_operations_runtime USING(synapse_gateway.ops_scope(case_id,true,false)) WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(case_id,true,false)));
ALTER TABLE synapse.regulatory_action_participants ENABLE ROW LEVEL SECURITY;
GRANT SELECT(regulatory_action_id,bureau_id,participant_role,added_by_user_id,added_at) ON synapse.regulatory_action_participants TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.regulatory_action_participants FOR SELECT TO synapse_operations_runtime USING(EXISTS(SELECT FROM synapse.regulatory_actions a WHERE a.regulatory_action_id=regulatory_action_participants.regulatory_action_id));
-- No runtime INSERT privilege: regulatory_action_participants.
CREATE POLICY phase14_insert ON synapse.regulatory_action_participants FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (EXISTS(SELECT FROM synapse.regulatory_actions a WHERE a.regulatory_action_id=regulatory_action_participants.regulatory_action_id)));
ALTER TABLE synapse.conflict_findings ENABLE ROW LEVEL SECURITY;
GRANT SELECT(conflict_finding_id,conflict_rule_id,institution_id,finding_status,severity_code,confidence,explanation,triggering_facts,detected_at,reviewed_by_user_id,reviewed_at,review_reason,resolution_notes,resolved_at) ON synapse.conflict_findings TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.conflict_findings FOR SELECT TO synapse_operations_runtime USING((SELECT synapse_gateway.ops_actor()) IS NOT NULL AND EXISTS(SELECT FROM synapse.cases c WHERE c.institution_id=conflict_findings.institution_id));
GRANT INSERT(conflict_finding_id,institution_id,severity_code,explanation,triggering_facts,finding_status,reviewed_by_user_id,reviewed_at,review_reason) ON synapse.conflict_findings TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.conflict_findings FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND ((SELECT synapse_gateway.ops_actor()) IS NOT NULL AND EXISTS(SELECT FROM synapse.cases c WHERE c.institution_id=conflict_findings.institution_id)));
GRANT UPDATE(finding_status,reviewed_by_user_id,reviewed_at,review_reason) ON synapse.conflict_findings TO synapse_operations_runtime;
CREATE POLICY phase14_update ON synapse.conflict_findings FOR UPDATE TO synapse_operations_runtime USING((SELECT synapse_gateway.ops_actor()) IS NOT NULL AND EXISTS(SELECT FROM synapse.cases c WHERE c.institution_id=conflict_findings.institution_id)) WITH CHECK(synapse_gateway.ops_write() AND ((SELECT synapse_gateway.ops_actor()) IS NOT NULL AND EXISTS(SELECT FROM synapse.cases c WHERE c.institution_id=conflict_findings.institution_id)));
ALTER TABLE synapse.conflict_finding_actions ENABLE ROW LEVEL SECURITY;
GRANT SELECT(conflict_finding_id,regulatory_action_id,relation_to_finding) ON synapse.conflict_finding_actions TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.conflict_finding_actions FOR SELECT TO synapse_operations_runtime USING(EXISTS(SELECT FROM synapse.regulatory_actions a WHERE a.regulatory_action_id=conflict_finding_actions.regulatory_action_id));
GRANT INSERT(conflict_finding_id,regulatory_action_id,relation_to_finding) ON synapse.conflict_finding_actions TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.conflict_finding_actions FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (EXISTS(SELECT FROM synapse.regulatory_actions a WHERE a.regulatory_action_id=conflict_finding_actions.regulatory_action_id)));
ALTER TABLE synapse.contradiction_findings ENABLE ROW LEVEL SECURITY;
GRANT SELECT(contradiction_finding_id,claim_a_id,claim_b_id,finding_status,contradiction_type,explanation,confidence,model_name,model_version,rule_version,detected_at,reviewed_by_user_id,reviewed_at,review_reason) ON synapse.contradiction_findings TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.contradiction_findings FOR SELECT TO synapse_operations_runtime USING(EXISTS(SELECT FROM synapse.evidence_claims c WHERE c.evidence_claim_id=contradiction_findings.claim_a_id) AND EXISTS(SELECT FROM synapse.evidence_claims c WHERE c.evidence_claim_id=contradiction_findings.claim_b_id));
-- No runtime INSERT privilege: contradiction_findings.
CREATE POLICY phase14_insert ON synapse.contradiction_findings FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (EXISTS(SELECT FROM synapse.evidence_claims c WHERE c.evidence_claim_id=contradiction_findings.claim_a_id) AND EXISTS(SELECT FROM synapse.evidence_claims c WHERE c.evidence_claim_id=contradiction_findings.claim_b_id)));
GRANT UPDATE(finding_status,reviewed_by_user_id,reviewed_at,review_reason) ON synapse.contradiction_findings TO synapse_operations_runtime;
CREATE POLICY phase14_update ON synapse.contradiction_findings FOR UPDATE TO synapse_operations_runtime USING(EXISTS(SELECT FROM synapse.evidence_claims c WHERE c.evidence_claim_id=contradiction_findings.claim_a_id) AND EXISTS(SELECT FROM synapse.evidence_claims c WHERE c.evidence_claim_id=contradiction_findings.claim_b_id)) WITH CHECK(synapse_gateway.ops_write() AND (EXISTS(SELECT FROM synapse.evidence_claims c WHERE c.evidence_claim_id=contradiction_findings.claim_a_id) AND EXISTS(SELECT FROM synapse.evidence_claims c WHERE c.evidence_claim_id=contradiction_findings.claim_b_id)));
ALTER TABLE synapse.evidence_claims ENABLE ROW LEVEL SECURITY;
GRANT SELECT(evidence_claim_id,evidence_item_id,claim_text,normalized_claim,subject_reference,predicate_code,object_value,valid_from,valid_until,claim_extraction_method,model_name,model_version,confidence,created_by_user_id,created_at) ON synapse.evidence_claims TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.evidence_claims FOR SELECT TO synapse_operations_runtime USING(EXISTS(SELECT FROM synapse.evidence_items e WHERE e.evidence_item_id=evidence_claims.evidence_item_id));
ALTER TABLE synapse.documents ENABLE ROW LEVEL SECURITY;
GRANT SELECT(document_id,document_type,owner_case_id,owner_submission_id,uploaded_by_user_id,confidentiality_level,created_at) ON synapse.documents TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.documents FOR SELECT TO synapse_operations_runtime USING(owner_case_id IS NOT NULL AND synapse_gateway.ops_scope(owner_case_id,false,true));
GRANT INSERT(document_id,document_type,owner_case_id,uploaded_by_user_id) ON synapse.documents TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.documents FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (owner_case_id IS NOT NULL AND synapse_gateway.ops_scope(owner_case_id,false,true)));
-- No runtime UPDATE privilege: immutable documents.
CREATE POLICY phase14_update ON synapse.documents FOR UPDATE TO synapse_operations_runtime USING(owner_case_id IS NOT NULL AND synapse_gateway.ops_scope(owner_case_id,false,true)) WITH CHECK(synapse_gateway.ops_write() AND (owner_case_id IS NOT NULL AND synapse_gateway.ops_scope(owner_case_id,false,true)));
ALTER TABLE synapse.document_versions ENABLE ROW LEVEL SECURITY;
GRANT SELECT(document_version_id,document_id,version_number,storage_key,original_filename,media_type,byte_size,sha256_hex,uploaded_at,uploaded_by_user_id,malware_scan_status) ON synapse.document_versions TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.document_versions FOR SELECT TO synapse_operations_runtime USING(EXISTS(SELECT FROM synapse.documents d WHERE d.document_id=document_versions.document_id));
GRANT INSERT(document_version_id,document_id,version_number,storage_key,original_filename,media_type,byte_size,sha256_hex,uploaded_by_user_id,malware_scan_status,uploaded_at) ON synapse.document_versions TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.document_versions FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (EXISTS(SELECT FROM synapse.documents d WHERE d.document_id=document_versions.document_id)));
-- No runtime UPDATE privilege: immutable document_versions.
CREATE POLICY phase14_update ON synapse.document_versions FOR UPDATE TO synapse_operations_runtime USING(EXISTS(SELECT FROM synapse.documents d WHERE d.document_id=document_versions.document_id)) WITH CHECK(synapse_gateway.ops_write() AND (EXISTS(SELECT FROM synapse.documents d WHERE d.document_id=document_versions.document_id)));
ALTER TABLE synapse.evidence_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT(evidence_item_id,document_version_id,case_id,regulatory_action_id,evidence_type,evidence_status,source_description,received_at,verified_by_user_id,verified_at) ON synapse.evidence_items TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.evidence_items FOR SELECT TO synapse_operations_runtime USING(synapse_gateway.ops_scope(case_id,false,true));
GRANT INSERT(evidence_item_id,document_version_id,case_id,evidence_type,evidence_status,source_description,received_at) ON synapse.evidence_items TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse.evidence_items FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(case_id,false,true)));
GRANT UPDATE(evidence_status,verified_by_user_id,verified_at) ON synapse.evidence_items TO synapse_operations_runtime;
CREATE POLICY phase14_update ON synapse.evidence_items FOR UPDATE TO synapse_operations_runtime USING(synapse_gateway.ops_scope(case_id,false,true)) WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(case_id,false,true)));
ALTER TABLE synapse.submission_translations ENABLE ROW LEVEL SECURITY;
GRANT SELECT(translation_id,submission_id,source_language_code,target_language_code,translated_subject,translated_body,provider_name,provider_model_version,translation_version,provenance,created_at,reviewed_by_user_id,reviewed_at) ON synapse.submission_translations TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.submission_translations FOR SELECT TO synapse_operations_runtime USING(synapse_gateway.ops_draft(submission_id,false));
-- No runtime INSERT privilege: submission_translations.
CREATE POLICY phase14_insert ON synapse.submission_translations FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_draft(submission_id,false)));
GRANT UPDATE(translated_subject,translated_body,reviewed_by_user_id,reviewed_at,provenance) ON synapse.submission_translations TO synapse_operations_runtime;
CREATE POLICY phase14_update ON synapse.submission_translations FOR UPDATE TO synapse_operations_runtime USING(synapse_gateway.ops_draft(submission_id,false)) WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_draft(submission_id,false)));
ALTER TABLE synapse.match_runs ENABLE ROW LEVEL SECURITY;
GRANT SELECT(match_run_id,submission_id,ai_model_version_id,algorithm_code,run_stage,run_status,parameters,started_at,completed_at,error_detail) ON synapse.match_runs TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.match_runs FOR SELECT TO synapse_operations_runtime USING(synapse_gateway.ops_draft(submission_id,false));
-- No runtime INSERT privilege: match_runs.
CREATE POLICY phase14_insert ON synapse.match_runs FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_draft(submission_id,false)));
-- No runtime UPDATE privilege: immutable match_runs.
CREATE POLICY phase14_update ON synapse.match_runs FOR UPDATE TO synapse_operations_runtime USING(synapse_gateway.ops_draft(submission_id,false)) WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_draft(submission_id,false)));
ALTER TABLE synapse.match_candidates ENABLE ROW LEVEL SECURITY;
GRANT SELECT(match_candidate_id,match_run_id,candidate_case_id,candidate_submission_id,match_classification,overall_score,feature_scores,explanation,review_status,reviewed_by_user_id,reviewed_at,review_reason) ON synapse.match_candidates TO synapse_operations_runtime;
CREATE POLICY phase14_read ON synapse.match_candidates FOR SELECT TO synapse_operations_runtime USING(EXISTS(SELECT FROM synapse.match_runs r WHERE r.match_run_id=match_candidates.match_run_id) AND (candidate_case_id IS NULL OR synapse_gateway.ops_scope(candidate_case_id,false,false)));
-- No runtime INSERT privilege: match_candidates.
CREATE POLICY phase14_insert ON synapse.match_candidates FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (EXISTS(SELECT FROM synapse.match_runs r WHERE r.match_run_id=match_candidates.match_run_id) AND (candidate_case_id IS NULL OR synapse_gateway.ops_scope(candidate_case_id,false,false))));
GRANT UPDATE(match_classification,review_status,reviewed_by_user_id,reviewed_at,review_reason) ON synapse.match_candidates TO synapse_operations_runtime;
CREATE POLICY phase14_update ON synapse.match_candidates FOR UPDATE TO synapse_operations_runtime USING(EXISTS(SELECT FROM synapse.match_runs r WHERE r.match_run_id=match_candidates.match_run_id) AND (candidate_case_id IS NULL OR synapse_gateway.ops_scope(candidate_case_id,false,false))) WITH CHECK(synapse_gateway.ops_write() AND (EXISTS(SELECT FROM synapse.match_runs r WHERE r.match_run_id=match_candidates.match_run_id) AND (candidate_case_id IS NULL OR synapse_gateway.ops_scope(candidate_case_id,false,false))));
GRANT SELECT(singleton,enabled,writes_enabled,revision,release_review) ON synapse_gateway.operations_control TO synapse_operations_runtime;
GRANT UPDATE(revision) ON synapse_gateway.operations_control TO synapse_operations_runtime;
CREATE POLICY phase14_revision ON synapse_gateway.operations_control FOR UPDATE TO synapse_operations_runtime USING(synapse_gateway.ops_write()) WITH CHECK(synapse_gateway.ops_write());
ALTER TABLE synapse_gateway.operation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE synapse_gateway.operation_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY phase14_read ON synapse_gateway.operation_receipts FOR SELECT TO synapse_operations_runtime USING(user_id=(SELECT synapse_gateway.ops_actor()));
GRANT SELECT(user_id,request_id,input,result,created_at),INSERT(user_id,request_id,input,result,created_at) ON synapse_gateway.operation_receipts TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse_gateway.operation_receipts FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (user_id=(SELECT synapse_gateway.ops_actor())));
ALTER TABLE synapse_gateway.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE synapse_gateway.calendar_events FORCE ROW LEVEL SECURITY;
CREATE POLICY phase14_read ON synapse_gateway.calendar_events FOR SELECT TO synapse_operations_runtime USING(synapse_gateway.ops_scope(case_id,false,false));
GRANT SELECT(id,case_id,title,at,kind,cancelled_at,cancelled_by,created_by),INSERT(id,case_id,title,at,kind,cancelled_at,cancelled_by,created_by) ON synapse_gateway.calendar_events TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse_gateway.calendar_events FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(case_id,false,false)));
GRANT UPDATE(title,at,cancelled_at,cancelled_by) ON synapse_gateway.calendar_events TO synapse_operations_runtime;
CREATE POLICY phase14_update ON synapse_gateway.calendar_events FOR UPDATE TO synapse_operations_runtime USING(synapse_gateway.ops_scope(case_id,false,false)) WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(case_id,false,false)));
ALTER TABLE synapse_gateway.evaluation_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE synapse_gateway.evaluation_fingerprints FORCE ROW LEVEL SECURITY;
CREATE POLICY phase14_read ON synapse_gateway.evaluation_fingerprints FOR SELECT TO synapse_operations_runtime USING(synapse_gateway.ops_scope(case_id,false,false));
GRANT SELECT(evaluation_id,case_id,fingerprint,checks),INSERT(evaluation_id,case_id,fingerprint,checks) ON synapse_gateway.evaluation_fingerprints TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse_gateway.evaluation_fingerprints FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(case_id,false,false)));
ALTER TABLE synapse_gateway.document_bytes ENABLE ROW LEVEL SECURITY;
ALTER TABLE synapse_gateway.document_bytes FORCE ROW LEVEL SECURITY;
CREATE POLICY phase14_read ON synapse_gateway.document_bytes FOR SELECT TO synapse_operations_runtime USING(synapse_gateway.ops_scope(case_id,false,true));
GRANT SELECT(version_id,case_id,bytes),INSERT(version_id,case_id,bytes) ON synapse_gateway.document_bytes TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse_gateway.document_bytes FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_scope(case_id,false,true)));
ALTER TABLE synapse_gateway.processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE synapse_gateway.processing_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY phase14_read ON synapse_gateway.processing_jobs FOR SELECT TO synapse_operations_runtime USING(synapse_gateway.ops_draft(submission_id,false));
GRANT SELECT(id,submission_id,actor_id,kind,source_version,status,attempts,lease_until,error_code,created_at,completed_at),INSERT(id,submission_id,actor_id,kind,source_version,status,attempts,lease_until,error_code,created_at,completed_at) ON synapse_gateway.processing_jobs TO synapse_operations_runtime;
CREATE POLICY phase14_insert ON synapse_gateway.processing_jobs FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_draft(submission_id,false)));
GRANT UPDATE(status,attempts,lease_until,error_code,completed_at) ON synapse_gateway.processing_jobs TO synapse_operations_runtime;
CREATE POLICY phase14_update ON synapse_gateway.processing_jobs FOR UPDATE TO synapse_operations_runtime USING(synapse_gateway.ops_draft(submission_id,false)) WITH CHECK(synapse_gateway.ops_write() AND (synapse_gateway.ops_draft(submission_id,false)));
GRANT USAGE ON SEQUENCE synapse.cases_case_number_seq TO synapse_operations_runtime;
DO $functions$ DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='synapse' AND p.proname=ANY(ARRAY['approve_case_access_request','approve_case_closure','complete_case_transfer','decide_case_transfer','decide_closure_exception','dispose_case','export_case_metadata','reject_case_transfer','request_case_access','request_case_transfer','request_closure_exception','review_case_relationship','transition_case_status']) LOOP EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO synapse_app,synapse_ingest',f.signature);EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC',f.signature);END LOOP;END $functions$;

GRANT UPDATE(request_status,approver_user_id,decided_at,decision_reason) ON synapse.case_access_requests TO synapse_operations_runtime;

-- Independent approval boundaries are also enforced by RLS, below the domain engine.
ALTER POLICY phase14_insert ON synapse.case_access_grants WITH CHECK(synapse_gateway.ops_write() AND user_id<>synapse_gateway.ops_actor() AND granted_by_user_id=synapse_gateway.ops_actor() AND EXISTS(SELECT FROM synapse.cases c WHERE c.case_id=case_access_grants.case_id AND synapse_gateway.ops_role('BUREAU_HEAD',c.lead_bureau_id)));
ALTER POLICY phase14_update ON synapse.case_access_grants USING(EXISTS(SELECT FROM synapse.cases c WHERE c.case_id=case_access_grants.case_id AND synapse_gateway.ops_role('BUREAU_HEAD',c.lead_bureau_id))) WITH CHECK(synapse_gateway.ops_write() AND user_id<>synapse_gateway.ops_actor() AND EXISTS(SELECT FROM synapse.cases c WHERE c.case_id=case_access_grants.case_id AND synapse_gateway.ops_role('BUREAU_HEAD',c.lead_bureau_id)));
ALTER POLICY phase14_insert ON synapse.case_access_requests WITH CHECK(synapse_gateway.ops_write() AND requester_user_id=synapse_gateway.ops_actor() AND request_status='PENDING' AND approver_user_id IS NULL AND synapse_gateway.ops_scope(case_id,false,false));
ALTER POLICY phase14_update ON synapse.case_access_requests USING(requester_user_id<>synapse_gateway.ops_actor() AND EXISTS(SELECT FROM synapse.cases c WHERE c.case_id=case_access_requests.case_id AND synapse_gateway.ops_role('BUREAU_HEAD',c.lead_bureau_id))) WITH CHECK(synapse_gateway.ops_write() AND requester_user_id<>synapse_gateway.ops_actor() AND approver_user_id=synapse_gateway.ops_actor());
ALTER POLICY phase14_insert ON synapse.case_transfers WITH CHECK(synapse_gateway.ops_write() AND requested_by_user_id=synapse_gateway.ops_actor() AND synapse_gateway.ops_role('BUREAU_HEAD',from_bureau_id) AND transfer_status='REQUESTED');
ALTER POLICY phase14_update ON synapse.case_transfers USING(requested_by_user_id<>synapse_gateway.ops_actor() AND synapse_gateway.ops_role('BUREAU_HEAD',to_bureau_id)) WITH CHECK(synapse_gateway.ops_write() AND requested_by_user_id<>synapse_gateway.ops_actor() AND synapse_gateway.ops_role('BUREAU_HEAD',to_bureau_id));
ALTER POLICY phase14_update ON synapse.institutions USING(synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)) WITH CHECK(synapse_gateway.ops_write() AND synapse_gateway.ops_role('SYSTEM_ADMIN',NULL));
ALTER POLICY phase14_insert ON synapse.case_submissions WITH CHECK(synapse_gateway.ops_write() AND submitted_by_user_id=synapse_gateway.ops_actor() AND (synapse_gateway.ops_role('CASE_OFFICER',intake_bureau_id) OR synapse_gateway.ops_role('BUREAU_HEAD',intake_bureau_id)));
ALTER POLICY phase14_update ON synapse.notifications USING(recipient_user_id=synapse_gateway.ops_actor()) WITH CHECK(synapse_gateway.ops_write() AND recipient_user_id=synapse_gateway.ops_actor());
-- Approved target heads receive the source head's explicit transfer disclosure, not general Bureau access.
GRANT SELECT(case_id,to_bureau_id,transfer_status) ON synapse.case_transfers TO synapse_case_reader;
CREATE POLICY phase14_transfer_target_reader ON synapse.case_transfers FOR SELECT TO synapse_case_reader USING(transfer_status='REQUESTED' AND synapse_gateway.ops_role('BUREAU_HEAD',to_bureau_id));
GRANT synapse_case_reader TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA synapse_gateway TO synapse_case_reader;
SET LOCAL ROLE synapse_case_reader;
CREATE FUNCTION synapse_gateway.ops_incoming_transfer(cid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET row_security=on AS $$ SELECT EXISTS(SELECT FROM synapse.case_transfers WHERE case_id=cid AND transfer_status='REQUESTED' AND synapse_gateway.ops_role('BUREAU_HEAD',to_bureau_id)) $$;
REVOKE ALL ON FUNCTION synapse_gateway.ops_incoming_transfer(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION synapse_gateway.ops_incoming_transfer(uuid) TO synapse_operations_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA synapse_gateway FROM synapse_case_reader;
GRANT synapse_case_reader TO postgres WITH INHERIT FALSE,SET FALSE;
ALTER POLICY phase14_read ON synapse.cases USING(current_status_code<>'DRAFT' AND (synapse_gateway.ops_case(case_id,lead_bureau_id,accountable_officer_id,false,false) OR synapse_gateway.ops_incoming_transfer(case_id)));
ALTER POLICY phase14_update ON synapse.cases USING(synapse_gateway.ops_case(case_id,lead_bureau_id,accountable_officer_id,true,false) OR synapse_gateway.ops_incoming_transfer(case_id) AND current_setting('synapse.workflow_action',true)='TRANSFER') WITH CHECK(synapse_gateway.ops_write() AND synapse_gateway.ops_case(case_id,lead_bureau_id,accountable_officer_id,true,false) AND (current_status_code<>'DISPOSED' OR synapse_gateway.ops_role('BUREAU_HEAD',lead_bureau_id)));
DO $$BEGIN IF EXISTS(SELECT FROM pg_roles WHERE rolname='synapse_web_login') THEN GRANT synapse_operations_runtime TO synapse_web_login WITH INHERIT FALSE,SET TRUE;END IF;END$$;

GRANT EXECUTE ON FUNCTION synapse.current_user_id(),synapse.is_bureau_member(uuid),synapse.is_global_admin() TO synapse_operations_runtime;

ALTER POLICY phase14_insert ON synapse.sla_policies WITH CHECK(synapse_gateway.ops_write() AND EXISTS(SELECT FROM synapse.user_bureau_memberships m WHERE m.user_id=synapse_gateway.ops_actor() AND synapse_gateway.ops_role('BUREAU_HEAD',m.bureau_id)));
ALTER POLICY phase14_insert ON synapse.sla_policy_versions WITH CHECK(synapse_gateway.ops_write() AND EXISTS(SELECT FROM synapse.user_bureau_memberships m WHERE m.user_id=synapse_gateway.ops_actor() AND synapse_gateway.ops_role('BUREAU_HEAD',m.bureau_id)) AND EXISTS(SELECT FROM synapse.policy_versions p WHERE p.policy_version_id=sla_policy_versions.policy_version_id AND p.status='APPROVED'));
