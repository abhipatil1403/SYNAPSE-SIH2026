import type { Client } from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixtureId as id } from "../../tests/fixtures/platform";
export async function verifySlaWorker(db: Client) {
  assert.match((await db.query("SELECT current_database() name")).rows[0].name, /^synapse_test_[a-f0-9]{32}$/);
  const policy = randomUUID(), version = randomUUID(), reminder = randomUUID(), overdue = randomUUID(), hidden = randomUUID();
  await db.query("INSERT INTO synapse.sla_policies(sla_policy_id,policy_code,policy_name) VALUES($1,'LOCAL_WORKER','Explicit local worker policy')", [policy]);
  await db.query(`INSERT INTO synapse.sla_policy_versions(sla_policy_version_id,sla_policy_id,version_number,start_event_code,duration_minutes,calendar_code,warning_threshold_minutes,escalation_after_minutes,effective_from,approved_by_user_id,approved_at)
    VALUES($1,$2,1,'REGISTERED',120,'UTC_CALENDAR',60,15,now()-interval '1 day',$3,now()-interval '1 day')`, [version,policy,id(3)]);
  await db.query("INSERT INTO synapse_jobs.sla_config(bureau_id,policy_version_id,approved_by,approved_at) VALUES($1,$2,$3,now())", [id(11),version,id(3)]);
  for (const [sla, caseId, offset] of [[reminder,id(21),30],[overdue,id(23),-30],[hidden,id(22),-30]] as const)
    await db.query("INSERT INTO synapse.sla_instances(sla_instance_id,sla_policy_version_id,case_id,started_at,original_due_at,current_due_at) VALUES($1,$2,$3,now()-interval '1 day',now()+make_interval(mins=>$4),now()+make_interval(mins=>$4))", [sla,version,caseId,offset]);
  async function run() {
    await db.query("BEGIN; SET LOCAL ROLE synapse_sla_worker");
    try { const result = (await db.query("SELECT synapse_jobs.process_sla() n")).rows[0].n; await db.query("COMMIT"); return result; }
    catch (e) { await db.query("ROLLBACK"); throw e; }
  }
  assert.equal(await run(),0, "Disabled config sends no notification");
  await db.query("UPDATE synapse_jobs.sla_config SET enabled=true");
  assert.equal(await run(),2); assert.equal(await run(),0);
  const deliveries=(await db.query("SELECT kind,recipient_id FROM synapse_jobs.sla_deliveries ORDER BY kind")).rows;
  assert.ok(deliveries.some(d=>d.kind==='SLA_REMINDER'&&d.recipient_id===id(1)));
  assert.ok(deliveries.some(d=>d.kind==='SLA_ESCALATION'&&d.recipient_id===id(3)));
  assert.equal((await db.query("SELECT count(*)::int n FROM synapse_jobs.sla_deliveries WHERE sla_id=$1",[hidden])).rows[0].n,0);
  await db.query("BEGIN; SET LOCAL ROLE synapse_sla_worker");
  assert.equal((await db.query("SELECT count(*)::int n FROM synapse.sla_instances WHERE sla_instance_id=$1",[hidden])).rows[0].n,0);
  await db.query("COMMIT");
  const before=(await db.query("SELECT count(*)::int n FROM synapse.notifications WHERE notification_type LIKE 'SLA_%'")).rows[0].n;
  await db.query("BEGIN; SET LOCAL ROLE synapse_sla_worker");
  await assert.rejects(db.query("SELECT summary FROM synapse.cases"),{code:'42501'}); await db.query("ROLLBACK");
  await db.query("BEGIN; SET LOCAL ROLE authenticated");
  await assert.rejects(db.query("SELECT synapse_jobs.process_sla()"),{code:'42501'}); await db.query("ROLLBACK");
  await db.query("UPDATE synapse.users SET account_status='SUSPENDED' WHERE user_id=$1",[id(1)]);
  await db.query("UPDATE synapse.sla_instances SET current_due_at=current_due_at+interval '1 minute' WHERE sla_instance_id=$1",[reminder]);
  assert.equal(await run(),0); assert.equal((await db.query("SELECT count(*)::int n FROM synapse.notifications WHERE notification_type LIKE 'SLA_%'")).rows[0].n,before);
  await db.query("UPDATE synapse.users SET account_status='ACTIVE' WHERE user_id=$1",[id(1)]);
  await db.query("CREATE FUNCTION pg_temp.fail_sla_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Explicit local rollback probe'; END $$; CREATE TRIGGER local_sla_failure BEFORE INSERT ON synapse.notifications FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_sla_notification()");
  const receipts=(await db.query("SELECT count(*)::int n FROM synapse_jobs.sla_deliveries")).rows[0].n;
  await assert.rejects(run());
  assert.equal((await db.query("SELECT count(*)::int n FROM synapse_jobs.sla_deliveries")).rows[0].n,receipts);
  await db.query("DROP TRIGGER local_sla_failure ON synapse.notifications");
  assert.equal(await run(),1); assert.equal(await run(),0);
  return ["LOCAL SLA: disabled config sends nothing; approved rule thresholds persist one officer reminder and one supervisor escalation; retry creates no duplicates.",
    "LOCAL SLA: other Bureau and suspended recipients receive no alert; worker cannot read complaint bodies and browser roles cannot invoke the private processor.",
    "LOCAL SLA: injected notification failure rolls back its receipt; retry persists exactly one alert for the changed deadline."];
}
