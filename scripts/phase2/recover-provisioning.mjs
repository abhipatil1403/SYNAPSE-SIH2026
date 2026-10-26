import { randomBytes, randomUUID } from "node:crypto";
import { operatorContext, approvedPlan, safeMain } from "./operator.mjs";
import { loadVault, saveVault } from "./vault.mjs";

// Recovery is limited to a just-created, never-used account from this approved run.
// It never adopts an unrelated account or rotates a provisioned user's password.
safeMain(async () => {
  if (!process.argv.includes("--recover-unmapped-owned-account"))
    throw Error("Explicit incomplete-provisioning recovery is required.");
  const { plan, digest } = await approvedPlan();
  const file = `.local/phase2/${plan.runId}.vault`;
  let vault;
  try { vault = await loadVault(file); } catch (error) {
    if (error.code !== "ENOENT") throw error;
    vault = { version: 1, runId: plan.runId, approvalDigest: digest, accounts: [] };
  }
  if (vault.approvalDigest !== digest) throw Error("Approval changed; recovery refused.");
  await saveVault(file, vault);
  await loadVault(file); // Check secure persistence before changing any credential.
  const { db, admin } = await operatorContext({ authAdmin: true });
  try {
    const { data, error } = await admin.listUsers({ page: 1, perPage: 1000 });
    if (error || data.users.length >= 1000) throw Error("Bounded Auth inventory failed.");
    for (const account of plan.accounts) {
      let entry = vault.accounts.find((a) => a.slot === account.slot);
      if (entry && !entry.recoveryPending) continue;
      const user = data.users.find((u) => u.email?.toLowerCase() === account.email.toLowerCase());
      if (!user) continue;
      const age = Date.now() - Date.parse(user.created_at);
      const existing = (await db.query(
        "SELECT EXISTS(SELECT FROM synapse.auth_identity_links WHERE auth_user_id=$1) OR EXISTS(SELECT FROM synapse.users WHERE lower(email)=lower($2)) AS linked",
        [user.id, account.email])).rows[0].linked;
      if (user.app_metadata?.synapse_test_run !== plan.runId || user.last_sign_in_at ||
          age < 0 || age > 3600000 || existing)
        throw Error("Recovery refused: account is not a recent, unused, unmapped creation from this run.");
      if (!entry) {
        entry = { slot: account.slot, email: account.email, authUserId: user.id,
          internalUserId: randomUUID(), password: randomBytes(36).toString("base64url"), recoveryPending: true };
        vault.accounts.push(entry);
      }
      await saveVault(file, vault);
      const result = await admin.updateUserById(user.id, { password: entry.password });
      if (result.error) throw Error("Owned account credential recovery failed.");
      entry.recoveryPending = false;
      await saveVault(file, vault);
      console.log(`Recovered unused approved slot ${account.slot}; credential remains DPAPI encrypted.`);
    }
  } finally { await db.end(); }
});
