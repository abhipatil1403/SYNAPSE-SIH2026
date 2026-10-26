import { readFile } from "node:fs/promises";
import {
  operatorContext,
  writeReport,
  safeMain,
  projectRef,
} from "./operator.mjs";
safeMain(async () => {
  const { db } = await operatorContext();
  const results = [];
  try {
    const baseline = (
      await db.query(
        "SELECT (SELECT count(*) FROM synapse.users)::text users,(SELECT count(*) FROM synapse.cases)::text cases,(SELECT count(*) FROM synapse.auth_session_revocations)::text revocations,(SELECT read_enabled FROM synapse.phase1_access_config) gate,(SELECT read_until FROM synapse.phase1_access_config) lease",
      )
    ).rows[0];
    for (const file of [
      "phase1-authorization.sql",
      "phase2-authorization.sql",
    ]) {
      let source = await readFile(`supabase/tests/${file}`, "utf8");
      // Managed postgres is not a superuser. This admin-only test membership
      // is changed inside the fixture transaction and rolled back with it.
      if (file.startsWith("phase2")) source = source.replace("BEGIN;", "BEGIN;\nGRANT synapse_case_reader TO postgres WITH SET TRUE;");
      const r = await db.query(source);
      const checks =
        r
          .findLast((row) => row.fields?.some((f) => f.name === "test"))
          ?.rows.map((row) => row.test) ?? [];
      if (file.startsWith("phase2") && checks.length !== 20)
        throw Error("Unexpected Phase 2 authorization assertion count.");
      if (file.startsWith("phase1") && checks.length !== 49)
        throw Error("Unexpected Phase 1 authorization assertion count.");
      results.push({ file, checks, status: "pass" });
    }
    const after = (
      await db.query(
        "SELECT (SELECT count(*) FROM synapse.users)::text users,(SELECT count(*) FROM synapse.cases)::text cases,(SELECT count(*) FROM synapse.auth_session_revocations)::text revocations,(SELECT read_enabled FROM synapse.phase1_access_config) gate,(SELECT read_until FROM synapse.phase1_access_config) lease",
      )
    ).rows[0];
    if (JSON.stringify(after) !== JSON.stringify(baseline))
      throw Error("Hosted fixtures were not fully restored.");
    await writeReport("hosted-authorization-results.json", {
      version: 1,
      projectRef,
      checkedAt: new Date().toISOString(),
      source:
        "Actual deployed SQL under simulated gateway claims; not real issued JWTs",
      results,
      fixturesRolledBack: true,
    });
    console.log(
      "69 hosted SQL authorization assertions passed; all fixtures rolled back.",
    );
  } finally {
    await db.query("ROLLBACK").catch(() => {});
    await db.end();
  }
});
