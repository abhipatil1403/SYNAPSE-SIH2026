import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  operatorContext,
  approvedPlan,
  writeReport,
  safeMain,
  projectRef,
} from "./operator.mjs";
import { inspectSecurity } from "./security.mjs";
safeMain(async () => {
  const { db } = await operatorContext();
  try {
    const inspection = await inspectSecurity(db);
    const history = (
      await db.query(
        "SELECT version,name,statements FROM supabase_migrations.schema_migrations ORDER BY version",
      )
    ).rows;
    const files = (await readdir("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const migrations = [];
    for (const file of files) {
      const source = await readFile(`supabase/migrations/${file}`, "utf8");
      const item = history.find((h) => h.name === file.slice(15, -4));
      migrations.push({
        file,
        applied: Boolean(item),
        matches:
          Boolean(item) &&
          createHash("sha256")
            .update(item.statements.join("").replaceAll("\r\n", "\n").trim())
            .digest("hex") ===
            createHash("sha256")
              .update(source.replaceAll("\r\n", "\n").trim())
              .digest("hex"),
      });
    }
    const allMatch = migrations.every((m) => m.applied && m.matches);
    const checks = [
      ...inspection.checks,
      {
        id: "migration_history",
        status: allMatch ? "pass" : "fail",
        detail: allMatch
          ? "Every reviewed migration matches deployed history."
          : "One or more migrations are unapplied or differ from deployed history.",
        source: "Current deployed migration statements vs local SQL",
      },
    ];
    const baseline = JSON.parse(await readFile("supabase/baseline/deployed-2026-10-26.catalog.json", "utf8"));
    let legacyMatches = true;
    for (const fn of baseline.functions) {
      const current = (await db.query("SELECT pg_get_functiondef($1::regprocedure) AS definition", [fn.identity])).rows[0].definition;
      if (current !== fn.definition) legacyMatches = false;
    }
    checks.push({ id: "legacy_functions_preserved", status: legacyMatches ? "pass" : "fail",
      detail: legacyMatches ? "All 30 original legacy functions match the recorded database baseline." : "A legacy function differs from the original baseline.",
      source: "Current pg_get_functiondef vs preserved baseline" });
    let approvedScopes = [];
    try {
      const { plan } = await approvedPlan();
      const { rows } = await db.query(
        `SELECT u.user_id,u.email,u.account_status,u.is_global_admin,l.auth_user_id,l.revoked_at,
        m.bureau_id,b.bureau_code,b.bureau_name,r.role_code,a.valid_until FROM synapse.users u
        JOIN synapse.auth_identity_links l ON l.internal_user_id=u.user_id
        JOIN synapse.user_bureau_memberships m ON m.user_id=u.user_id AND m.valid_from<=now() AND (m.valid_until IS NULL OR m.valid_until>now())
        JOIN synapse.bureaus b ON b.bureau_id=m.bureau_id AND b.is_active
        JOIN synapse.user_role_assignments a ON a.user_id=u.user_id AND a.bureau_id=m.bureau_id AND a.scope_type='BUREAU' AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now())
        JOIN synapse.roles r ON r.role_id=a.role_id AND r.is_active WHERE lower(u.email)=ANY($1::text[])`,
        [plan.accounts.map((a) => a.email.toLowerCase())],
      );
      const active = rows.filter(
        (r) =>
          r.account_status === "ACTIVE" &&
          !r.is_global_admin &&
          !r.revoked_at &&
          r.role_code === "CASE_OFFICER",
      );
      const ready =
        active.length === 2 &&
        new Set(active.map((r) => r.bureau_id)).size === 2 &&
        new Set(active.map((r) => r.auth_user_id)).size === 2 &&
        plan.accounts.every((account) => active.some((r) =>
          r.email.toLowerCase() === account.email.toLowerCase() &&
          [account.bureauName.toLowerCase(), `${account.bureauName.toLowerCase()} bureau`,
            `${account.bureauName.toLowerCase()} bureau · phase 2 development test`].includes(r.bureau_name.toLowerCase())));
      approvedScopes = plan.accounts.map((account) => {
        const row = active.find((r) => r.email.toLowerCase() === account.email.toLowerCase());
        return { slot: account.slot, bureauCode: row?.bureau_code ?? null,
          bureauName: row?.bureau_name ?? null, roleCode: row?.role_code ?? null,
          validUntil: row?.valid_until ?? null };
      });
      checks.push({
        id: "approved_two_accounts",
        status: ready ? "pass" : "fail",
        detail: ready
          ? "The two approved staff test identities have separate current Bureau scopes."
          : "Approved identities, mappings or distinct current Bureau scopes are incomplete.",
        source: "Current identity/membership/role joins; approved private plan",
      });
    } catch {
      checks.push({
        id: "approved_two_accounts",
        status: "blocked",
        detail: "Approved account provisioning could not be verified.",
        source: "Current operator audit",
      });
    }
    await writeReport("hosted-security-review.json", {
      version: 1,
      projectRef,
      checkedAt: new Date().toISOString(),
      inspection,
      migrations,
      approvedScopes,
      checks,
      advisor0029: {
        status: "manual_review_required",
        reason:
          "Authenticated definer RPCs are intentional boundaries; this audit verifies owner/RLS/grants but is not independent signoff.",
      },
    });
    await writeReport("hosted-readiness.json", {
      version: 1,
      projectRef,
      checkedAt: new Date().toISOString(),
      checks,
    });
    for (const c of checks) console.log(`${c.status.toUpperCase()}: ${c.id}`);
    if (checks.some((c) => c.status !== "pass")) process.exitCode = 2;
  } finally {
    await db.end();
  }
});
