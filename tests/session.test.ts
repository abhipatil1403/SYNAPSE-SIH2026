import { test } from "node:test";
import assert from "node:assert/strict";
import { endSession, sessionCookieName } from "../lib/live/session";
test("logout revokes JWT session before provider logout and always clears HttpOnly cookies", async () => {
  const calls: string[] = [];
  const result = await endSession({
    verifiedUser: async () => true,
    revokeCurrent: async () => {
      calls.push("revoke");
    },
    providerSignOut: async () => {
      calls.push("provider");
    },
    clearCookies: () => {
      calls.push("clear");
    },
  });
  assert.equal(result.signedOut, true);
  assert.deepEqual(calls, ["revoke", "provider", "clear"]);
});
test("logout handles provider/revocation outages without keeping local credentials or claiming success", async () => {
  for (const failing of ["verify", "revoke", "provider"]) {
    let cleared = false,
      providerCalled = false;
    await assert.rejects(
      endSession({
        verifiedUser: async () => {
          if (failing === "verify") throw Error("outage");
          return true;
        },
        revokeCurrent: async () => {
          if (failing === "revoke") throw Error("outage");
        },
        providerSignOut: async () => {
          providerCalled = true;
          if (failing === "provider") throw Error("outage");
        },
        clearCookies: () => {
          cleared = true;
        },
      }),
      /could not be verified/,
    );
    assert.ok(cleared);
    assert.ok(providerCalled);
  }
});
test("logout without a session is idempotent and never forges a revocation identity", async () => {
  let revoked = false;
  await endSession({
    verifiedUser: async () => false,
    revokeCurrent: async () => {
      revoked = true;
    },
    providerSignOut: async () => {},
    clearCookies: () => {},
  });
  assert.equal(revoked, false);
});
test("only app-session cookie chunks are cleared, never Demo Mode or unrelated cookies", () => {
  for (const name of [
    "synapse-phase1-session",
    "synapse-phase1-session.0",
    "synapse-phase1-session.12",
  ])
    assert.ok(sessionCookieName(name));
  for (const name of [
    "synapse.demo.role",
    "other",
    "synapse-phase1-session.attacker",
    "synapse-phase1-session2",
  ])
    assert.equal(sessionCookieName(name), false);
});
