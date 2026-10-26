import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import {
  operatorContext,
  approvedPlan,
  writeReport,
  safeMain,
} from "./operator.mjs";
import { saveVault, loadVault } from "./vault.mjs";
import { inspectSecurity } from "./security.mjs";

safeMain(async () => {
  const { plan, digest } = await approvedPlan();
  const { db, admin } = await operatorContext({ authAdmin: true });
  const vaultFile = `.local/phase2/${plan.runId}.vault`;
  let vault;
  try {
    vault = await loadVault(vaultFile);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    vault = {
      version: 1,
      runId: plan.runId,
      approvalDigest: digest,
      accounts: [],
    };
  }
  if (vault.approvalDigest !== digest)
    throw Error(
      "Existing test run does not match current approval; no identity will be overwritten.",
    );
  try {
    const review = await inspectSecurity(db);
    if (review.checks.some((c) => c.status !== "pass"))
      throw Error("RPC review failed; provisioning is blocked.");
    const role = (
      await db.query(
        "SELECT role_id FROM synapse.roles WHERE role_code='CASE_OFFICER' AND is_active",
      )
    ).rows;
    if (role.length !== 1)
      throw Error("Exact active CASE_OFFICER role missing or ambiguous.");
    const migrated = (
      await db.query(
        "SELECT to_regclass('synapse.auth_session_revocations') IS NOT NULL AS ready",
      )
    ).rows[0].ready;
    if (!migrated)
      throw Error(
        "Reviewed Phase 2 migration must be applied before provisioning.",
      );
    const bureaus = [];
    for (const account of plan.accounts) {
      const matches = (
        await db.query(
          "SELECT bureau_id,bureau_code,bureau_name FROM synapse.bureaus WHERE is_active AND lower(bureau_name)=ANY($1::text[])",
          [
            [
              account.bureauName.toLowerCase(),
              `${account.bureauName.toLowerCase()} bureau`,
            ],
          ],
        )
      ).rows;
      if (matches.length > 1)
        throw Error(
          "Approved Bureau name is ambiguous; resolve without guessing.",
        );
      bureaus.push(matches[0] ?? null);
    }
    // --check never creates Auth users, database rows or passwords.
    if (!process.argv.includes("--apply")) {
      console.log(
        "Provisioning preflight passed. Use --apply only for the approved local plan; credentials will be DPAPI encrypted.",
      );
      return;
    }
    // Prove persistence works before the first Auth mutation.
    await saveVault(vaultFile, vault);
    if ((await loadVault(vaultFile)).approvalDigest !== digest)
      throw Error("Credential vault round-trip failed before provisioning.");
    for (const account of plan.accounts) {
      let entry = vault.accounts.find((a) => a.slot === account.slot);
      if (entry) {
        if (entry.recoveryPending) throw Error("Complete pending credential recovery before provisioning.");
        const { data, error } = await admin.getUserById(entry.authUserId);
        if (
          error ||
          data.user.email?.toLowerCase() !== account.email.toLowerCase() ||
          data.user.app_metadata?.synapse_test_run !== plan.runId
        )
          throw Error(
            "Existing Auth account does not match this approved test run.",
          );
        continue;
      }
      // Refuse to adopt/reset a pre-existing email, even when it is in the approved plan.
      let page = 1;
      while (true) {
        const { data, error } = await admin.listUsers({ page, perPage: 200 });
        if (error) throw Error("Auth inventory unavailable.");
        if (
          data.users.some(
            (u) => u.email?.toLowerCase() === account.email.toLowerCase(),
          )
        )
          throw Error(
            "Approved email already exists; link via a separately reviewed existing-user procedure.",
          );
        if (data.users.length < 200) break;
        page++;
        if (page > 100) throw Error("Bounded Auth inventory exceeded.");
      }
      const password = randomBytes(36).toString("base64url");
      const { data, error } = await admin.createUser({
        email: account.email,
        password,
        email_confirm: true,
        app_metadata: { synapse_test_run: plan.runId },
        user_metadata: {
          display_name: `SYNAPSE Phase 2 test officer ${account.slot}`,
        },
      });
      if (error || !data.user) throw Error("Auth account creation failed.");
      entry = {
        slot: account.slot,
        email: account.email,
        password,
        authUserId: data.user.id,
        internalUserId: randomUUID(),
      };
      vault.accounts.push(entry);
      // Save after each creation: retry never resets or deletes an existing account.
      await saveVault(vaultFile, vault);
    }
    await db.query("BEGIN");
    try {
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `synapse-phase2:${plan.runId}`,
      ]);
      const roleId = role[0].role_id;
      for (let i = 0; i < plan.accounts.length; i++) {
        const account = plan.accounts[i],
          entry = vault.accounts.find((a) => a.slot === account.slot);
        let bureau = bureaus[i];
        if (!bureau) {
          const code = `P2_${account.bureauName.toUpperCase()}_${plan.runId.slice(-8).toUpperCase()}`;
          bureau = (
            await db.query(
              "SELECT bureau_id,bureau_code,bureau_name FROM synapse.bureaus WHERE bureau_code=$1",
              [code],
            )
          ).rows[0];
          if (!bureau)
            bureau = (
              await db.query(
                "INSERT INTO synapse.bureaus(bureau_code,bureau_name) VALUES($1,$2) RETURNING bureau_id,bureau_code,bureau_name",
                [
                  code,
                  `${account.bureauName} Bureau · Phase 2 development test`,
                ],
              )
            ).rows[0];
        }
        const existing = (
          await db.query(
            "SELECT user_id,account_status,is_global_admin FROM synapse.users WHERE user_id=$1 OR lower(email)=lower($2)",
            [entry.internalUserId, account.email],
          )
        ).rows;
        if (existing.some((u) => u.user_id !== entry.internalUserId))
          throw Error(
            "Internal email collision; existing identity is never replaced.",
          );
        if (
          existing.some(
            (u) => u.account_status !== "ACTIVE" || u.is_global_admin,
          )
        )
          throw Error(
            "Existing test identity authority changed; do not reactivate or broaden it automatically.",
          );
        if (!existing.length)
          await db.query(
            "INSERT INTO synapse.users(user_id,email,display_name,account_status,is_global_admin,external_subject) VALUES($1,$2,$3,'ACTIVE',false,$4)",
            [
              entry.internalUserId,
              account.email,
              `Phase 2 test officer ${account.slot}`,
              entry.authUserId,
            ],
          );
        const link = (
          await db.query(
            "SELECT internal_user_id,revoked_at FROM synapse.auth_identity_links WHERE auth_user_id=$1",
            [entry.authUserId],
          )
        ).rows[0];
        if (link && link.internal_user_id !== entry.internalUserId)
          throw Error("Auth binding collision; never overwrite a mapping.");
        if (link?.revoked_at)
          throw Error(
            "Test mapping was revoked; automatic reprovisioning is prohibited.",
          );
        if (!link)
          await db.query(
            "INSERT INTO synapse.auth_identity_links(auth_user_id,internal_user_id) VALUES($1,$2)",
            [entry.authUserId, entry.internalUserId],
          );
        await db.query(
          "INSERT INTO synapse.user_bureau_memberships(user_id,bureau_id,membership_type,valid_until) SELECT $1,$2,'MEMBER',$3 WHERE NOT EXISTS(SELECT FROM synapse.user_bureau_memberships WHERE user_id=$1 AND bureau_id=$2 AND valid_until>$3::timestamptz-interval '1 second')",
          [entry.internalUserId, bureau.bureau_id, plan.expiresAt],
        );
        await db.query(
          "INSERT INTO synapse.user_role_assignments(user_id,role_id,scope_type,bureau_id,valid_until) SELECT $1,$2,'BUREAU',$3,$4 WHERE NOT EXISTS(SELECT FROM synapse.user_role_assignments WHERE user_id=$1 AND role_id=$2 AND bureau_id=$3 AND valid_until>$4::timestamptz-interval '1 second')",
          [entry.internalUserId, roleId, bureau.bureau_id, plan.expiresAt],
        );
        entry.bureauId = bureau.bureau_id;
      }
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
    await saveVault(vaultFile, vault);
    await writeReport("provisioning-results.json", {
      version: 1,
      projectRef: plan.projectRef,
      checkedAt: new Date().toISOString(),
      runId: plan.runId,
      expiresAt: plan.expiresAt,
      credentialsPrinted: false,
      accountsProvisioned: vault.accounts.length,
      businessWritesEnabled: false,
      liveModeEnabled: false,
    });
    console.log(
      "Two approved accounts provisioned. Passwords are in the current Windows user’s DPAPI vault, not logs or public files. Preview gates were not changed.",
    );
  } finally {
    await db.end();
  }
});
