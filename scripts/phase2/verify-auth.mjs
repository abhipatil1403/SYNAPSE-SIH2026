import assert from "node:assert/strict";
import {
  operatorContext,
  approvedPlan,
  writeReport,
  safeMain,
  projectRef,
} from "./operator.mjs";
import { loadVault, saveVault } from "./vault.mjs";
import { inspectSecurity } from "./security.mjs";
import { randomUUID } from "node:crypto";

safeMain(async () => {
  const { plan, digest } = await approvedPlan();
  const vaultFile = `.local/phase2/${plan.runId}.vault`;
  const vault = await loadVault(vaultFile);
  if (
    vault.approvalDigest !== digest ||
    vault.accounts.length !== 2 ||
    !vault.fixtures
  )
    throw Error(
      "Provisioned approved accounts and reviewed development fixtures are required.",
    );
  const { db, userClient, url, key } = await operatorContext();
  const checks = [];
  let restoreGate = null;
  const clients = [];
  const pass = (id, detail) =>
    checks.push({
      id,
      status: "pass",
      detail,
      source: "Real Supabase Auth-issued JWT and publishable-key Data API",
    });
  const blocked = (id, detail) =>
    checks.push({
      id,
      status: "blocked",
      detail,
      source: "Real-session verification prerequisites",
    });
  try {
    const security = await inspectSecurity(db);
    if (security.checks.some((c) => c.status !== "pass"))
      throw Error("Current RPC security check failed.");
    const gate = (
      await db.query(
        "SELECT read_enabled,read_until::text FROM synapse.phase1_access_config WHERE singleton",
      )
    ).rows[0];
    if (!gate) throw Error("Phase 2 migration has not been applied.");
    const ids = vault.accounts.map((a) => a.authUserId);
    const activeLinks = (
      await db.query(
        "SELECT auth_user_id FROM synapse.auth_identity_links WHERE revoked_at IS NULL",
      )
    ).rows;
    if (
      activeLinks.length !== 2 ||
      activeLinks.some((l) => !ids.includes(l.auth_user_id))
    )
      throw Error(
        "Controlled two-account test requires exactly the two approved active mappings.",
      );
    if (!process.argv.includes("--controlled-read"))
      throw Error(
        "Use --controlled-read only after reviewing the short test-only database read lease.",
      );
    if (gate.read_enabled)
      throw Error(
        "Refusing to change an already enabled preview; coordinate its operator first.",
      );
    restoreGate = gate;
    const lease=await db.query("UPDATE synapse.phase1_access_config SET read_enabled=true,read_until=now()+interval '10 minutes' WHERE singleton AND NOT read_enabled RETURNING read_until::text");
    if(lease.rowCount!==1)throw Error('Read gate changed concurrently.');
    restoreGate.leaseUntil=lease.rows[0].read_until;
    for (const account of vault.accounts) {
      const client = userClient();
      clients.push(client);
      const signed = await client.auth.signInWithPassword({
        email: account.email,
        password: account.password,
      });
      if (signed.error || !signed.data.session)
        throw Error("Issued-JWT login failed.");
      const verified = await client.auth.getUser(
        signed.data.session.access_token,
      );
      assert.equal(verified.data.user?.id, account.authUserId);
      const jwt = await client.auth.getClaims(signed.data.session.access_token);
      if (jwt.error) throw Error("JWT signature validation failed.");
      const claims = jwt.data.claims;
      assert.equal(claims.sub, account.authUserId);
      assert.equal(claims.role, "authenticated");
      assert.ok(claims.session_id);
      const me = await client.rpc("synapse_phase1_me");
      if (me.error) throw Error("Identity mapping failed.");
      assert.equal(me.data.internalUserId, account.internalUserId);
      account.testToken = {
        token: signed.data.session.access_token,
        expiresAt: signed.data.session.expires_at,
        sessionId: claims.session_id,
      };
      const deniedDocuments=await fetch(new URL('/rest/v1/documents?select=document_id&limit=1',url),{headers:{apikey:key,Authorization:`Bearer ${signed.data.session.access_token}`,'Accept-Profile':'synapse'}});
      assert.equal(deniedDocuments.status,406);await deniedDocuments.body?.cancel();
      const deniedOperation=await fetch(new URL('/rest/v1/rpc/dispose_case',url),{method:'POST',headers:{apikey:key,Authorization:`Bearer ${signed.data.session.access_token}`,'Content-Profile':'synapse','Content-Type':'application/json'},body:'{}'});
      assert.equal(deniedOperation.status,406);await deniedOperation.body?.cancel();
      const page = await client.rpc("synapse_phase1_cases");
      if (page.error) throw Error("Registry read failed.");
      const own = vault.fixtures.cases.find((c) => c.slot === account.slot),
        other = vault.fixtures.cases.find((c) => c.slot !== account.slot);
      assert.ok(page.data.items.some((c) => c.id === own.id));
      assert.ok(!page.data.items.some((c) => c.id === other.id));
      const hidden = await client.rpc("synapse_phase1_cases", {
        p_search: other.subject,
      });
      assert.equal(hidden.data?.total, 0);
      const refreshed = await client.auth.refreshSession();
      if (refreshed.error || !refreshed.data.session)
        throw Error("Session refresh failed.");
      assert.notEqual(
        refreshed.data.session.refresh_token,
        signed.data.session.refresh_token,
      );
      const after = await client.auth.getClaims(
        refreshed.data.session.access_token,
      );
      assert.equal(after.data?.claims.session_id, claims.session_id);
      assert.equal(
        (await client.rpc("synapse_phase1_me")).data?.internalUserId,
        account.internalUserId,
      );
    }
    pass(
      "issued_jwt_login",
      "Both approved accounts received actual Auth JWTs, passed signature/online identity validation and resolved distinct internal users.",
    );
    pass(
      "refresh_rotation",
      "Both accounts refreshed through Supabase; refresh tokens rotated and identity/session binding stayed stable.",
    );
    pass(
      "two_bureau_isolation",
      "Each officer read its own fixture and could not retrieve the other Bureau fixture or search result.",
    );
    pass('documents_operations_denied','Both authenticated users were denied private document reads and legacy disposal RPC access; neither feature is exposed.');
    // Negative credentials use the approved account only; never test arbitrary public identities.
    const bad = await userClient().auth.signInWithPassword({
      email: vault.accounts[0].email,
      password: "invalid-" + randomUUID(),
    });
    assert.ok(bad.error);
    const a = vault.accounts[0],
      clientA = clients[0];
    const original = (
      await db.query(
        "SELECT account_status FROM synapse.users WHERE user_id=$1 AND email=$2",
        [a.internalUserId, a.email],
      )
    ).rows[0];
    assert.equal(original?.account_status, "ACTIVE");
    try {
      await db.query(
        "UPDATE synapse.users SET account_status='SUSPENDED' WHERE user_id=$1 AND email=$2",
        [a.internalUserId, a.email],
      );
      assert.equal(
        (await clientA.rpc("synapse_phase1_cases")).error?.code,
        "42501",
      );
    } finally {
      await db.query(
        "UPDATE synapse.users SET account_status=$2 WHERE user_id=$1",
        [a.internalUserId, original.account_status],
      );
    }
    const roles = (
      await db.query(
        "SELECT user_role_assignment_id,valid_until FROM synapse.user_role_assignments a JOIN synapse.roles r ON r.role_id=a.role_id WHERE a.user_id=$1 AND a.bureau_id=$2 AND r.role_code='CASE_OFFICER'",
        [a.internalUserId, a.bureauId],
      )
    ).rows;
    assert.equal(roles.length, 1);
    try {
      await db.query(
        "UPDATE synapse.user_role_assignments SET valid_until=clock_timestamp() WHERE user_role_assignment_id=$1",
        [roles[0].user_role_assignment_id],
      );
      assert.equal((await clientA.rpc("synapse_phase1_cases")).data?.total, 0);
      assert.ok(
        (await clients[1].rpc("synapse_phase1_cases")).data?.items.some(
          (c) => c.id === vault.fixtures.cases.find((c) => c.slot === "B").id,
        ),
      );
    } finally {
      await db.query(
        "UPDATE synapse.user_role_assignments SET valid_until=$2 WHERE user_role_assignment_id=$1",
        [roles[0].user_role_assignment_id, roles[0].valid_until],
      );
    }
    pass(
      "suspension_revocation",
      "Suspension and role revocation removed Officer A reads immediately; Officer B stayed isolated. Original approved state was restored.",
    );
    for (let i = 0; i < clients.length; i++) {
      const session = await clients[i].auth.getSession();
      const token = session.data.session.access_token;
      const refreshToken = session.data.session.refresh_token;
      assert.equal(
        (await clients[i].rpc("synapse_phase2_revoke_session")).data,
        true,
      );
      assert.equal(
        (await clients[i].auth.signOut({ scope: "local" })).error,
        null,
      );
      const replay = await fetch(
        new URL("/rest/v1/rpc/synapse_phase1_cases", url),
        {
          method: "POST",
          headers: {
            apikey: key,
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        },
      );
      assert.ok([401, 403].includes(replay.status)); // PostgREST maps authenticated SQLSTATE 28000 to 403.
      const body = await replay.json();
      assert.equal(body.code, "28000");
      const expiredRefresh = await userClient().auth.refreshSession({ refresh_token: refreshToken });
      assert.ok(expiredRefresh.error, "Provider logout must also deny replay of the saved refresh token.");
    }
    pass(
      "logout_replay_denied",
      "Both sessions were revoked and signed out; replay of their previously valid access JWT was denied by the registry.",
    );
    // Real expiry cannot be simulated by changing JWT payloads. Preserve a signed sample encrypted for a later rerun.
    const prior = vault.expiryProbe;
    if (prior && prior.expiresAt * 1000 < Date.now()) {
      const expired = await fetch(
        new URL("/rest/v1/rpc/synapse_phase1_cases", url),
        {
          method: "POST",
          headers: {
            apikey: key,
            Authorization: `Bearer ${prior.token}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        },
      );
      assert.equal(expired.status, 401);
      assert.match((await expired.json()).message ?? "", /expir/i);
      pass(
        "expired_jwt_rejected",
        "An unchanged previously issued signed JWT was rejected by the gateway after its actual expiry.",
      );
    } else
      blocked(
        "expired_jwt_rejected",
        "No previously issued token has reached actual expiry yet; rerun after the encrypted expiry probe expires.",
      );
    if (!prior) vault.expiryProbe = vault.accounts[0].testToken;
    for (const account of vault.accounts) delete account.testToken;
    await saveVault(vaultFile, vault);
  } catch {
    checks.push({
      id: "real_session_run",
      status: "fail",
      detail:
        "Real-session checks did not complete; no positive result is inferred.",
      source: "Operator verification runner",
    });
    throw Error("Real-session test failed; see sanitized evidence.");
  } finally {
    try {
      if (restoreGate?.leaseUntil) {
        const restored=await db.query('UPDATE synapse.phase1_access_config SET read_enabled=$1,read_until=$2 WHERE singleton AND read_until=$3',[restoreGate.read_enabled,restoreGate.read_until,restoreGate.leaseUntil]);
        if(restored.rowCount!==1)throw Error('Read lease changed concurrently.');
      }
    } catch {
      checks.push({
        id: "lease_restoration",
        status: "fail",
        detail:
          "The test lease could not be restored; its expiry still limits access.",
        source: "Operator cleanup",
      });
    }
    try {
      await Promise.allSettled(
        clients.map((c) => c.auth.signOut({ scope: "local" })),
      );
    } finally {
      await db.end();
    }
    await writeReport("session-readiness.json", {
      version: 1,
      projectRef,
      checkedAt: new Date().toISOString(),
      checks,
    });
  }
  console.log(
    "Issued-JWT checks completed. Evidence contains no passwords or tokens. The read lease was restored to its prior disabled state.",
  );
});
