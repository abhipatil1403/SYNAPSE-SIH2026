import { test } from "node:test";
import assert from "node:assert/strict";
import { validatedClaims, accountDestination, accountSchema, signupSchema } from "../lib/auth/policy";
const authId = "50000000-0000-4000-8000-000000000001", sessionId = "50000000-0000-4000-8000-000000000002";
const project = "https://xjnukuerzlrxjjqwmgkn.supabase.co";
const claims = { sub: authId, session_id: sessionId, role: "authenticated", aud: "authenticated", iss: project + "/auth/v1", exp: 2000000000 };
const token = (value: unknown) => "already-online-verified." + Buffer.from(JSON.stringify(value)).toString("base64url") + ".not-used-as-signature";
test("trusted claim extraction binds online user, project, session, role and expiry without trusting metadata", () => {
  assert.equal(validatedClaims(token({ ...claims, user_metadata: { role: "SYSTEM_ADMIN" } }), { id: authId }, project).sub, authId);
  for (const change of [{ sub: sessionId }, { iss: "https://attacker.invalid/auth/v1" }, { aud: "other" }, { role: "service_role" }, { exp: 1 }, { session_id: "bad" }])
    assert.throws(() => validatedClaims(token({ ...claims, ...change }), { id: authId }, project));
});
test("unapproved accounts route to pending; registration cannot submit privileged fields", () => {
  assert.equal(accountDestination(accountSchema.parse({ status: "PENDING_APPROVAL", roles: [], memberships: [] })), "/pending-approval");
  assert.equal(signupSchema.safeParse({ email: "local@example.invalid", name: "Local", password: "long-local-test-password", role: "SYSTEM_ADMIN" }).success, false);
  assert.equal(signupSchema.safeParse({ email: "local@example.invalid", name: "Local", password: "short" }).success, false);
});
