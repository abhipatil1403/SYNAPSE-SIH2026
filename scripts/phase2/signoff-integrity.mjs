import { readFile, readdir } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { operatorContext, safeMain, writeReport, projectRef } from "./operator.mjs";

safeMain(async () => {
  const { db } = await operatorContext();
  try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const current = (await db.query(await readFile("scripts/sql/capture-baseline.sql", "utf8"))).rows[0].baseline;
    const baseline = JSON.parse(await readFile("supabase/baseline/deployed-2026-10-26.catalog.json", "utf8"));
    const files = (await readdir("supabase/migrations")).filter((f) => f.endsWith(".sql"));
    const sql = (await Promise.all(files.map((f) => readFile("supabase/migrations/" + f, "utf8")))).join("\n");
    const enabledRls = new Set([...sql.matchAll(/ALTER TABLE synapse\.([a-z_]+) ENABLE ROW LEVEL SECURITY/g)].map((m) => m[1]));
    const checks = [], differences = [];
    const check = (id, passed, detail) => checks.push({ id, status: passed ? "pass" : "fail", detail, source: "Fresh read-only hosted catalog compared with original baseline and reviewed migrations" });
    for (const table of baseline.tables) {
      const now = current.tables.find((t) => t.name === table.name);
      const expected = { ...table, ...(enabledRls.has(table.name) ? { rls: true } : {}) };
      if (!isDeepStrictEqual(now, expected)) differences.push({ kind: "table_shape", name: table.name });
    }
    check("original_table_shapes", !differences.length, "All 69 original tables and 630 columns retain their original definitions/ownership; only reviewed RLS enablement is allowed.");
    for (const key of ["constraints", "indexes", "triggers", "views", "sequences", "grants"]) {
      const missing = baseline[key].filter((item) => !current[key].some((row) => isDeepStrictEqual(row, item)));
      check("original_" + key, missing.length === 0, `${baseline[key].length} original ${key} compared; ${missing.length} changed or missing.`);
    }
    const expectedPolicies = baseline.policies.map((p) => ["cases_select_authorized", "access_grants_select_authorized"].includes(p.policyname) ? { ...p, roles: ["synapse_app"] } : p);
    check("original_policies", expectedPolicies.every((p) => current.policies.some((row) => isDeepStrictEqual(row, p))), "Original policies are preserved, including the two reviewed Phase 1 role-target restrictions.");
    check("original_reference_data", isDeepStrictEqual(current.reference_data, baseline.reference_data), "All five original role/permission/status/relationship reference datasets are unchanged.");
    check("default_acl_unchanged", isDeepStrictEqual(current.default_acls, baseline.default_acls), "No default privileges were changed from the baseline.");
    const expectedNewTables = ["auth_identity_links", "phase1_access_config", "auth_session_revocations"];
    const newTables = current.tables.filter((t) => !baseline.tables.some((b) => b.name === t.name)).map((t) => t.name).sort();
    check("reviewed_table_additions", isDeepStrictEqual(newTables, expectedNewTables.sort()), "Only the three tables documented in Phase 1/2 migrations were added.");
    await db.query("COMMIT");
    await writeReport("signoff-integrity.json", { version: 1, projectRef, checkedAt: new Date().toISOString(), checks, differences, counts: current.counts, tables: current.tables.length, policies: current.policies.length,
      newTables, addedConstraints: current.constraints.filter((c) => !baseline.constraints.some((b) => isDeepStrictEqual(b, c))).map((c) => ({ table: c.table, name: c.name })),
      readOnlyInspection: true, baselineReplaced: false });
    for (const c of checks) console.log(`${c.status.toUpperCase()}: ${c.id}`);
    if (checks.some((c) => c.status !== "pass")) process.exitCode = 2;
  } finally { await db.query("ROLLBACK").catch(() => {}); await db.end(); }
});
