import assert from "node:assert/strict";
import { operatorContext, approvedPlan, safeMain, writeReport, projectRef } from "./operator.mjs";
import { loadVault } from "./vault.mjs";
import { withReadLease } from "./lease.mjs";

// Only approved test identities are changed, with exact conditional restoration.
// Case data is read with publishable-key, Auth-issued user JWTs, never operator credentials.
safeMain(async () => {
  if (!process.argv.includes("--controlled-read")) throw Error("Explicit bounded test lease is required.");
  const { plan, digest } = await approvedPlan();
  const vault = await loadVault(`.local/phase2/${plan.runId}.vault`);
  if (vault.approvalDigest !== digest || vault.accounts.length !== 2 || !vault.fixtures)
    throw Error("Approved provisioned pair and fixtures required.");
  const { db, userClient, url, key } = await operatorContext();
  const checks = [];
  const clients = [];
  const tokens = [];
  let phase = "preflight";
  const add = (id, status, detail) => checks.push({ id, status, detail, source: "Actual hosted database and issued-JWT negative tests" });
  const raw = async (path, token, body, extra = {}) => {
    const response = await fetch(url + path, { method: body === undefined ? "GET" : "POST",
      headers: { apikey: key, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...extra },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
    return { status: response.status, body: await response.json() };
  };
  const assertOtherStillScoped = async () => {
    const result = await clients[1].rpc("synapse_phase1_cases");
    assert.equal(result.error, null);
    assert.ok(result.data.items.some((c) => c.id === vault.fixtures.cases.find((c) => c.slot === "B").id));
    assert.ok(!result.data.items.some((c) => c.id === vault.fixtures.cases.find((c) => c.slot === "A").id));
  };
  try {
    await withReadLease(db, vault.accounts.map((a) => a.authUserId), async () => {
      for (const account of vault.accounts) {
        const client = userClient(); clients.push(client);
        const signed = await client.auth.signInWithPassword({ email: account.email, password: account.password });
        assert.equal(signed.error, null);
        tokens.push(signed.data.session.access_token);
      }
      phase = "unauthenticated";
      for (const name of ["synapse_phase1_me", "synapse_phase1_cases", "synapse_phase2_revoke_session"])
        assert.equal((await raw("/rest/v1/rpc/" + name, null, {})).status, 401);
      add("unauthenticated_rpc_denied", "pass", "Anonymous callers cannot invoke either read RPC or the logout RPC.");

      phase = "cross-account and invalid signatures";
      for (let i = 0; i < 2; i++) {
        const other = vault.fixtures.cases.find((c) => c.slot !== vault.accounts[i].slot);
        const result = await raw("/rest/v1/rpc/synapse_phase1_cases", tokens[i], { p_search: other.subject });
        assert.equal(result.status, 200); assert.equal(result.body.total, 0);
        const injection = await raw("/rest/v1/rpc/synapse_phase1_cases", tokens[i], { p_user_id: vault.accounts[1 - i].internalUserId });
        assert.equal(injection.status, 404); assert.equal(injection.body.code, "PGRST202");
        const parts = tokens[i].split(".");
        const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        claims.sub = vault.accounts[1 - i].authUserId;
        const tampered = parts[0] + "." + Buffer.from(JSON.stringify(claims)).toString("base64url") + "." + parts[2];
        assert.equal((await raw("/rest/v1/rpc/synapse_phase1_cases", tampered, {})).status, 401);
      }
      add("cross_account_misuse_denied", "pass", "Both real JWTs remain scoped to their own officer; supplying the other actor ID is rejected, and searching the other case returns zero rows.");
      add("invalid_jwt_rejected", "pass", "Changing either issued JWT subject to the other account without a valid signature is rejected with HTTP 401.");

      phase = "object enumeration";
      for (let i = 0; i < 2; i++) {
        for (const path of ["cases", "users", "documents", "auth_identity_links", "auth_session_revocations"])
          assert.equal((await raw("/rest/v1/" + path + "?select=*&limit=1", tokens[i])).status, 404);
        assert.equal((await raw("/rest/v1/documents?select=document_id&limit=1", tokens[i], undefined, { "Accept-Profile": "synapse" })).status, 406);
        for (const name of ["phase1_actor_id", "phase2_verified_subject", "dispose_case", "approve_case_access_request"])
          assert.equal((await raw("/rest/v1/rpc/" + name, tokens[i], {}, { "Content-Profile": "synapse" })).status, 406);
        const spec = await raw("/rest/v1/", tokens[i]);
        if (spec.status === 200) {
          const paths = Object.keys(spec.body.paths ?? {});
          assert.ok(!paths.some((p) => /^\/(cases|users|documents|auth_identity_links|auth_session_revocations)(\/|$)/.test(p)));
        }
      }
      add("private_object_enumeration_denied", "pass", "Private cases, identities, revocations and documents are not exposed as public objects; selecting the private schema and invoking security/business helpers are denied for both officers.");

      const a = vault.accounts[0];
      phase = "revoked identity";
      const oldLink = (await db.query("SELECT revoked_at::text FROM synapse.auth_identity_links WHERE auth_user_id=$1 AND internal_user_id=$2", [a.authUserId, a.internalUserId])).rows[0];
      assert.equal(oldLink.revoked_at, null);
      const revoked = (await db.query("UPDATE synapse.auth_identity_links SET revoked_at=clock_timestamp() WHERE auth_user_id=$1 AND internal_user_id=$2 AND revoked_at IS NULL RETURNING revoked_at::text", [a.authUserId, a.internalUserId])).rows[0];
      assert.ok(revoked);
      try {
        assert.equal((await clients[0].rpc("synapse_phase1_me")).error?.code, "42501");
        assert.equal((await clients[0].rpc("synapse_phase1_cases")).error?.code, "42501");
        await assertOtherStillScoped();
      } finally {
        const restored = await db.query("UPDATE synapse.auth_identity_links SET revoked_at=$2 WHERE auth_user_id=$1 AND revoked_at=$3::timestamptz", [a.authUserId, oldLink.revoked_at, revoked.revoked_at]);
        assert.equal(restored.rowCount, 1, "Identity restoration must match this test's exact change.");
      }
      add("revoked_identity_denied", "pass", "Revoking Officer A's explicit Auth mapping immediately denies identity and cases; B remains isolated. The original mapping was restored conditionally.");

      phase = "expired membership";
      const membership = (await db.query("SELECT membership_id,valid_until::text FROM synapse.user_bureau_memberships WHERE user_id=$1 AND bureau_id=$2 AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now())", [a.internalUserId, a.bureauId])).rows;
      assert.equal(membership.length, 1);
      const row = membership[0];
      const expired = (await db.query("UPDATE synapse.user_bureau_memberships SET valid_until=now()-interval '1 second' WHERE membership_id=$1 RETURNING valid_until::text", [row.membership_id])).rows[0];
      try {
        const me = await clients[0].rpc("synapse_phase1_me");
        assert.equal(me.error, null); assert.deepEqual(me.data.roleCodes, []);
        const cases = await clients[0].rpc("synapse_phase1_cases");
        assert.equal(cases.error, null); assert.equal(cases.data.total, 0);
        await assertOtherStillScoped();
      } finally {
        const restored = await db.query("UPDATE synapse.user_bureau_memberships SET valid_until=$2 WHERE membership_id=$1 AND valid_until=$3::timestamptz", [row.membership_id, row.valid_until, expired.valid_until]);
        assert.equal(restored.rowCount, 1, "Membership restoration must match this test's exact change.");
      }
      add("expired_membership_denied", "pass", "Expiry of A's Bureau membership removes its scoped role and returns zero cases immediately; B remains isolated. Original exact membership expiry was restored.");

      phase = "external provider-only logout";
      const sessionId = JSON.parse(Buffer.from(tokens[0].split(".")[1], "base64url").toString("utf8")).session_id;
      const sessionExists = async () => (await db.query("SELECT count(*)::int count FROM auth.sessions WHERE id=$1 AND user_id=$2", [sessionId, a.authUserId])).rows[0].count;
      assert.equal(await sessionExists(), 1);
      assert.equal((await clients[0].auth.signOut({ scope: "local" })).error, null);
      assert.equal(await sessionExists(), 0, "Provider logout must actually remove the managed session.");
      const stale = await raw("/rest/v1/rpc/synapse_phase1_cases", tokens[0], {});
      const online = await userClient().auth.getUser(tokens[0]);
      const onlineCode = typeof online.error?.code === "string" && /^[a-z0-9_]+$/i.test(online.error.code) ? online.error.code : "none";
      const invalidated = [401, 403].includes(stale.status) && stale.body.code === "28000";
      add("external_logout_session_invalidation", invalidated ? "pass" : "fail",
        invalidated ? "Provider-only logout also invalidates its original JWT at the registry." : `VERIFIED GAP: provider logout deleted the managed session, but its unexpired JWT still reads the registry (HTTP ${stale.status}); online getUser returned ${online.error?.status ?? 200}/${onlineCode}. SYNAPSE tombstones are not synchronized with external provider logout.`);
      // Retire that exact issued session through the application mechanism even if provider logout already removed it.
      assert.equal((await raw("/rest/v1/rpc/synapse_phase2_revoke_session", tokens[0], {})).body, true);
      const retired = await raw("/rest/v1/rpc/synapse_phase1_cases", tokens[0], {});
      assert.equal(retired.body.code, "28000");
      add("stale_application_session_denied", "pass", "Recording the original session tombstone immediately rejects its still-signed JWT even after provider-only logout; cleanup preserved account B.");
    });
  } catch {
    add("negative_run_complete", "fail", `Negative test runner stopped during ${phase}; subsequent cases are NOT VERIFIED. No secret-bearing error detail is recorded.`);
    process.exitCode = 1;
  } finally {
    for (let i = 0; i < tokens.length; i++) {
      try { await raw("/rest/v1/rpc/synapse_phase2_revoke_session", tokens[i], {}); } catch {}
    }
    await Promise.allSettled(clients.map((c) => c.auth.signOut({ scope: "local" })));
    const gate = (await db.query("SELECT read_enabled,read_until::text FROM synapse.phase1_access_config WHERE singleton")).rows[0];
    add("negative_run_gate_restored", gate.read_enabled === false && gate.read_until === null ? "pass" : "fail", "Post-test database gate and lease were checked against the disabled/null state.");
    await db.end();
    await writeReport("negative-readiness.json", { version: 1, projectRef, checkedAt: new Date().toISOString(), checks });
    for (const c of checks) console.log(`${c.status.toUpperCase()}: ${c.id}`);
    if (checks.some((c) => c.status !== "pass")) process.exitCode = process.exitCode || 2;
  }
});
