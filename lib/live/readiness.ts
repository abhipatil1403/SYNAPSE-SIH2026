import { z } from "zod";
export const readinessCheckSchema = z
  .object({
    id: z.string(),
    status: z.enum(["pass", "fail", "blocked"]),
    detail: z.string(),
    source: z.string(),
  })
  .strict();
export const readinessReceiptSchema = z
  .object({
    version: z.literal(1),
    projectRef: z.string(),
    checkedAt: z.iso.datetime(),
    checks: z.array(readinessCheckSchema),
  })
  .strict();
export type ReadinessCheck = z.infer<typeof readinessCheckSchema>;
export const readinessRequirements = [
  "rpc_ownership_rls",
  "rpc_execution_grants",
  "migration_history",
  "approved_two_accounts",
  "issued_jwt_login",
  "refresh_rotation",
  "logout_replay_denied",
  "expired_jwt_rejected",
  "suspension_revocation",
  "two_bureau_isolation",
  "documents_operations_denied",
  "business_writes_denied",
  "rpc_0029_review",
  "revoked_identity_denied",
  "expired_membership_denied",
  "invalid_jwt_rejected",
  "cross_account_misuse_denied",
  "external_logout_session_invalidation",
] as const;
export function evaluateReadiness(
  projectRef: string,
  checks: ReadinessCheck[],
  receipts: unknown[],
  now = new Date(),
) {
  const observed = new Map(checks.map((c) => [c.id, c]));
  const currentIds = new Set(observed.keys());
  const severity = { pass: 0, blocked: 1, fail: 2 };
  for (const value of receipts) {
    const receipt = readinessReceiptSchema.safeParse(value);
    if (!receipt.success || receipt.data.projectRef !== projectRef) continue;
    const age = now.getTime() - Date.parse(receipt.data.checkedAt);
    if (age < 0 || age > 24 * 60 * 60 * 1000) continue;
    for (const check of receipt.data.checks) {
      if (currentIds.has(check.id)) continue;
      const previous = observed.get(check.id);
      if (!previous || severity[check.status] > severity[previous.status])
        observed.set(check.id, check);
    }
  }
  for (const id of readinessRequirements)
    if (!observed.has(id))
      observed.set(id, {
        id,
        status: "blocked",
        detail: "A fresh verified check is unavailable.",
        source: "No matching current evidence",
      });
  const list = [...observed.values()];
  return {
    version: 1 as const,
    checkedAt: now.toISOString(),
    safeToActivateReadPreview: list.every((c) => c.status === "pass"),
    liveModeEnabled: false,
    businessWritesEnabled: false,
    checks: list,
  };
}
