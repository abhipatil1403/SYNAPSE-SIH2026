import assert from "node:assert/strict";
import type { Client } from "pg";
import { randomUUID } from "node:crypto";
import pg from "pg";

// SQL authorization/persistence tests only. Claims are simulated, not issued JWTs.
export async function verifyAuthGateway(db: Client) {
  assert.match((await db.query("SELECT current_database() name")).rows[0].name, /^synapse_test_[a-f0-9]{32}$/);
  const authA = randomUUID(), authB = randomUUID(), authAdmin = randomUUID(), userAdmin = randomUUID(), bureau = randomUUID();
  await db.query("INSERT INTO auth.users(id) VALUES($1),($2),($3)", [authA, authB, authAdmin]);
  await db.query("INSERT INTO synapse.users(user_id,email,display_name) VALUES($1,'local-admin@example.invalid','Explicit local administrator')", [userAdmin]);
  await db.query("INSERT INTO synapse.auth_identity_links(auth_user_id,internal_user_id) VALUES($1,$2)", [authAdmin, userAdmin]);
  await db.query("INSERT INTO synapse.bureaus(bureau_id,bureau_code,bureau_name) VALUES($1,'AUTH_LOCAL','Isolated auth Bureau')", [bureau]);
  await db.query("INSERT INTO synapse.user_role_assignments(user_id,role_id,scope_type,valid_from) SELECT $1,role_id,'GLOBAL',now()-interval '1 hour' FROM synapse.roles WHERE role_code='SYSTEM_ADMIN'", [userAdmin]);
  const claims = (sub: string) => ({ sub, session_id: randomUUID(), role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 });
  const a = claims(authA), b = claims(authB), admin = claims(authAdmin);
  async function call(operation: "read" | "account" | "memberships" | "roles", subject: unknown, action: string, input = {}) {
    await db.query("BEGIN");
    try { await db.query("SET LOCAL ROLE synapse_web_gateway");
      const result = (await db.query(operation === "read" ? "SELECT synapse_gateway.read($1,$2,$3) result" : operation === "memberships" ? "SELECT synapse_gateway.memberships($1,$2,$3) result" : operation === "roles" ? "SELECT synapse_gateway.roles($1,$2,$3) result" : "SELECT synapse_gateway.account($1,$2,$3) result", [JSON.stringify(subject), action, input])).rows[0].result;
      await db.query("COMMIT"); return result;
    } catch (e) { await db.query("ROLLBACK"); throw e; }
  }
  await db.query("SET ROLE authenticated");
  await assert.rejects(db.query("SELECT public.synapse_phase1_cases()"), { code: "42501" });
  await assert.rejects(db.query("SELECT public.synapse_phase1_me()"), { code: "42501" });
  await assert.rejects(db.query("SELECT synapse_gateway.read('{}','account')"), { code: "42501" });
  await assert.rejects(db.query("SELECT synapse_gateway.roles('{}','list')"), { code: "42501" });
  await db.query("RESET ROLE");
  assert.equal((await call("read", a, "account")).status, "PENDING_APPROVAL");
  await call("account", a, "request", { email: "local-a@example.invalid", name: "Local pending A", confirmed: true });
  assert.equal((await db.query("SELECT count(*)::int n FROM synapse.auth_identity_links WHERE auth_user_id=$1", [authA])).rows[0].n, 0);
  await assert.rejects(call("account", a, "list"), { code: "42501" });
  await assert.rejects(call("account", a, "recovery.consume"), { code: "42501" });
  await call("account", a, "recovery.begin"); await call("account", a, "recovery.consume");
  await assert.rejects(call("account", a, "recovery.consume"), { code: "42501" });
  const pending = (await call("account", admin, "list")).requests[0];
  const approval = { authId: authA, revision: pending.revision, decision: "APPROVED", bureauId: bureau, role: "CASE_OFFICER", until: new Date(Date.now() + 86400000).toISOString(), reason: "Explicit local administrator review" };
  await assert.rejects(call("account", admin, "decide", { ...approval, until: undefined }), { code: "22023" });
  await assert.rejects(call("account", admin, "decide", { ...approval, revision: undefined }), { code: "22023" });
  await call("account", admin, "decide", approval);
  assert.equal((await call("read", a, "account")).status, "APPROVED");
  const approved = await call("read", a, "account");
  await db.query("BEGIN; GRANT synapse_case_reader TO postgres WITH SET TRUE; SET LOCAL ROLE synapse_case_reader");
  let crossBureauAssignment;
  try {
    await db.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify(a)]);
    crossBureauAssignment = (await db.query("SELECT synapse.phase1_can_read_case($1,$2,$3) allowed", [randomUUID(), randomUUID(), approved.internalUserId])).rows[0].allowed;
  } finally { await db.query("ROLLBACK"); }
  assert.equal(crossBureauAssignment, false, "Assignment alone cannot substitute for a current officer role/membership in the case's Bureau");
  const memberships = (await call("memberships", admin, "list")).memberships;
  const membership = memberships.find((m: { userId: string }) => m.userId === approved.internalUserId);
  assert.ok(membership);
  const review = { requestId: randomUUID(), membershipId: membership.id, expectedUntil: membership.validUntil, until: membership.validUntil, revoke: false, reason: "Verify exact approved expiry without role change" };
  assert.equal((await call("memberships", admin, "decide", review)).saved, true);
  assert.equal((await call("memberships", admin, "decide", review)).replayed, true);
  await assert.rejects(call("memberships", admin, "decide", { ...review, reason: "Conflicting payload" }), { code: "40001" });
  await assert.rejects(call("memberships", a, "list"), { code: "42501" });
  await assert.rejects(call("roles", a, "list"), { code: "42501" });
  const roleAssignment = (await call("roles", admin, "list")).assignments.find((r: { userId: string }) => r.userId === approved.internalUserId);
  assert.ok(roleAssignment); assert.equal(roleAssignment.role, "CASE_OFFICER");
  const roleReview = { requestId: randomUUID(), assignmentId: roleAssignment.id, expectedRole: roleAssignment.role, expectedUntil: roleAssignment.validUntil,
    revoke: false, role: "REVIEWER", until: roleAssignment.validUntil, reason: "Local independent Bureau role reassignment" };
  for (const invalid of [{ role: "SYSTEM_ADMIN" }, { expectedUntil: undefined }, { until: new Date(Date.now() + 2 * 86400000).toISOString() }, { bureauId: bureau }])
    await assert.rejects(call("roles", admin, "decide", { ...roleReview, ...invalid }), { code: "22023" });
  await assert.rejects(call("roles", admin, "decide", { ...roleReview, expectedRole: "AUDITOR" }), { code: "40001" });
  const globalAssignment = (await db.query("SELECT user_role_assignment_id FROM synapse.user_role_assignments WHERE user_id=$1", [userAdmin])).rows[0].user_role_assignment_id;
  await assert.rejects(call("roles", admin, "decide", { ...roleReview, assignmentId: globalAssignment }), { code: "42501" });
  const selfAssignment = (await db.query("INSERT INTO synapse.user_role_assignments(user_id,role_id,scope_type,bureau_id) SELECT $1,role_id,'BUREAU',$2 FROM synapse.roles WHERE role_code='CASE_OFFICER' RETURNING user_role_assignment_id", [userAdmin, bureau])).rows[0].user_role_assignment_id;
  await assert.rejects(call("roles", admin, "decide", { ...roleReview, assignmentId: selfAssignment }), { code: "42501" });
  await db.query("DELETE FROM synapse.user_role_assignments WHERE user_role_assignment_id=$1", [selfAssignment]);
  const changed = await call("roles", admin, "decide", roleReview); assert.ok(changed.saved); assert.notEqual(changed.assignmentId, roleAssignment.id);
  assert.deepEqual((await call("read", a, "account")).roles, ["REVIEWER"]);
  assert.equal((await call("roles", admin, "decide", roleReview)).replayed, true);
  await assert.rejects(call("roles", admin, "decide", { ...roleReview, reason: "Conflicting review" }), { code: "40001" });
  assert.equal((await db.query("SELECT valid_until<=clock_timestamp() expired FROM synapse.user_role_assignments WHERE user_role_assignment_id=$1", [roleAssignment.id])).rows[0].expired, true);
  await db.query("BEGIN; SET LOCAL ROLE synapse_web_gateway");
  await db.query("SELECT synapse_gateway.roles($1,'decide',$2)", [admin, { ...roleReview, requestId: randomUUID(), assignmentId: changed.assignmentId, expectedRole: "REVIEWER" }]);
  const competingRole = new pg.Client({ host: db.host, port: db.port, user: db.user, database: db.database, password: db.password });
  await competingRole.connect();
  try {
    await competingRole.query("SET lock_timeout='200ms'");
    await assert.rejects(competingRole.query("UPDATE synapse.user_role_assignments SET valid_until=clock_timestamp() WHERE user_id=$1", [userAdmin]), { code: "55P03" });
    await assert.rejects(competingRole.query("UPDATE synapse.user_bureau_memberships SET valid_until=clock_timestamp() WHERE user_id=$1", [approved.internalUserId]), { code: "55P03" });
  } finally { await competingRole.end(); await db.query("ROLLBACK"); }
  await call("roles", admin, "decide", { requestId: randomUUID(), assignmentId: changed.assignmentId, expectedRole: "REVIEWER", expectedUntil: roleReview.until, revoke: true, reason: "Local explicit role revocation" });
  assert.equal((await call("read", a, "account")).status, "PENDING_APPROVAL");
  assert.equal((await call("read", b, "account")).status, "PENDING_APPROVAL");
  await assert.rejects(call("account", admin, "decide", approval), { code: "40001" });
  await call("account", admin, "decide", { authId: authA, revision: "2", decision: "REVOKED", reason: "Explicit local revocation test" });
  assert.equal((await call("read", a, "account")).status, "PENDING_APPROVAL");
  assert.equal((await db.query("SELECT count(*)::int n FROM synapse_gateway.account_audit WHERE auth_user_id=$1", [authA])).rows[0].n, 4);
  // A separate connection cannot revoke the actor's role while a decision's
  // transaction holds authority locks. No privileged browser principal is used.
  await call("account", b, "request", { email: "local-b@example.invalid", name: "Local pending B", confirmed: true });
  await db.query("BEGIN; SET LOCAL ROLE synapse_web_gateway");
  await db.query("SELECT synapse_gateway.account($1,'decide',$2)", [admin, { ...approval, authId: authB, revision: "1" }]);
  const competing = new pg.Client({ host: db.host, port: db.port, user: db.user, database: db.database, password: db.password });
  await competing.connect();
  try {
    await competing.query("SET lock_timeout='200ms'");
    await assert.rejects(competing.query("UPDATE synapse.user_role_assignments SET valid_until=now() WHERE user_id=$1", [userAdmin]), { code: "55P03" });
  } finally { await competing.end(); await db.query("ROLLBACK"); }
  assert.equal((await call("read", b, "account")).status, "PENDING_APPROVAL");
  await db.query("BEGIN; SET LOCAL ROLE synapse_web_gateway");
  const key = "a".repeat(64);
  assert.equal((await db.query("SELECT synapse_gateway.limit_attempt($1,1,900) allowed", [key])).rows[0].allowed, true);
  assert.equal((await db.query("SELECT synapse_gateway.limit_attempt($1,1,900) allowed", [key])).rows[0].allowed, false);
  await db.query("COMMIT");
  return ["LOCAL AUTH: browser roles cannot invoke direct reads or the private gateway; pending users get no automatic mapping.",
    "LOCAL AUTH: only independent current global admins can approve; scoped membership/role persistence, stale decision rejection, revocation and append-only decision audit pass.",
    "LOCAL AUTH: independent Bureau role replacement/revocation retains history and audit, rejects global/self changes, membership-window excess, stale requests and conflicting replay.",
    "LOCAL AUTH: recovery requires an expiring one-use session grant; distributed database throttle rejects excess attempts.",
    "LOCAL AUTH: competing administrator role revocation blocks until the sensitive approval transaction ends; rollback leaves no target membership."];
}
