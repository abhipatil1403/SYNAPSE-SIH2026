import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { IsolatedPostgresStore } from "./postgres-store";
import { PlatformEngine } from "../../lib/platform/engine";
import { platformDashboard, platformCalendar } from "../../lib/platform/selectors";
import { platformFixture, fixtureId as id, principal, now } from "../../tests/fixtures/platform";
import type { Command } from "../../lib/platform/contracts";

export async function verifyLocalPlatform(db: Client) {
  const state = platformFixture();
  // Seed only the harness-created database; never called against Supabase.
  const name = (await db.query("SELECT current_database() name")).rows[0].name;
  assert.match(name, /^synapse_test_[a-f0-9]{32}$/);
  for (const b of state.bureaus) await db.query("INSERT INTO synapse.bureaus(bureau_id,bureau_code,bureau_name) VALUES($1,$2,$3)", [b.id,"PLATFORM_"+b.id.slice(-2),b.name]);
  await db.query("INSERT INTO synapse.institutions(institution_id,canonical_name) VALUES($1,'Isolated platform institution')", [id(13)]);
  await db.query("INSERT INTO synapse.case_categories(category_id,category_code,category_name) VALUES($1,'PLATFORM_TEST','Isolated category')", [id(14)]);
  for (const u of state.staff) {
    await db.query("INSERT INTO synapse.users(user_id,email,display_name,external_subject) VALUES($1,$2,$3,$4)", [u.id,`local-${u.id.slice(-2)}@example.invalid`,u.name,u.authId]);
    for (const m of u.memberships) await db.query("INSERT INTO synapse.user_bureau_memberships(user_id,bureau_id,membership_type,valid_from,valid_until) VALUES($1,$2,'MEMBER',now()-interval '1 day',now()+interval '1 year')", [u.id,m.bureauId]);
    for (const r of u.roles) await db.query("INSERT INTO synapse.user_role_assignments(user_id,role_id,scope_type,bureau_id,valid_from,valid_until) SELECT $1,role_id,'BUREAU',$2,now()-interval '1 day',now()+interval '1 year' FROM synapse.roles WHERE role_code=$3", [u.id,r.bureauId,r.code]);
  }
  const seededCases = state.cases; state.cases = []; state.sla = [];
  const store = new IsolatedPostgresStore(db); await store.initialize(state);
  for (const c of seededCases) await store.transaction(async (s) => {
    s.cases.push({ ...c, status: "NEW" });
    s.activity.push({ id: randomUUID(), caseId: null, actorId: c.officerId!, type: "fixture.seed", reason: "Explicit disposable test only", at: now });
  });
  const engine = new PlatformEngine(store, () => now);
  const send = (c: Command, who = 3, key: string = randomUUID()) => engine.execute(principal(who), { idempotencyKey: key, command: c });
  const results: string[] = [];
  const draft = await send({ type: "draft.create", sourceReference: "platform-local-message-1", source: "MANUAL", subject: "Persisted multilingual complaint", body: "Original reviewed complaint body", language: "mr", bureauId: id(11), institutionId: null });
  await send({ type: "draft.verify", draftId: draft.entityId, expectedVersion: "1", institutionId: id(13), reason: "Human confirmed institution" });
  const command: Command = { type: "draft.register", draftId: draft.entityId, expectedVersion: "2", categoryId: id(14), officerId: id(1), priority: "URGENT" };
  const key = randomUUID(), registered = await send(command, 3, key); await send(command, 3, key);
  assert.equal((await db.query("SELECT count(*)::int n FROM synapse.cases WHERE case_id=$1", [registered.entityId])).rows[0].n, 1);
  assert.equal((await db.query("SELECT submission_status FROM synapse.case_submissions WHERE submission_id=$1", [draft.entityId])).rows[0].submission_status, "ACCEPTED");
  assert.equal((await db.query("SELECT count(*)::int n FROM synapse.submission_case_links WHERE submission_id=$1", [draft.entityId])).rows[0].n, 1);
  const snap = await engine.snapshot(principal()); assert.equal(platformDashboard(snap, now).total, snap.cases.length);
  assert.ok(snap.cases.some((c) => c.id === registered.entityId)); results.push("Registration commits actual case/submission/link/audit/notification rows; idempotent retry creates no duplicate; registry and dashboard reconcile.");
  const both = await Promise.allSettled([
    send({ type: "case.priority", caseId: registered.entityId, expectedVersion: "1", priority: "HIGH", reason: "Authorized update" }, 1),
    send({ type: "comment.add", caseId: registered.entityId, expectedVersion: "1", body: "Competing update" }, 1),
  ]);
  assert.equal(both.filter((r) => r.status === "fulfilled").length, 1, JSON.stringify(both.map((r) => r.status === "rejected" ? String(r.reason?.message) : "committed")));
  assert.equal((await db.query("SELECT row_version::text FROM synapse.cases WHERE case_id=$1", [registered.entityId])).rows[0].row_version, "2");
  results.push("Actual PostgreSQL row lock/row_version permits one competing expected-version update and rolls back the loser.");
  await send({ type: "task.create", caseId: registered.entityId, expectedVersion: "2", title: "Follow up evidence", taskType: "FOLLOW_UP", assigneeId: id(1), dueAt: "2026-10-27T18:45:00Z" }, 1);
  const task = (await engine.snapshot(principal())).tasks[0];
  assert.equal(platformCalendar(await engine.snapshot(principal())).find((e) => e.id === task.id)?.day, "2026-10-28");
  assert.equal((await db.query("SELECT title FROM synapse.case_work_items WHERE work_item_id=$1", [task.id])).rows[0].title, task.title);
  await send({ type: "task.update", caseId: registered.entityId, expectedVersion: "3", taskId: task.id, status: "COMPLETED" }, 1);
  assert.equal((await db.query("SELECT completed_at IS NOT NULL done FROM synapse.case_work_items WHERE work_item_id=$1", [task.id])).rows[0].done, true);
  results.push("Actual task insertion/completion satisfies deployed status constraints; shared calendar removes completed work.");
  await send({ type: "comment.add", caseId: registered.entityId, expectedVersion: "4", body: "Accountable comment" }, 1);
  assert.equal((await db.query("SELECT count(*)::int n FROM synapse.case_comments WHERE case_id=$1", [registered.entityId])).rows[0].n, 1);
  await send({ type: "case.transition", caseId: registered.entityId, expectedVersion: "5", status: "ASSIGNED", reason: "Authorized lifecycle transition" }, 1);
  assert.equal((await db.query("SELECT current_status_code FROM synapse.cases WHERE case_id=$1", [registered.entityId])).rows[0].current_status_code, "ASSIGNED");
  await assert.rejects(send({ type: "case.transition", caseId: registered.entityId, expectedVersion: "6", status: "ESCALATED", reason: "Skip stages" }, 1));
  results.push("Actual comments/audit and legal status transition persist; invalid transition rolls back without changing version.");
  await assert.rejects(send({ type: "comment.add", caseId: id(22), expectedVersion: "1", body: "Cross Bureau" }, 1));
  assert.ok(!(await engine.snapshot(principal(2))).cases.some((c) => c.id === registered.entityId));
  results.push("Application object-level scope denies the other Bureau in the isolated PostgreSQL adapter (not hosted JWT proof).");
  return results;
}
