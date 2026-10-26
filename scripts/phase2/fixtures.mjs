import { randomUUID } from "node:crypto";
import { operatorContext, approvedPlan, safeMain } from "./operator.mjs";
import { loadVault, saveVault } from "./vault.mjs";
safeMain(async () => {
  const { plan, digest } = await approvedPlan();
  const file = `.local/phase2/${plan.runId}.vault`;
  const vault = await loadVault(file);
  if (
    vault.approvalDigest !== digest ||
    vault.accounts.length !== 2 ||
    vault.accounts.some((a) => !a.bureauId)
  )
    throw Error("Provisioned approved plan required.");
  if (!vault.fixtures) {
    vault.fixtures = {
      institutionId: randomUUID(),
      categoryId: randomUUID(),
      cases: vault.accounts.map((a) => ({
        slot: a.slot,
        id: randomUUID(),
        subject: `Phase 2 development isolation case ${a.slot} · ${plan.runId}`,
      })),
    };
    await saveVault(file, vault);
  }
  if (!process.argv.includes("--apply")) {
    console.log(
      "Two explicitly labeled development-only registry fixtures prepared. No business records written.",
    );
    return;
  }
  const { db } = await operatorContext();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `synapse-phase2:${plan.runId}`,
    ]);
    await db.query(
      "INSERT INTO synapse.institutions(institution_id,canonical_name,source_system,source_record_id) VALUES($1,$2,'SYNAPSE_PHASE2_TEST',$3) ON CONFLICT(institution_id) DO NOTHING",
      [
        vault.fixtures.institutionId,
        `Synthetic Phase 2 test institution · ${plan.runId}`,
        plan.runId,
      ],
    );
    await db.query(
      "INSERT INTO synapse.case_categories(category_id,category_code,category_name) VALUES($1,$2,'Phase 2 development test') ON CONFLICT(category_id) DO NOTHING",
      [
        vault.fixtures.categoryId,
        `P2_${vault.fixtures.categoryId.slice(0, 8).toUpperCase()}`,
      ],
    );
    for (const fixture of vault.fixtures.cases) {
      const account = vault.accounts.find((a) => a.slot === fixture.slot);
      const existing = (
        await db.query(
          "SELECT case_id,title,lead_bureau_id,accountable_officer_id FROM synapse.cases WHERE case_id=$1",
          [fixture.id],
        )
      ).rows[0];
      if (existing) {
        if (
          existing.title !== fixture.subject ||
          existing.lead_bureau_id !== account.bureauId ||
          existing.accountable_officer_id !== account.internalUserId
        )
          throw Error("Fixture changed; never overwrite it.");
        continue;
      }
      // Operator-only provisioning context uses the actual mapped user, never Demo Mode/browser input.
      await db.query("SELECT set_config('synapse.user_id',$1,true)", [
        account.internalUserId,
      ]);
      await db.query(
        "INSERT INTO synapse.cases(case_id,institution_id,category_id,current_status_code,lead_bureau_id,accountable_officer_id,title,summary,created_by_user_id) VALUES($1,$2,$3,'NEW',$4,$5,$6,'Synthetic development fixture; not an operational complaint.',$5)",
        [
          fixture.id,
          vault.fixtures.institutionId,
          vault.fixtures.categoryId,
          account.bureauId,
          account.internalUserId,
          fixture.subject,
        ],
      );
    }
    await db.query("COMMIT");
    console.log(
      "Two development-only cases prepared without modifying existing records or enabling application writes.",
    );
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    await db.end();
  }
});
