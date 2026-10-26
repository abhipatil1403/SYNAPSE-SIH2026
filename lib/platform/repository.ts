import { z } from "zod";
import { snapshotSchema, envelopeSchema, resultSchema, PlatformError, type Snapshot, type CommandResult } from "./contracts";
import { registry, platformDashboard, platformCalendar, authorizedReport } from "./selectors";

export interface PlatformRepository {
  snapshot(): Promise<Snapshot>;
  command(input: unknown): Promise<CommandResult>;
}
export interface AuthenticatedRpcTransport {
  verifiedIdentity(): Promise<{ userId: string; authId: string } | null>;
  // No browser identity parameters; PostgREST supplies gateway JWT context.
  rpc(name: "synapse_platform_snapshot" | "synapse_platform_command", args: Record<string, unknown>): Promise<{ data: unknown; code?: string }>;
}
export const activation = Object.freeze({ reads: false, businessWrites: false,
  reason: "Phase 2 NO-GO: provider-only logout replay remains unresolved; platform RPC authorization and managed-session migration are not approved." });
export class SupabasePlatformRepository implements PlatformRepository {
  constructor(private transport: AuthenticatedRpcTransport) {}
  private async authenticate() {
    const user = await this.transport.verifiedIdentity();
    if (!user) throw new PlatformError(401, "authentication_required", "Sign in using an approved active account.");
    return user;
  }
  async snapshot() {
    // Compile-time locked release gate has no browser/env override.
    if (!activation.reads) throw new PlatformError(503, "platform_locked", activation.reason);
    await this.authenticate();
    const response = await this.transport.rpc("synapse_platform_snapshot", {});
    if (response.code) throw new PlatformError(503, "repository_unavailable", "The reviewed platform read contract is unavailable.");
    return snapshotSchema.parse(response.data);
  }
  async command(input: unknown) {
    const parsed = envelopeSchema.parse(input);
    if (!activation.businessWrites) throw new PlatformError(503, "business_writes_locked", "Live business writes are disabled pending security and workflow approval.");
    await this.authenticate();
    const response = await this.transport.rpc("synapse_platform_command", { p_envelope: parsed });
    if (response.code) throw new PlatformError(409, "command_rejected", "The command could not be committed. Reload and review the current record.");
    return resultSchema.parse(response.data);
  }
}
export const registryQuerySchema = z.object({ q: z.string().trim().max(100).optional(), status: z.string().max(40).optional(), priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(), page: z.coerce.number().int().min(1).max(100000).optional(), pageSize: z.coerce.number().int().min(1).max(50).optional() }).strict();
export class PlatformQueries {
  constructor(private repository: PlatformRepository) {}
  async registry(query: unknown) { return registry(await this.repository.snapshot(), registryQuerySchema.parse(query)); }
  async detail(id: string) {
    z.uuid().parse(id);
    const s = await this.repository.snapshot(), c = s.cases.find((c) => c.id === id);
    if (!c) throw new PlatformError(404, "not_found", "The authorized case is unavailable.");
    return { case: c, tasks: s.tasks.filter((r) => r.caseId === id), comments: s.comments.filter((r) => r.caseId === id),
      activity: s.activity.filter((r) => r.caseId === id), evidence: s.evidence.filter((r) => r.caseId === id), sla: s.sla.filter((r) => r.caseId === id),
      relationships: s.relationships.filter((r) => r.sourceId === id || r.targetId === id), findings: s.findings.filter((r) => r.caseIds.includes(id)) };
  }
  async dashboard(period = 30) { return platformDashboard(await this.repository.snapshot(), new Date().toISOString(), period); }
  async calendar() { return platformCalendar(await this.repository.snapshot()); }
  async report() { return authorizedReport(await this.repository.snapshot()); }
}

// Validated identifiers and numeric strings remain exact; no cast to DemoState.
export function mapDatabaseCase(row: Record<string, unknown>) {
  const data = {
    id: row.case_id, caseNumber: String(row.case_number), institutionId: row.institution_id, categoryId: row.category_id,
    bureauId: row.lead_bureau_id, officerId: row.accountable_officer_id, subject: row.title, summary: row.summary ?? "",
    status: row.current_status_code, priority: row.priority_code,
    receivedAt: row.received_at instanceof Date ? row.received_at.toISOString() : row.received_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    disposedAt: row.disposed_at instanceof Date ? row.disposed_at.toISOString() : row.disposed_at ?? null,
    version: String(row.row_version),
  };
  // Refuse JS numbers that have already lost bigint precision.
  if ([row.case_number, row.row_version].some((v) => typeof v === "number" && !Number.isSafeInteger(v)))
    throw new PlatformError(503, "precision_loss", "Database bigint values must be returned as exact strings.");
  return snapshotSchema.shape.cases.element.parse(data);
}
