import { z } from "zod";

// Configuration administrators may manage these Bureau roles only. Global and
// regional assignments, including SYSTEM_ADMIN, remain operator-reviewed.
export const bureauRoleSchema = z.enum(["CASE_OFFICER", "BUREAU_HEAD", "AUDITOR", "REVIEWER"]);
export const roleReviewSchema = z.object({
  requestId: z.uuid(), assignmentId: z.uuid(), expectedRole: bureauRoleSchema,
  expectedUntil: z.iso.datetime({ offset: true }).nullable(), revoke: z.boolean(),
  role: bureauRoleSchema.optional(), until: z.iso.datetime({ offset: true }).optional(),
  reason: z.string().trim().min(5).max(1000),
}).strict().superRefine((value, ctx) => {
  if (!value.revoke && (!value.role || !value.until)) ctx.addIssue({ code: "custom", message: "Choose a Bureau role and bounded expiry." });
  if (value.revoke && (value.role || value.until)) ctx.addIssue({ code: "custom", message: "Revocation cannot also assign a role." });
});
export const roleAssignmentsSchema = z.object({ assignments: z.array(z.object({
  id: z.uuid(), userId: z.uuid(), email: z.email(), bureauId: z.uuid(), bureau: z.string(),
  role: bureauRoleSchema, validFrom: z.string(), validUntil: z.string().nullable(), canManage: z.boolean(),
})), truncated: z.boolean() });
export type RoleAssignment = z.infer<typeof roleAssignmentsSchema>["assignments"][number];
export function localExpiryValue(original: string | null) {
  if (!original) return "";
  const date = new Date(original);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 23);
}
export function reviewedExpiry(value: string, original: string | null) {
  // Preserve the exact database timestamp, including sub-millisecond precision,
  // when an administrator leaves the displayed local expiry unchanged.
  return original && value === localExpiryValue(original) ? original : new Date(value).toISOString();
}

export function approvalExpiry(value: string, now = Date.now()) {
  const expires = new Date(value).getTime();
  if (!Number.isFinite(expires) || expires < now + 3600000 || expires > now + 90 * 86400000) throw new Error("Choose an assignment expiry at least one hour ahead and within 90 days.");
  return new Date(expires).toISOString();
}
