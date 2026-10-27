import { test } from "node:test";
import assert from "node:assert/strict";
import { roleReviewSchema, reviewedExpiry, localExpiryValue } from "../lib/auth/administration";

const review = { requestId: "50000000-0000-4000-8000-000000000011", assignmentId: "50000000-0000-4000-8000-000000000012",
  expectedRole: "CASE_OFFICER", expectedUntil: "2026-10-29T12:00:00Z", revoke: false, role: "REVIEWER", until: "2026-10-29T12:00:00Z", reason: "Independent reviewed assignment" };
test("administration rejects global elevation, scope injection, absent concurrency fields and ambiguous revocation", () => {
  assert.ok(roleReviewSchema.safeParse(review).success);
  for (const change of [{ role: "SYSTEM_ADMIN" }, { scope: "GLOBAL" }, { bureauId: review.assignmentId }, { expectedUntil: undefined }, { revoke: true }])
    assert.equal(roleReviewSchema.safeParse({ ...review, ...change }).success, false);
  const revocation = Object.fromEntries(Object.entries(review).filter(([key]) => !["role", "until"].includes(key)));
  assert.ok(roleReviewSchema.safeParse({ ...revocation, revoke: true }).success);
});
test("unchanged local expiry preserves database precision and timezone representation", () => {
  for (const original of ["2026-10-29T12:00:00.123456+00:00", "2026-10-29T17:30:00.123456+05:30"])
    assert.equal(reviewedExpiry(localExpiryValue(original), original), original);
  assert.equal(localExpiryValue(null), "");
  assert.ok(Number.isFinite(Date.parse(reviewedExpiry("2026-10-29T12:00:00.001", null))));
});
