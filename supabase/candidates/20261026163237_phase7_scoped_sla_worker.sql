-- PREPARED / UNAPPLIED. No schedule, login, configuration row or live write is
-- enabled by this file. Explicit approved policy/Bureau configuration is required.
DO $review$ BEGIN
 IF EXISTS(SELECT FROM (
   SELECT acl.grantee,acl.privilege_type FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl WHERE c.oid='synapse.case_work_items'::regclass
   UNION ALL SELECT acl.grantee,acl.privilege_type FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) acl WHERE a.attrelid='synapse.case_work_items'::regclass
  ) permissions WHERE privilege_type='SELECT' AND grantee NOT IN((SELECT relowner FROM pg_class WHERE oid='synapse.case_work_items'::regclass),'synapse_app'::regrole)) THEN
  RAISE EXCEPTION 'Unexpected existing work-item reader: review effective SELECT policies before applying' USING ERRCODE='42501';
 END IF;
END $review$;
CREATE ROLE synapse_sla_worker NOLOGIN NOINHERIT NOBYPASSRLS;
CREATE SCHEMA synapse_jobs;
REVOKE ALL ON SCHEMA synapse_jobs FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA synapse_jobs,synapse TO synapse_sla_worker;
CREATE TABLE synapse_jobs.sla_config (
  bureau_id uuid NOT NULL REFERENCES synapse.bureaus(bureau_id), policy_version_id uuid NOT NULL REFERENCES synapse.sla_policy_versions(sla_policy_version_id),
  enabled boolean NOT NULL DEFAULT false, approved_by uuid NOT NULL REFERENCES synapse.users(user_id), approved_at timestamptz NOT NULL,
  PRIMARY KEY(bureau_id,policy_version_id)
);
CREATE TABLE synapse_jobs.sla_deliveries (
  sla_id uuid NOT NULL REFERENCES synapse.sla_instances(sla_instance_id), due_at timestamptz NOT NULL,
  kind text NOT NULL CHECK(kind IN('SLA_REMINDER','SLA_ESCALATION')), recipient_id uuid NOT NULL REFERENCES synapse.users(user_id),
  notification_id uuid NOT NULL UNIQUE, recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(sla_id,due_at,kind,recipient_id)
);
ALTER TABLE synapse_jobs.sla_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE synapse_jobs.sla_config FORCE ROW LEVEL SECURITY;
ALTER TABLE synapse_jobs.sla_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE synapse_jobs.sla_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY worker_config ON synapse_jobs.sla_config FOR SELECT TO synapse_sla_worker USING(enabled AND approved_at<=now());
CREATE POLICY worker_delivery_read ON synapse_jobs.sla_deliveries FOR SELECT TO synapse_sla_worker USING(EXISTS(SELECT FROM synapse.sla_instances s WHERE s.sla_instance_id=sla_id));
CREATE POLICY worker_delivery_insert ON synapse_jobs.sla_deliveries FOR INSERT TO synapse_sla_worker WITH CHECK(EXISTS(SELECT FROM synapse.sla_instances s WHERE s.sla_instance_id=sla_id));
GRANT SELECT ON synapse_jobs.sla_config,synapse_jobs.sla_deliveries TO synapse_sla_worker;
GRANT INSERT ON synapse_jobs.sla_deliveries TO synapse_sla_worker;
-- Only identity/deadline fields, never complaint bodies, evidence or email.
GRANT SELECT(case_id,case_number,lead_bureau_id,accountable_officer_id,current_status_code) ON synapse.cases TO synapse_sla_worker;
GRANT SELECT(sla_instance_id,sla_policy_version_id,case_id,work_item_id,current_due_at,sla_status) ON synapse.sla_instances TO synapse_sla_worker;
GRANT SELECT(sla_policy_version_id,warning_threshold_minutes,escalation_after_minutes,approved_by_user_id,approved_at) ON synapse.sla_policy_versions TO synapse_sla_worker;
GRANT SELECT(work_item_id,case_id,assigned_to_user_id,status_code) ON synapse.case_work_items TO synapse_sla_worker;
GRANT SELECT(user_id,account_status) ON synapse.users TO synapse_sla_worker;
GRANT SELECT(user_id,bureau_id,valid_from,valid_until) ON synapse.user_bureau_memberships TO synapse_sla_worker;
GRANT SELECT(user_id,role_id,bureau_id,scope_type,valid_from,valid_until) ON synapse.user_role_assignments TO synapse_sla_worker;
GRANT SELECT(role_id,role_code,is_active) ON synapse.roles TO synapse_sla_worker;
GRANT INSERT(notification_id,recipient_user_id,notification_type,subject,body,related_case_id) ON synapse.notifications TO synapse_sla_worker;
ALTER TABLE synapse.sla_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE synapse.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY sla_worker_cases ON synapse.cases FOR SELECT TO synapse_sla_worker USING(EXISTS(SELECT FROM synapse_jobs.sla_config j WHERE j.bureau_id=lead_bureau_id));
-- The old SELECT policy matched PUBLIC, but its only effective reader is
-- synapse_app. Keep that access and do not grant legacy admin-bypass helpers to
-- the new worker merely to evaluate an inapplicable policy.
ALTER POLICY case_work_items_select_authorized ON synapse.case_work_items TO synapse_app;
CREATE POLICY sla_worker_tasks ON synapse.case_work_items FOR SELECT TO synapse_sla_worker USING(EXISTS(SELECT FROM synapse.cases c WHERE c.case_id=case_work_items.case_id));
CREATE POLICY sla_worker_instances ON synapse.sla_instances FOR SELECT TO synapse_sla_worker USING(EXISTS(SELECT FROM synapse_jobs.sla_config j WHERE j.policy_version_id=sla_instances.sla_policy_version_id)
 AND ((case_id IS NOT NULL AND EXISTS(SELECT FROM synapse.cases c WHERE c.case_id=sla_instances.case_id)) OR
      (work_item_id IS NOT NULL AND EXISTS(SELECT FROM synapse.case_work_items w WHERE w.work_item_id=sla_instances.work_item_id))));
CREATE POLICY sla_worker_versions ON synapse.sla_policy_versions FOR SELECT TO synapse_sla_worker USING(approved_by_user_id IS NOT NULL AND approved_at<=now() AND EXISTS(SELECT FROM synapse_jobs.sla_config j WHERE j.policy_version_id=sla_policy_versions.sla_policy_version_id));
CREATE POLICY sla_worker_memberships ON synapse.user_bureau_memberships FOR SELECT TO synapse_sla_worker USING(valid_from<=now() AND (valid_until IS NULL OR valid_until>now()) AND EXISTS(SELECT FROM synapse_jobs.sla_config j WHERE j.bureau_id=user_bureau_memberships.bureau_id));
CREATE POLICY sla_worker_assignments ON synapse.user_role_assignments FOR SELECT TO synapse_sla_worker USING(valid_from<=now() AND (valid_until IS NULL OR valid_until>now()) AND scope_type='BUREAU' AND EXISTS(SELECT FROM synapse_jobs.sla_config j WHERE j.bureau_id=user_role_assignments.bureau_id));
CREATE POLICY sla_worker_roles ON synapse.roles FOR SELECT TO synapse_sla_worker USING(is_active AND role_code IN('CASE_OFFICER','BUREAU_HEAD'));
CREATE POLICY sla_worker_users ON synapse.users FOR SELECT TO synapse_sla_worker USING(account_status='ACTIVE' AND EXISTS(SELECT FROM synapse.user_bureau_memberships m WHERE m.user_id=users.user_id));
CREATE POLICY sla_worker_notification ON synapse.notifications FOR INSERT TO synapse_sla_worker WITH CHECK(notification_type IN('SLA_REMINDER','SLA_ESCALATION') AND EXISTS(
  SELECT FROM synapse.cases c JOIN synapse.user_bureau_memberships m ON m.bureau_id=c.lead_bureau_id JOIN synapse.users u ON u.user_id=m.user_id
  WHERE c.case_id=related_case_id AND m.user_id=recipient_user_id AND u.account_status='ACTIVE'));
CREATE INDEX phase7_sla_due_candidates ON synapse.sla_instances(current_due_at,sla_instance_id) WHERE sla_status IN('RUNNING','BREACHED');
GRANT synapse_sla_worker TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA synapse_jobs TO synapse_sla_worker;
SET LOCAL ROLE synapse_sla_worker;
CREATE FUNCTION synapse_jobs.process_sla() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on SET TimeZone='UTC' AS $worker$
DECLARE candidate record; receipt uuid; delivered integer:=0;
BEGIN
 FOR candidate IN
  WITH subjects AS (
   SELECT s.sla_instance_id,s.current_due_at,c.case_id,c.case_number,c.lead_bureau_id,coalesce(w.assigned_to_user_id,c.accountable_officer_id) officer,
    p.warning_threshold_minutes,p.escalation_after_minutes
   FROM synapse.sla_instances s LEFT JOIN synapse.case_work_items w ON w.work_item_id=s.work_item_id
   JOIN synapse.cases c ON c.case_id=coalesce(s.case_id,w.case_id)
   JOIN synapse.sla_policy_versions p ON p.sla_policy_version_id=s.sla_policy_version_id
   JOIN synapse_jobs.sla_config config ON config.bureau_id=c.lead_bureau_id AND config.policy_version_id=p.sla_policy_version_id
   WHERE s.sla_status IN('RUNNING','BREACHED') AND c.current_status_code NOT IN('DISPOSED','DRAFT') AND (w.work_item_id IS NULL OR w.status_code NOT IN('COMPLETED','CANCELLED'))
  ), recipients AS (
   SELECT DISTINCT s.*,u.user_id,CASE WHEN r.role_code='BUREAU_HEAD' THEN 'SLA_ESCALATION' ELSE 'SLA_REMINDER' END kind
   FROM subjects s JOIN synapse.user_bureau_memberships m ON m.bureau_id=s.lead_bureau_id
   JOIN synapse.users u ON u.user_id=m.user_id JOIN synapse.user_role_assignments a ON a.user_id=u.user_id AND a.bureau_id=s.lead_bureau_id
   JOIN synapse.roles r ON r.role_id=a.role_id
   WHERE (r.role_code='CASE_OFFICER' AND u.user_id=s.officer AND s.warning_threshold_minutes IS NOT NULL AND s.current_due_at>now() AND s.current_due_at<=now()+make_interval(mins=>s.warning_threshold_minutes))
     OR (r.role_code='BUREAU_HEAD' AND s.escalation_after_minutes IS NOT NULL AND s.current_due_at+make_interval(mins=>s.escalation_after_minutes)<=now())
  ) SELECT * FROM recipients r WHERE NOT EXISTS(SELECT FROM synapse_jobs.sla_deliveries d WHERE d.sla_id=r.sla_instance_id AND d.due_at=r.current_due_at AND d.kind=r.kind AND d.recipient_id=r.user_id)
    ORDER BY current_due_at,sla_instance_id,user_id LIMIT 100
 LOOP
  receipt:=NULL;
  INSERT INTO synapse_jobs.sla_deliveries(sla_id,due_at,kind,recipient_id,notification_id) VALUES(candidate.sla_instance_id,candidate.current_due_at,candidate.kind,candidate.user_id,gen_random_uuid())
    ON CONFLICT DO NOTHING RETURNING notification_id INTO receipt;
  IF receipt IS NOT NULL THEN
   INSERT INTO synapse.notifications(notification_id,recipient_user_id,notification_type,subject,body,related_case_id)
    VALUES(receipt,candidate.user_id,candidate.kind,CASE WHEN candidate.kind='SLA_ESCALATION' THEN 'SLA deadline escalation' ELSE 'SLA deadline reminder' END,
      format('Case #%s has a policy deadline at %s. Review the authorized case for current details.',candidate.case_number,candidate.current_due_at),candidate.case_id);
   delivered:=delivered+1;
  END IF;
 END LOOP;
 RETURN delivered;
END $worker$;
REVOKE ALL ON FUNCTION synapse_jobs.process_sla() FROM PUBLIC,anon,authenticated,service_role;
RESET ROLE;
REVOKE CREATE ON SCHEMA synapse_jobs FROM synapse_sla_worker;
GRANT synapse_sla_worker TO postgres WITH INHERIT FALSE,SET FALSE;
