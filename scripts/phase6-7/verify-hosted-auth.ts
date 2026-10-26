import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import pg from "pg";
import { operatorContext, safeMain } from "../phase2/operator.mjs";
import { loadVault } from "../phase2/vault.mjs";
import { withDevelopmentReadLease as withReadLease } from "./lease.mjs";
import { validatedClaims } from "../../lib/auth/policy";

safeMain(async () => {
  const vault = await loadVault(".local/phase2/phase2-approved-officers.vault");
  const { db, userClient, url, key } = await operatorContext();
  const server = new pg.Client({ connectionString: process.env.SYNAPSE_GATEWAY_DATABASE_URL, ssl: {
    ca: await readFile(process.env.SYNAPSE_GATEWAY_CA_FILE!, "utf8"), rejectUnauthorized: true, servername: new URL(process.env.SYNAPSE_GATEWAY_DATABASE_URL!).hostname,
  }, statement_timeout: 5000 });
  const checks: { id: string; status: string; detail: string }[] = [], clients = [userClient(), userClient()];
  let adminClient: ReturnType<typeof userClient> | undefined;
  const pass = (id: string, detail: string) => { checks.push({ id, status: "PASS", detail }); console.log("PASS " + id); };
  async function trusted(client: ReturnType<typeof userClient>, operation: string, query = {}) {
    const verified = await client.auth.getUser(); assert.ok(!verified.error && verified.data.user, "Online provider validation required");
    const session = (await client.auth.getSession()).data.session; assert.ok(session);
    const claims = validatedClaims(session.access_token, verified.data.user, url);
    await server.query("BEGIN");
    try { await server.query("SET LOCAL ROLE synapse_web_gateway"); const result = (await server.query("SELECT synapse_gateway.read($1,$2,$3) result", [JSON.stringify(claims), operation, query])).rows[0].result;
      await server.query("COMMIT"); return result;
    } catch (e) { await server.query("ROLLBACK"); throw e; }
  }
  try {
    try { const a = await loadVault(".local/phase2/admin-onboarding.vault"); if (a.state === "BOOTSTRAPPED") { adminClient = userClient(); const result = await adminClient.auth.signInWithPassword({ email: a.email, password: a.password }); assert.equal(result.error, null); } } catch (e) { if (adminClient) throw e; }
    await server.connect();
    assert.equal((await server.query("SELECT current_user name")).rows[0].name, "synapse_web_login");
    await assert.rejects(server.query("SELECT case_id FROM synapse.cases"), { code: "42501" });
    pass("restricted_login", "Real TLS login has no private source-schema read privileges.");
    const invalid = await userClient().auth.signInWithPassword({ email: vault.accounts[0].email, password: "deliberately-invalid-local-probe-" + Date.now() });
    assert.ok(invalid.error); pass("invalid_credentials", "Actual provider rejected incorrect credentials for an approved test account.");
    for (let i = 0; i < 2; i++) {
      const result = await clients[i].auth.signInWithPassword({ email: vault.accounts[i].email, password: vault.accounts[i].password }); assert.equal(result.error, null);
      assert.equal((await trusted(clients[i], "account")).status, "APPROVED");
      assert.equal((await clients[i].rpc("synapse_phase1_cases")).error?.code, "42501");
      assert.equal((await clients[i].rpc("synapse_phase1_me")).error?.code, "42501");
    }
    pass("real_login_mapping", "Both real Supabase sessions resolve approved current roles through the restricted gateway.");
    pass("direct_rpc_closed", "Both valid issued JWTs are denied execution of both public protected read RPCs.");
    if (!process.argv.includes("--controlled-read")) throw Error("Explicit bounded read test required.");
    await withReadLease(db, vault.accounts.map((a: { authUserId: string }) => a.authUserId), async () => {
      for (let i = 0; i < 2; i++) {
        const page = await trusted(clients[i], "cases");
        assert.ok(page.items.some((c: { id: string }) => c.id === vault.fixtures.cases.find((c: { slot: string }) => c.slot === (i === 0 ? "A" : "B")).id));
        assert.ok(page.items.every((c: { id: string }) => c.id !== vault.fixtures.cases.find((c: { slot: string }) => c.slot === (i === 0 ? "B" : "A")).id));
      }
      pass("two_account_isolation", "Under an expiring test-only lease each issued-JWT officer reads its own case and cannot read the other Bureau's case.");
      if (adminClient) { const config = await trusted(adminClient, "account"); assert.deepEqual(config.roles, ["SYSTEM_ADMIN"]); assert.deepEqual(config.memberships, []); assert.equal((await trusted(adminClient, "cases")).total, 0); pass("configuration_admin_no_case_access", "The verified approved development administrator has configuration authority but reads zero complaints under the same real SQL read lease."); }
      const account = vault.accounts[0], user = (await db.query("SELECT account_status FROM synapse.users WHERE user_id=$1", [account.internalUserId])).rows[0];
      try {
        await db.query("UPDATE synapse.users SET account_status='SUSPENDED' WHERE user_id=$1", [account.internalUserId]);
        assert.equal((await trusted(clients[0], "account")).status, "PENDING_APPROVAL");
        await assert.rejects(trusted(clients[0], "cases"), { code: "42501" });
        assert.equal((await trusted(clients[1], "account")).status, "APPROVED");
      } finally { await db.query("UPDATE synapse.users SET account_status=$2 WHERE user_id=$1", [account.internalUserId, user.account_status]); }
      const roles = (await db.query("SELECT user_role_assignment_id,valid_until::text FROM synapse.user_role_assignments WHERE user_id=$1 AND bureau_id=$2", [account.internalUserId, account.bureauId])).rows;
      try {
        for (const role of roles) await db.query("UPDATE synapse.user_role_assignments SET valid_until=clock_timestamp() WHERE user_role_assignment_id=$1", [role.user_role_assignment_id]);
        assert.equal((await trusted(clients[0], "account")).status, "PENDING_APPROVAL"); assert.equal((await trusted(clients[0], "cases")).total, 0);
      } finally { for (const role of roles) await db.query("UPDATE synapse.user_role_assignments SET valid_until=$2 WHERE user_role_assignment_id=$1", [role.user_role_assignment_id, role.valid_until]); }
      pass("suspension_role_revocation", "Current database suspension/role revocation denies reads immediately; original approved records restored exactly.");
      const memberships = (await db.query("SELECT membership_id,valid_until::text FROM synapse.user_bureau_memberships WHERE user_id=$1", [account.internalUserId])).rows;
      try {
        for (const m of memberships) await db.query("UPDATE synapse.user_bureau_memberships SET valid_until=clock_timestamp() WHERE membership_id=$1", [m.membership_id]);
        assert.equal((await trusted(clients[0], "account")).status, "PENDING_APPROVAL"); assert.equal((await trusted(clients[0], "cases")).total, 0);
      } finally { for (const m of memberships) await db.query("UPDATE synapse.user_bureau_memberships SET valid_until=$2 WHERE membership_id=$1", [m.membership_id, m.valid_until]); }
      pass("membership_revocation", "Membership expiry immediately denies Officer A's reads without changing B; exact original expiry values restored.");
    });
    const old = (await clients[0].auth.getSession()).data.session!;
    const refreshed = await clients[0].auth.refreshSession(); assert.equal(refreshed.error, null); assert.notEqual(refreshed.data.session?.refresh_token, old.refresh_token);
    pass("refresh_rotation", "Actual Supabase refresh exchange rotated the refresh token and retained authorized identity.");
    const token = refreshed.data.session!.access_token;
    assert.ok(JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).exp * 1000 > Date.now());
    assert.equal((await clients[0].auth.signOut({ scope: "local" })).error, null);
    const liveReplay = await userClient().auth.getUser(token); assert.ok(liveReplay.error || !liveReplay.data.user);
    const refreshReplay = await userClient().auth.refreshSession({ refresh_token: refreshed.data.session!.refresh_token }); assert.ok(refreshReplay.error);
    const rpc = await fetch(url + "/rest/v1/rpc/synapse_phase1_cases", { method: "POST", headers: { apikey: key, Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: "{}" });
    assert.ok([401,403].includes(rpc.status)); assert.equal((await rpc.json()).code, "42501");
    pass("provider_only_logout", "Unchanged unexpired JWT fails online Auth validation after provider-only logout; direct protected RPC execution also remains denied.");
    assert.equal((await clients[1].rpc("synapse_phase2_revoke_session")).data, true);
    assert.equal((await clients[1].auth.signOut({ scope: "local" })).error, null);
    pass("application_logout", "Real current-session application revocation and provider sign-out both succeeded for Officer B.");
  } catch (e) { checks.push({ id: "hosted_auth_run", status: "FAIL", detail: "A real hosted check failed; later steps are not inferred passing." }); throw e; }
  finally {
    await Promise.allSettled(clients.map((c) => c.auth.signOut({ scope: "local" })));
    await adminClient?.auth.signOut({ scope: "local" });
    const gate = (await db.query("SELECT read_enabled,read_until FROM synapse.phase1_access_config")).rows[0];
    await mkdir("docs/phase6-7", { recursive: true }); await writeFile("docs/phase6-7/hosted-auth-results.json", JSON.stringify({ checkedAt: new Date().toISOString(), checks, finalGate: gate }, null, 2));
    await server.end(); await db.end();
  }
});
