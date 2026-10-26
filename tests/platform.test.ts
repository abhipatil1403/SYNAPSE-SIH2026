import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PlatformEngine, MemoryTransactionStore } from "../lib/platform/engine";
import { PlatformError, type Command, type State } from "../lib/platform/contracts";
import { authorizedSnapshot, platformDashboard, platformCalendar } from "../lib/platform/selectors";
import { platformFixture, fixtureId as id, principal, now } from "./fixtures/platform";
import { SupabasePlatformRepository, PlatformQueries, mapDatabaseCase } from "../lib/platform/repository";
import { conflictCandidates, contradictionCandidates } from "../lib/platform/innovations";
import { PrivateEvidenceService } from "../lib/platform/evidence";

const envelope = (command: Command, key: string = randomUUID()) => ({ idempotencyKey: key, command });
function setup(state = platformFixture()) {
  const store = new MemoryTransactionStore(state), engine = new PlatformEngine(store, () => now);
  return { store, engine, send: (c: Command, n = 1, key?: string) => engine.execute(principal(n), envelope(c, key)) };
}
test("platform projects exact assigned/Bureau scope with no staff, receipts, session or cross-Bureau data", async () => {
  const { engine } = setup();
  const a = await engine.snapshot(principal()), b = await engine.snapshot(principal(2));
  assert.equal(a.cases.length, 2); assert.equal(b.cases.length, 1);
  assert.ok(!a.cases.some((c) => b.cases.some((x) => x.id === c.id)));
  assert.ok(!("staff" in a) && !("receipts" in a) && !("sessionId" in a));
  assert.equal(a.sla.length, 1); assert.equal(b.sla.length, 0);
});
test("registration atomically updates registry, dashboard, audit and invalidation; idempotent replay does not duplicate", async () => {
  const { send, engine } = setup();
  const draft = await send({ type: "draft.create", sourceReference: "test-message-unique", source: "MANUAL", subject: "New verified intake", body: "Preserved original", language: "mr", bureauId: id(11), institutionId: null }, 3);
  await assert.rejects(send({ type: "draft.register", draftId: draft.entityId, expectedVersion: "1", categoryId: id(14), officerId: id(1), priority: "URGENT" }, 3), /verification/);
  await send({ type: "draft.verify", draftId: draft.entityId, expectedVersion: "1", institutionId: id(13), reason: "Verified original source" }, 3);
  const cmd: Command = { type: "draft.register", draftId: draft.entityId, expectedVersion: "2", categoryId: id(14), officerId: id(1), priority: "URGENT" };
  const key = randomUUID(), first = await send(cmd, 3, key), replay = await send(cmd, 3, key);
  assert.deepEqual(first, replay);
  const s = await engine.snapshot(principal());
  assert.equal(s.cases.length, 3); assert.equal(platformDashboard(s, now).total, 3);
  assert.equal(s.cases.find((c) => c.id === first.entityId)?.priority, "URGENT");
  assert.ok(first.invalidates.includes("dashboard"));
  assert.equal(s.activity.filter((a) => a.type === "draft.register").length, 1);
});
test("concurrent edits serialize and exactly one expected-version command wins", async () => {
  const { send, engine } = setup();
  const result = await Promise.allSettled([send({ type: "case.priority", caseId: id(21), expectedVersion: "1", priority: "HIGH", reason: "Urgent review" }), send({ type: "comment.add", caseId: id(21), expectedVersion: "1", body: "Competing edit" })]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await engine.snapshot(principal())).cases.find((c) => c.id === id(21))?.version, "2");
});
test("cross-Bureau, Auditor mutations, forged actors, idempotency conflicts and revoked sessions fail closed", async () => {
  const s = platformFixture(), { send, engine } = setup(s);
  await assert.rejects(send({ type: "comment.add", caseId: id(22), expectedVersion: "1", body: "Forbidden" }), /unavailable/);
  await assert.rejects(send({ type: "comment.add", caseId: id(21), expectedVersion: "1", body: "Forbidden" }, 4), /unavailable/);
  await assert.rejects(engine.execute(principal(), { ...envelope({ type: "notification.read", notificationId: id(60) }), actor: "Admin" }));
  const key = randomUUID(); await send({ type: "case.priority", caseId: id(21), expectedVersion: "1", priority: "LOW", reason: "Reviewed" }, 1, key);
  await assert.rejects(send({ type: "case.priority", caseId: id(21), expectedVersion: "2", priority: "HIGH", reason: "Changed" }, 1, key), /another command/);
  const revoked = platformFixture(); revoked.revokedSessions.push(principal().sessionId);
  await assert.rejects(setup(revoked).engine.snapshot(principal()), /active provisioned/);
});
test("shared calendar/SLA and dashboard use the same committed authorized snapshot and India civil dates", async () => {
  const { send, engine } = setup();
  await send({ type: "task.create", caseId: id(21), expectedVersion: "1", title: "Follow up", taskType: "FOLLOW_UP", assigneeId: id(1), dueAt: "2026-10-26T18:45:00.000Z" });
  const s = await engine.snapshot(principal()), events = platformCalendar(s), dash = platformDashboard(s, now, 7);
  assert.equal(events.find((e) => e.type === "TASK")?.day, "2026-10-27");
  assert.equal(dash.deadlines[0].id, events.find((e) => e.type === "SLA")?.id);
  assert.equal(dash.analytics.reduce((sum, r) => sum + r.received, 0), s.cases.length);
  assert.equal(dash.total, dash.active + dash.resolved);
});
test("dependency confirmation rejects cycles transactionally", async () => {
  const s = platformFixture(); s.relationships.push({ id: id(51), sourceId: id(21), targetId: id(23), type: "DEPENDS_ON", status: "CONFIRMED", reason: "Prerequisite", reviewerId: id(3) }, { id: id(52), sourceId: id(23), targetId: id(21), type: "DEPENDS_ON", status: "PROPOSED", reason: "Reverse", reviewerId: null });
  await assert.rejects(setup(s).send({ type: "relationship.review", caseId: id(23), expectedVersion: "1", relationshipId: id(52), decision: "CONFIRMED", reason: "Review" }, 3), /cycle/);
});
function closureState(): State {
  const s = platformFixture(); s.evidence.push({ id: id(61), caseId: id(23), documentId: id(62), versionId: id(63), number: 1, name: "Verified source", mediaType: "text/plain", byteSize: 5, sha256: "a".repeat(64), scan: "CLEAN", status: "VERIFIED", source: "Isolated test source", createdAt: now }); return s;
}
test("closure disposal requires a fresh approved policy/evaluation; material changes reject stale evaluations", async () => {
  const { send, engine } = setup(closureState());
  const e = await send({ type: "closure.evaluate", caseId: id(23), expectedVersion: "1", policyId: id(15) }, 3);
  await send({ type: "comment.add", caseId: id(23), expectedVersion: "1", body: "Material update" });
  await assert.rejects(send({ type: "closure.dispose", caseId: id(23), expectedVersion: "2", evaluationId: e.entityId, reason: "Attempt stale" }, 3), /Rerun/);
  const fresh = await send({ type: "closure.evaluate", caseId: id(23), expectedVersion: "2", policyId: id(15) }, 3);
  await send({ type: "closure.dispose", caseId: id(23), expectedVersion: "2", evaluationId: fresh.entityId, reason: "Authorized review" }, 3);
  assert.equal((await engine.snapshot(principal(3))).cases.find((c) => c.id === id(23))?.status, "DISPOSED");
});
test("missing closure evidence blocks disposal even with a valid evaluator ID", async () => {
  const { send } = setup(); const e = await send({ type: "closure.evaluate", caseId: id(23), expectedVersion: "1", policyId: id(15) }, 3);
  await assert.rejects(send({ type: "closure.dispose", caseId: id(23), expectedVersion: "1", evaluationId: e.entityId, reason: "Unauthorized completion" }, 3), /Rerun/);
});
test("DETAILS scope does not reveal evidence, finding provenance or one-sided graph relationships", async () => {
  const s = closureState(); s.grants.push({ caseId: id(23), userId: id(2), scope: "DETAILS", until: "2026-10-29T00:00:00Z", revoked: false });
  s.findings.push({ id: id(70), kind: "CONTRADICTION", caseIds: [id(23)], title: "Private candidate", explanation: "Private quote", sourceVersionIds: [id(63)], policyVersionId: null, ruleVersion: "v1", status: "DETECTED", reviewerId: null, reviewReason: "", createdAt: now });
  const snap = authorizedSnapshot(s, principal(2), now); assert.equal(snap.evidence.length, 0); assert.equal(snap.findings.length, 0);
});
test("rule-only conflict/contradiction candidates require authorized sources and matching context", () => {
  const s = closureState(), snap = authorizedSnapshot(s, principal(3), now);
  const action = { id: id(71), caseId: id(23), institutionId: id(13), campus: "A", issue: "approval", type: "APPROVE", startsAt: now, endsAt: "2026-10-27T00:00:00Z", sourceVersionIds: [id(63)] };
  const rule = { id: id(73), version: "reviewed-v1", policyVersionId: id(15), approved: true, incompatible: ["APPROVE", "SUSPEND"] as [string, string], explanation: "Reviewed fixture rule" };
  assert.equal(conflictCandidates(snap, [action, { ...action, id: id(72), type: "SUSPEND" }], [rule]).length, 1);
  assert.equal(conflictCandidates(snap, [action, { ...action, id: id(72), type: "SUSPEND", campus: "B" }], [rule]).length, 0);
  const claim = { id: id(74), caseId: id(23), subject: "Facility", predicate: "capacity", value: "40", campus: "A", from: now, until: "2026-10-27T00:00:00Z", versionId: id(63), page: 1, quote: "Sourced figure" };
  assert.equal(contradictionCandidates(snap, [claim, { ...claim, id: id(75), value: "50" }]).length, 1);
  assert.equal(contradictionCandidates(snap, [claim, { ...claim, id: id(75), value: "50", versionId: id(999) }]).length, 0);
});
test("Supabase adapter gates cannot invoke RPCs or trust a Demo identity; detail never leaks unknown objects", async () => {
  let calls = 0; const r = new SupabasePlatformRepository({ verifiedIdentity: async () => { calls++; return null; }, rpc: async () => { calls++; return { data: null }; } });
  await assert.rejects(r.snapshot(), (e: unknown) => e instanceof PlatformError && e.code === "platform_locked");
  await assert.rejects(r.command(envelope({ type: "notification.read", notificationId: id(70) })), /disabled/); assert.equal(calls, 0);
  const s = authorizedSnapshot(platformFixture(), principal(), now);
  const q = new PlatformQueries({ snapshot: async () => s, command: async () => { throw Error("not tested"); } });
  await assert.rejects(q.detail(id(22)), /unavailable/);
  assert.equal((await q.registry({ page: 1, pageSize: 1 })).total, 2);
  await assert.rejects(q.registry({ actor: "Admin" }));
});
test("database record mapping preserves bigint, nullable dates and urgent priority, rejects precision loss", () => {
  const row = { case_id: id(21), case_number: "9007199254740993", institution_id: id(13), category_id: id(14), lead_bureau_id: id(11), accountable_officer_id: null,
    title: "Database case", summary: null, current_status_code: "NEW", priority_code: "URGENT", received_at: now, updated_at: now, disposed_at: null, row_version: "9007199254740995" };
  assert.equal(mapDatabaseCase(row).caseNumber, "9007199254740993");
  assert.throws(() => mapDatabaseCase({ ...row, case_number: 9007199254740993 }), /bigint/);
});
test("private evidence never signs an unauthorized/quarantined object, and disabled upload never reserves metadata", async () => {
  let calls = 0;
  const service = new PrivateEvidenceService({ reserve: async () => { calls++; }, signedUpload: async () => { calls++; return { url: "https://example.invalid", expiresAt: now }; }, resolveAuthorizedObject: async () => { calls++; return null; }, signedDownload: async () => { calls++; return { url: "https://example.invalid", expiresAt: now }; } }, false);
  await assert.rejects(service.prepareUpload({ caseId: id(21), name: "clean.txt", mediaType: "text/plain", size: 5, sha256: "a".repeat(64) }, async () => {}), /require approval/);
  await assert.rejects(service.download(id(60), authorizedSnapshot(platformFixture(), principal(), now)), /unavailable/);
  assert.equal(calls, 0);
});

test("persisted duplicate candidates require a human decision and association preserves the original source", async () => {
  const { send, store, engine } = setup();
  const draft = await send({ type: "draft.create", sourceReference: "candidate-source", source: "MANUAL", subject: "Potential follow-up", body: "Distinct preserved original", language: "en", bureauId: id(11), institutionId: null }, 3);
  await send({ type: "draft.verify", draftId: draft.entityId, expectedVersion: "1", institutionId: id(13), reason: "Verified" }, 3);
  await store.transaction(async (s) => { s.matches.push({ id: id(80), draftId: draft.entityId, caseId: id(21), explanation: "Persisted test candidate", algorithmVersion: "fixture-human-v1", decision: "PENDING", reviewerId: null, reason: "" }); });
  await assert.rejects(send({ type: "draft.register", draftId: draft.entityId, expectedVersion: "2", categoryId: id(14), officerId: id(1), priority: "NORMAL" }, 3), /pending candidates/);
  await send({ type: "match.review", draftId: draft.entityId, expectedVersion: "2", matchId: id(80), decision: "RELATED", reason: "Human confirmed related correspondence" }, 3);
  await send({ type: "draft.associate", draftId: draft.entityId, expectedVersion: "3", caseId: id(21), reason: "Associate without merging or deleting" }, 3);
  const s = await engine.snapshot(principal(3));
  assert.equal(s.cases.length, 2); assert.equal(s.drafts[0].body, "Distinct preserved original");
  assert.equal(s.drafts[0].state, "LINKED_TO_EXISTING"); assert.equal(s.matches[0].reviewerId, id(3));
});

test("transfer completion rechecks independent dual authority, destination membership and preserves original SLA", async () => {
  const s = platformFixture(), until = "2026-10-30T00:00:00Z", from = "2026-10-01T00:00:00Z";
  s.staff.push({ id: id(5), authId: id(105), name: "Isolated dual Bureau approver", active: true,
    memberships: [11, 12].map((n) => ({ bureauId: id(n), from, until })), roles: [11, 12].map((n) => ({ code: "BUREAU_HEAD", bureauId: id(n), from, until })) });
  const { send, store, engine } = setup(s);
  await send({ type: "transfer.request", caseId: id(21), expectedVersion: "1", bureauId: id(12), officerId: id(2), reason: "Bureau coordination" }, 3);
  const t = (await engine.snapshot(principal(3))).transfers[0];
  await assert.rejects(send({ type: "transfer.decide", caseId: id(21), expectedVersion: "2", transferId: t.id, decision: "COMPLETED", reason: "Self approve" }, 3), /independent/);
  await store.transaction(async (state) => { state.staff.find((u) => u.id === id(2))!.active = false; });
  await assert.rejects(send({ type: "transfer.decide", caseId: id(21), expectedVersion: "2", transferId: t.id, decision: "COMPLETED", reason: "Target revoked" }, 5), /authority changed/);
  await store.transaction(async (state) => { state.staff.find((u) => u.id === id(2))!.active = true; });
  await send({ type: "transfer.decide", caseId: id(21), expectedVersion: "2", transferId: t.id, decision: "COMPLETED", reason: "Independent dual-scope approval" }, 5);
  const b = await engine.snapshot(principal(2)); assert.ok(b.cases.some((c) => c.id === id(21)));
  assert.equal(b.sla[0].originalDueAt, s.sla[0].originalDueAt);
  assert.ok(!(await engine.snapshot(principal())).cases.some((c) => c.id === id(21)));
});

test("expired memberships remove reads and self-approval does not grant DOCUMENTS", async () => {
  const s = platformFixture(); s.staff[0].memberships[0].until = "2026-10-25T00:00:00Z";
  assert.equal((await setup(s).engine.snapshot(principal())).cases.length, 0);
  const { send, engine } = setup(); const request = await send({ type: "access.request", caseId: id(21), scope: "DOCUMENTS", until: "2026-10-27T00:00:00Z", reason: "Additional source review" }, 3);
  await assert.rejects(send({ type: "access.decide", caseId: id(21), expectedVersion: "1", requestId: request.entityId, decision: "APPROVED", reason: "Self approval" }, 3), /different approver/);
  assert.equal((await engine.snapshot(principal(3))).accessRequests[0].status, "PENDING");
});
