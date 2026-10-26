import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateReadiness,
  readinessRequirements,
} from "../lib/live/readiness";
const now = new Date("2026-10-26T12:00:00Z");
const receipt = (checks: unknown[]) => ({
  version: 1,
  projectRef: "test-project",
  checkedAt: now.toISOString(),
  checks,
});
const check = (id: string, status: "pass" | "fail" | "blocked" = "pass") => ({
  id,
  status,
  detail: "Observed test result",
  source: "Test receipt",
});
test("readiness cannot infer missing security tests passed", () => {
  const r = evaluateReadiness("test-project", [], [], now);
  assert.equal(r.safeToActivateReadPreview, false);
  assert.ok(r.checks.every((c) => c.status === "blocked"));
});
test("readiness rejects stale, future, malformed and different-project evidence", () => {
  const valid = receipt(readinessRequirements.map((id) => check(id)));
  for (const r of [
    { ...valid, projectRef: "wrong" },
    { ...valid, checkedAt: "2026-10-20T12:00:00Z" },
    { ...valid, checkedAt: "2026-10-27T12:00:00Z" },
    {},
  ])
    assert.equal(
      evaluateReadiness("test-project", [], [r], now).safeToActivateReadPreview,
      false,
    );
});
test("current failed checks override optimistic saved evidence", () => {
  const all = receipt(readinessRequirements.map((id) => check(id)));
  assert.equal(
    evaluateReadiness(
      "test-project",
      [check("rpc_execution_grants", "fail")],
      [all],
      now,
    ).safeToActivateReadPreview,
    false,
  );
});
test("readiness only becomes eligible with complete fresh positive evidence and never enables writes", () => {
  const r = evaluateReadiness(
    "test-project",
    [],
    [receipt(readinessRequirements.map((id) => check(id)))],
    now,
  );
  assert.equal(r.safeToActivateReadPreview, true);
  assert.equal(r.liveModeEnabled, false);
  assert.equal(r.businessWritesEnabled, false);
});

test("conflicting current receipts fail closed regardless of file order", () => {
  const all = receipt(readinessRequirements.map((id) => check(id)));
  const failed = receipt([check("two_bureau_isolation", "fail")]);
  for (const receipts of [[all, failed], [failed, all]]) {
    const result = evaluateReadiness("test-project", [], receipts, now);
    assert.equal(result.safeToActivateReadPreview, false);
    assert.equal(result.checks.find((c) => c.id === "two_bureau_isolation")?.status, "fail");
  }
});
