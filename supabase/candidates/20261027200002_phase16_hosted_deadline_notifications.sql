-- Reviewed deadlines and service notifications. No assumed SLA durations or automatic disposal.
CREATE TABLE synapse_gateway.reminder_rules(policy_version_id uuid PRIMARY KEY REFERENCES synapse.policy_versions(policy_version_id),minutes integer NOT NULL CHECK(minutes BETWEEN 1 AND 525600),reviewed_by uuid NOT NULL REFERENCES synapse.users(user_id),reason text NOT NULL CHECK(length(btrim(reason))>=5),reviewed_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE synapse_gateway.reminder_rules ENABLE ROW LEVEL SECURITY;ALTER TABLE synapse_gateway.reminder_rules FORCE ROW LEVEL SECURITY;
REVOKE ALL ON synapse_gateway.reminder_rules FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT(policy_version_id,minutes,reviewed_by,reason,reviewed_at),INSERT(policy_version_id,minutes,reviewed_by,reason),UPDATE(minutes,reviewed_by,reason,reviewed_at) ON synapse_gateway.reminder_rules TO synapse_operations_runtime;
CREATE POLICY phase16_rules_read ON synapse_gateway.reminder_rules FOR SELECT TO synapse_operations_runtime USING(synapse_gateway.ops_actor() IS NOT NULL);
CREATE POLICY phase16_rules_insert ON synapse_gateway.reminder_rules FOR INSERT TO synapse_operations_runtime WITH CHECK(synapse_gateway.ops_write() AND synapse_gateway.ops_role('SYSTEM_ADMIN',NULL) AND reviewed_by=synapse_gateway.ops_actor());
CREATE POLICY phase16_rules_update ON synapse_gateway.reminder_rules FOR UPDATE TO synapse_operations_runtime USING(synapse_gateway.ops_role('SYSTEM_ADMIN',NULL)) WITH CHECK(synapse_gateway.ops_write() AND reviewed_by=synapse_gateway.ops_actor());
CREATE ROLE synapse_deadline_notifier NOLOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT USAGE ON SCHEMA synapse,synapse_gateway TO synapse_deadline_notifier;
CREATE TABLE synapse_gateway.reminder_receipts(sla_id uuid NOT NULL REFERENCES synapse.sla_instances(sla_instance_id),recipient_id uuid NOT NULL REFERENCES synapse.users(user_id),kind text NOT NULL CHECK(kind IN('REMINDER','OVERDUE')),due_at timestamptz NOT NULL,notification_id uuid NOT NULL REFERENCES synapse.notifications(notification_id),PRIMARY KEY(sla_id,recipient_id,kind,due_at));
ALTER TABLE synapse_gateway.reminder_receipts ENABLE ROW LEVEL SECURITY;ALTER TABLE synapse_gateway.reminder_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON synapse_gateway.reminder_receipts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT(sla_id,recipient_id,kind,due_at,notification_id),INSERT(sla_id,recipient_id,kind,due_at,notification_id) ON synapse_gateway.reminder_receipts TO synapse_deadline_notifier;
CREATE POLICY phase16_receipts ON synapse_gateway.reminder_receipts TO synapse_deadline_notifier USING(true) WITH CHECK(true);
GRANT SELECT(enabled,writes_enabled) ON synapse_gateway.operations_control TO synapse_deadline_notifier;
CREATE POLICY phase16_control ON synapse_gateway.operations_control FOR SELECT TO synapse_deadline_notifier USING(true);
GRANT SELECT(policy_version_id,minutes) ON synapse_gateway.reminder_rules TO synapse_deadline_notifier;
CREATE POLICY phase16_rules_service ON synapse_gateway.reminder_rules FOR SELECT TO synapse_deadline_notifier USING(true);
GRANT SELECT(case_id,case_number,current_status_code,lead_bureau_id,accountable_officer_id) ON synapse.cases TO synapse_deadline_notifier;
CREATE POLICY phase16_deadlines ON synapse.cases FOR SELECT TO synapse_deadline_notifier USING(current_status_code<>'DISPOSED');
GRANT SELECT(sla_instance_id,sla_policy_version_id,case_id,current_due_at,sla_status) ON synapse.sla_instances TO synapse_deadline_notifier;
CREATE POLICY phase16_deadlines ON synapse.sla_instances FOR SELECT TO synapse_deadline_notifier USING(sla_status IN('RUNNING','BREACHED'));
GRANT SELECT(sla_policy_version_id,policy_version_id) ON synapse.sla_policy_versions TO synapse_deadline_notifier;
CREATE POLICY phase16_deadlines ON synapse.sla_policy_versions FOR SELECT TO synapse_deadline_notifier USING(true);
GRANT SELECT(policy_version_id,status,effective_from,effective_until) ON synapse.policy_versions TO synapse_deadline_notifier;
CREATE POLICY phase16_deadlines ON synapse.policy_versions FOR SELECT TO synapse_deadline_notifier USING(status='APPROVED' AND effective_from<=(now() AT TIME ZONE 'Asia/Kolkata')::date AND (effective_until IS NULL OR effective_until>=(now() AT TIME ZONE 'Asia/Kolkata')::date));
GRANT SELECT(bureau_id,is_active) ON synapse.bureaus TO synapse_deadline_notifier;
CREATE POLICY phase16_deadlines ON synapse.bureaus FOR SELECT TO synapse_deadline_notifier USING(is_active);
GRANT SELECT(user_id,account_status) ON synapse.users TO synapse_deadline_notifier;
CREATE POLICY phase16_deadlines ON synapse.users FOR SELECT TO synapse_deadline_notifier USING(account_status='ACTIVE');
GRANT SELECT(user_id,bureau_id,valid_from,valid_until) ON synapse.user_bureau_memberships TO synapse_deadline_notifier;
CREATE POLICY phase16_deadlines ON synapse.user_bureau_memberships FOR SELECT TO synapse_deadline_notifier USING(valid_from<=now() AND (valid_until IS NULL OR valid_until>now()));
GRANT SELECT(user_id,role_id,scope_type,bureau_id,valid_from,valid_until) ON synapse.user_role_assignments TO synapse_deadline_notifier;
CREATE POLICY phase16_deadlines ON synapse.user_role_assignments FOR SELECT TO synapse_deadline_notifier USING(valid_from<=now() AND (valid_until IS NULL OR valid_until>now()));
GRANT SELECT(role_id,role_code,is_active) ON synapse.roles TO synapse_deadline_notifier;
CREATE POLICY phase16_deadlines ON synapse.roles FOR SELECT TO synapse_deadline_notifier USING(is_active);
GRANT SELECT(internal_user_id,revoked_at) ON synapse.auth_identity_links TO synapse_deadline_notifier;
CREATE POLICY phase16_deadlines ON synapse.auth_identity_links FOR SELECT TO synapse_deadline_notifier USING(revoked_at IS NULL);
GRANT INSERT(notification_id,recipient_user_id,notification_type,subject,body,related_case_id) ON synapse.notifications TO synapse_deadline_notifier;
CREATE POLICY phase16_deadline_insert ON synapse.notifications FOR INSERT TO synapse_deadline_notifier WITH CHECK(notification_type='SLA_DEADLINE' AND EXISTS(SELECT FROM synapse.cases c JOIN synapse.users u ON u.user_id=recipient_user_id JOIN synapse.user_bureau_memberships m ON m.user_id=u.user_id AND m.bureau_id=c.lead_bureau_id JOIN synapse.user_role_assignments a ON a.user_id=u.user_id JOIN synapse.roles r USING(role_id) WHERE c.case_id=related_case_id AND (a.scope_type='GLOBAL' OR a.bureau_id=c.lead_bureau_id) AND (r.role_code='BUREAU_HEAD' OR r.role_code='CASE_OFFICER' AND c.accountable_officer_id=u.user_id)));
GRANT INSERT(audit_event_id,actor_user_id,event_type,entity_type,entity_id,reason) ON synapse.audit_events TO synapse_deadline_notifier;
CREATE POLICY phase16_deadline_audit ON synapse.audit_events FOR INSERT TO synapse_deadline_notifier WITH CHECK(actor_user_id IS NULL AND event_type='SLA_DEADLINE_SERVICE');
GRANT synapse_case_reader TO postgres WITH SET TRUE;
SET LOCAL ROLE synapse_case_reader;
GRANT EXECUTE ON FUNCTION synapse_gateway.gmail_actor() TO synapse_deadline_notifier;
RESET ROLE;
GRANT synapse_case_reader TO postgres WITH INHERIT FALSE,SET FALSE;
GRANT synapse_deadline_notifier TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA synapse_gateway TO synapse_deadline_notifier;
SET LOCAL ROLE synapse_deadline_notifier;
CREATE FUNCTION synapse_gateway.deadline_notifications(p_claims jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $$
DECLARE item record; notification uuid; sent integer:=0;
BEGIN
 IF p_claims ? 'sub' THEN PERFORM set_config('request.jwt.claims',p_claims::text,true);IF synapse_gateway.gmail_actor() IS NULL THEN RAISE EXCEPTION 'Current configuration administrator required' USING ERRCODE='42501';END IF;END IF;
 IF NOT EXISTS(SELECT FROM synapse_gateway.operations_control WHERE enabled AND writes_enabled) THEN RETURN jsonb_build_object('delivered',0,'blocked','OPERATIONS_RELEASE_REQUIRED');END IF;
 PERFORM pg_advisory_xact_lock(7319,26264);
 FOR item IN SELECT DISTINCT s.sla_instance_id,s.current_due_at,c.case_id,c.case_number,u.user_id,CASE WHEN s.current_due_at<=now() THEN 'OVERDUE' ELSE 'REMINDER' END kind
 FROM synapse.sla_instances s JOIN synapse.cases c USING(case_id) JOIN synapse.bureaus b ON b.bureau_id=c.lead_bureau_id JOIN synapse.sla_policy_versions sp USING(sla_policy_version_id) JOIN synapse.policy_versions pv ON pv.policy_version_id=sp.policy_version_id JOIN synapse_gateway.reminder_rules rules ON rules.policy_version_id=pv.policy_version_id JOIN synapse.user_bureau_memberships m ON m.bureau_id=c.lead_bureau_id JOIN synapse.users u ON u.user_id=m.user_id JOIN synapse.auth_identity_links identity ON identity.internal_user_id=u.user_id JOIN synapse.user_role_assignments a ON a.user_id=u.user_id JOIN synapse.roles r USING(role_id)
 WHERE (a.scope_type='GLOBAL' OR a.bureau_id=c.lead_bureau_id) AND (r.role_code='CASE_OFFICER' AND c.accountable_officer_id=u.user_id OR s.current_due_at<=now() AND r.role_code='BUREAU_HEAD') AND s.current_due_at<=now()+rules.minutes*interval '1 minute' AND NOT EXISTS(SELECT FROM synapse_gateway.reminder_receipts x WHERE x.sla_id=s.sla_instance_id AND x.recipient_id=u.user_id AND x.due_at=s.current_due_at AND x.kind=CASE WHEN s.current_due_at<=now() THEN 'OVERDUE' ELSE 'REMINDER' END)
 ORDER BY s.current_due_at,c.case_number LIMIT 200
 LOOP notification:=gen_random_uuid();INSERT INTO synapse.notifications(notification_id,recipient_user_id,notification_type,subject,body,related_case_id) VALUES(notification,item.user_id,'SLA_DEADLINE',(CASE item.kind WHEN 'OVERDUE' THEN 'Overdue deadline: case #' ELSE 'Upcoming deadline: case #' END)||item.case_number,'Reviewed case deadline: '||item.current_due_at,item.case_id);INSERT INTO synapse_gateway.reminder_receipts(sla_id,recipient_id,kind,due_at,notification_id) VALUES(item.sla_instance_id,item.user_id,item.kind,item.current_due_at,notification);sent:=sent+1;END LOOP;
 IF sent>0 THEN INSERT INTO synapse.audit_events(audit_event_id,actor_user_id,event_type,entity_type,entity_id,reason) VALUES(gen_random_uuid(),NULL,'SLA_DEADLINE_SERVICE','workflow',gen_random_uuid(),'Actual reviewed SLA notifications delivered: '||sent);END IF;
 RETURN jsonb_build_object('delivered',sent);
END$$;
REVOKE ALL ON FUNCTION synapse_gateway.deadline_notifications(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION synapse_gateway.deadline_notifications(jsonb) TO synapse_web_gateway;
RESET ROLE;
REVOKE CREATE ON SCHEMA synapse_gateway FROM synapse_deadline_notifier;
GRANT synapse_deadline_notifier TO postgres WITH INHERIT FALSE,SET FALSE;
