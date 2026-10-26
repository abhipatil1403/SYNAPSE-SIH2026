import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePlan } from "../scripts/phase2/plan.mjs";
const now = new Date("2026-10-26T12:00:00Z");
const plan = {
  version: 1,
  approved: true,
  projectRef: "xjnukuerzlrxjjqwmgkn",
  runId: "phase2-unit-test",
  expiresAt: "2026-10-27T12:00:00Z",
  accounts: [
    {
      slot: "A",
      email: "officer-a@example.invalid",
      bureauName: "Approval",
      roleCode: "CASE_OFFICER",
    },
    {
      slot: "B",
      email: "officer-b@example.invalid",
      bureauName: "Academic",
      roleCode: "CASE_OFFICER",
    },
  ],
};
test("provisioning requires explicit approval, two separate addresses and exact project/roles", () => {
  assert.equal(validatePlan(plan, now).accounts.length, 2);
  for (const p of [
    { ...plan, approved: false },
    { ...plan, projectRef: "wrong" },
    {
      ...plan,
      accounts: [
        plan.accounts[0],
        { ...plan.accounts[1], email: plan.accounts[0].email },
      ],
    },
    {
      ...plan,
      accounts: [
        { ...plan.accounts[0], roleCode: "SYSTEM_ADMIN" },
        plan.accounts[1],
      ],
    },
    {
      ...plan,
      accounts: [
        { ...plan.accounts[0], password: "public-password" },
        plan.accounts[1],
      ],
    },
  ])
    assert.throws(() => validatePlan(p, now));
});
test("provisioning cannot create indefinite or expired test authority", () => {
  for (const expiresAt of ["2026-10-25T12:00:00Z", "2026-11-26T12:00:00Z"])
    assert.throws(() => validatePlan({ ...plan, expiresAt }, now));
});
