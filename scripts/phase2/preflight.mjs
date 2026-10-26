import { readFile } from "node:fs/promises";
import { approvedPlan, writeReport, projectRef } from "./operator.mjs";
const checks = [];
for (const name of ["SUPABASE_SECRET_KEY", "DATABASE_URL"])
  checks.push({
    id: name,
    status: process.env[name]?.trim() ? "pass" : "blocked",
    detail: process.env[name]?.trim()
      ? "Operator variable is configured; value is not printed."
      : `Add ${name} to .env.operator.local.`,
    source: "Current process environment",
  });
try {
  await approvedPlan();
  checks.push({
    id: "approved_plan",
    status: "pass",
    detail:
      "Two distinct approved emails, exact role codes and bounded test authority are configured.",
    source: "Private approved account plan",
  });
} catch {
  checks.push({
    id: "approved_plan",
    status: "blocked",
    detail: "A valid private approved test-account plan is required.",
    source: "Current local plan validation",
  });
}
try {
  const r = JSON.parse(
    await readFile("docs/phase2/hosted-security-review.json", "utf8"),
  );
  const age = Date.now() - Date.parse(r.checkedAt);
  const verified = r.projectRef === projectRef && age >= 0 && age < 86400000 &&
    Array.isArray(r.checks) && r.checks.length > 0 && r.checks.every((c) => c.status === "pass");
  checks.push({
    id: "current_hosted_catalog",
    status:
      verified ? "pass" : "blocked",
    detail:
      "See the timestamped hosted-security report; no value is assumed from Phase 1.",
    source: "Existing operator audit evidence",
  });
} catch {
  checks.push({
    id: "current_hosted_catalog",
    status: "blocked",
    detail:
      "Fresh deployed catalog review is unavailable; connector requests were denied.",
    source: "Observed Phase 2 connector access result",
  });
}
await writeReport("preflight-results.json", {
  version: 1,
  projectRef,
  checkedAt: new Date().toISOString(),
  checks,
});
for (const c of checks)
  console.log(`${c.status.toUpperCase()}: ${c.id} — ${c.detail}`);
if (checks.some((c) => c.status !== "pass")) process.exitCode = 2;
