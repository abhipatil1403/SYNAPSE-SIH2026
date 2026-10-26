import { z } from "zod";
export const approvedPlanSchema = z
  .object({
    version: z.literal(1),
    approved: z.literal(true),
    projectRef: z.literal("xjnukuerzlrxjjqwmgkn"),
    runId: z.string().regex(/^phase2-[a-z0-9-]{4,40}$/),
    expiresAt: z.iso.datetime(),
    accounts: z.tuple([
      z
        .object({
          slot: z.literal("A"),
          email: z.email(),
          bureauName: z.literal("Approval"),
          roleCode: z.literal("CASE_OFFICER"),
        })
        .strict(),
      z
        .object({
          slot: z.literal("B"),
          email: z.email(),
          bureauName: z.literal("Academic"),
          roleCode: z.literal("CASE_OFFICER"),
        })
        .strict(),
    ]),
  })
  .strict();
export function validatePlan(value, now = new Date()) {
  const plan = approvedPlanSchema.parse(value);
  if (
    plan.accounts[0].email.toLowerCase() ===
    plan.accounts[1].email.toLowerCase()
  )
    throw Error("Two distinct approved accounts are required.");
  const expiry = Date.parse(plan.expiresAt) - now.getTime();
  if (expiry <= 0 || expiry > 7 * 86400000)
    throw Error("Test authority must expire within seven days.");
  return plan;
}
