import { z } from "zod";
import { liveStatuses, livePriorities, liveRoles } from "../live/contracts";

const id = z.uuid();
const text = z.string().trim().min(1).max(4000);
const at = z.iso.datetime({ offset: true });
export const version = z.string().regex(/^[1-9][0-9]*$/);
export const scopeSchema = z.enum(["DETAILS", "DOCUMENTS", "COORDINATE"]);
export const principalSchema = z.object({
  authId: id, userId: id, sessionId: id,
}).strict();
export type Principal = z.infer<typeof principalSchema>;
export const staffSchema = z.object({ id, authId: id, name: text, active: z.boolean(),
  memberships: z.array(z.object({ bureauId: id, from: at, until: at.nullable() }).strict()),
  roles: z.array(z.object({ code: z.enum(liveRoles), bureauId: id.nullable(), from: at, until: at.nullable() }).strict()),
}).strict();
export const caseSchema = z.object({ id, caseNumber: version, institutionId: id, categoryId: id,
  bureauId: id, officerId: id.nullable(), subject: text, summary: z.string().max(20000),
  status: z.enum(liveStatuses), priority: z.enum(livePriorities),
  receivedAt: at, updatedAt: at, disposedAt: at.nullable(), version,
}).strict();
export const draftSchema = z.object({ id, sourceReference: text, source: z.enum(["MANUAL", "EMAIL", "API"]),
  subject: text, body: text, language: z.enum(["en", "hi", "mr"]), institutionId: id.nullable(),
  bureauId: id, creatorId: id, state: z.enum(["DRAFT", "UNDER_REVIEW", "ACCEPTED", "REJECTED", "LINKED_TO_EXISTING"]),
  verified: z.boolean(), reviewerId: id.nullable(), linkedCaseId: id.nullable(), receivedAt: at, version,
}).strict();
export const taskSchema = z.object({ id, caseId: id, bureauId: id, assigneeId: id.nullable(), title: text,
  type: z.enum(["INVESTIGATION", "REVIEW", "FOLLOW_UP", "APPROVAL"]),
  status: z.enum(["OPEN", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"]), dueAt: at.nullable(), updatedAt: at,
}).strict();
export const evidenceSchema = z.object({ id, caseId: id, documentId: id, versionId: id, number: z.number().int().positive(),
  name: text, mediaType: z.enum(["application/pdf", "text/plain", "image/png", "image/jpeg"]),
  byteSize: z.number().int().positive().max(10 * 1024 * 1024), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  scan: z.enum(["PENDING", "CLEAN", "INFECTED", "ERROR", "NOT_REQUIRED"]), status: z.enum(["SUBMITTED", "VERIFIED", "DISPUTED", "SUPERSEDED", "WITHDRAWN"]),
  source: text, createdAt: at,
}).strict();
export const relationshipSchema = z.object({ id, sourceId: id, targetId: id,
  type: z.enum(["RELATED_TO", "DUPLICATE_OF", "DEPENDS_ON", "COORDINATES_WITH"]),
  status: z.enum(["PROPOSED", "CONFIRMED", "REJECTED", "RETIRED"]), reason: text, reviewerId: id.nullable(),
}).strict();
export const findingSchema = z.object({ id, kind: z.enum(["CONFLICT", "CONTRADICTION"]), caseIds: z.array(id).min(1),
  title: text, explanation: text, sourceVersionIds: z.array(id).min(1), policyVersionId: id.nullable(),
  ruleVersion: text, status: z.enum(["DETECTED", "CONFIRMED", "DISMISSED", "INCONCLUSIVE"]),
  reviewerId: id.nullable(), reviewReason: z.string(), createdAt: at,
}).strict();
export const policySchema = z.object({ id, label: text, approved: z.boolean(), from: at, until: at.nullable(),
  requirements: z.array(z.enum(["EVIDENCE", "TASKS", "DEPENDENCIES", "FINDINGS", "APPROVAL"])).min(1),
}).strict();
export const snapshotSchema = z.object({
  revision: version, generatedAt: at,
  cases: z.array(caseSchema), drafts: z.array(draftSchema), tasks: z.array(taskSchema), evidence: z.array(evidenceSchema),
  matches: z.array(z.object({ id, draftId: id, caseId: id, explanation: text, algorithmVersion: text,
    decision: z.enum(["PENDING", "DISTINCT", "RELATED", "DUPLICATE"]), reviewerId: id.nullable(), reason: z.string() }).strict()),
  relationships: z.array(relationshipSchema), findings: z.array(findingSchema), policies: z.array(policySchema),
  bureaus: z.array(z.object({ id, name: text }).strict()), institutions: z.array(z.object({ id, name: text }).strict()),
  categories: z.array(z.object({ id, name: text }).strict()),
  comments: z.array(z.object({ id, caseId: id, authorId: id, body: text, at }).strict()),
  activity: z.array(z.object({ id, caseId: id.nullable(), actorId: id, type: text, reason: text, at }).strict()),
  sla: z.array(z.object({ id, caseId: id, taskId: id.nullable(), dueAt: at, originalDueAt: at,
    status: z.enum(["RUNNING", "PAUSED", "COMPLETED", "BREACHED"]), policyVersionId: id }).strict()),
  events: z.array(z.object({ id, caseId: id, title: text, at, type: z.enum(["HEARING", "REVIEW", "APPROVAL", "BUREAU_ACTIVITY"]) }).strict()),
  notifications: z.array(z.object({ id, userId: id, caseId: id.nullable(), title: text, at, readAt: at.nullable() }).strict()),
  accessRequests: z.array(z.object({ id, caseId: id, requesterId: id, scope: scopeSchema, reason: text,
    until: at, status: z.enum(["PENDING", "APPROVED", "REJECTED"]), reviewerId: id.nullable() }).strict()),
  transfers: z.array(z.object({ id, caseId: id, fromBureauId: id, toBureauId: id, officerId: id,
    reason: text, status: z.enum(["REQUESTED", "COMPLETED", "REJECTED"]), requestedBy: id, expectedVersion: version }).strict()),
}).strict();
export type Snapshot = z.infer<typeof snapshotSchema>;
export type PlatformCase = z.infer<typeof caseSchema>;
export type Staff = z.infer<typeof staffSchema>;
export type PlatformEvidence = z.infer<typeof evidenceSchema>;
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("draft.create"), sourceReference: text, source: draftSchema.shape.source, subject: text, body: text,
    language: draftSchema.shape.language, bureauId: id, institutionId: id.nullable() }).strict(),
  z.object({ type: z.literal("draft.verify"), draftId: id, expectedVersion: version, institutionId: id, reason: text }).strict(),
  z.object({ type: z.literal("draft.register"), draftId: id, expectedVersion: version, categoryId: id, officerId: id, priority: z.enum(livePriorities) }).strict(),
  z.object({ type: z.literal("draft.associate"), draftId: id, expectedVersion: version, caseId: id, reason: text }).strict(),
  z.object({ type: z.literal("draft.reject"), draftId: id, expectedVersion: version, reason: text }).strict(),
  z.object({ type: z.literal("match.review"), draftId: id, expectedVersion: version, matchId: id, decision: z.enum(["DISTINCT", "RELATED", "DUPLICATE"]), reason: text }).strict(),
  z.object({ type: z.literal("case.assign"), caseId: id, expectedVersion: version, officerId: id, reason: text }).strict(),
  z.object({ type: z.literal("case.priority"), caseId: id, expectedVersion: version, priority: z.enum(livePriorities), reason: text }).strict(),
  z.object({ type: z.literal("case.transition"), caseId: id, expectedVersion: version, status: z.enum(liveStatuses).exclude(["DISPOSED"]), reason: text }).strict(),
  z.object({ type: z.literal("comment.add"), caseId: id, expectedVersion: version, body: text }).strict(),
  z.object({ type: z.literal("task.create"), caseId: id, expectedVersion: version, title: text, taskType: taskSchema.shape.type, assigneeId: id, dueAt: at.nullable() }).strict(),
  z.object({ type: z.literal("task.update"), caseId: id, expectedVersion: version, taskId: id, status: taskSchema.shape.status }).strict(),
  z.object({ type: z.literal("relationship.propose"), caseId: id, expectedVersion: version, targetId: id, relation: relationshipSchema.shape.type, reason: text }).strict(),
  z.object({ type: z.literal("relationship.review"), caseId: id, expectedVersion: version, relationshipId: id, decision: z.enum(["CONFIRMED", "REJECTED"]), reason: text }).strict(),
  z.object({ type: z.literal("access.request"), caseId: id, scope: scopeSchema, until: at, reason: text }).strict(),
  z.object({ type: z.literal("access.decide"), caseId: id, expectedVersion: version, requestId: id, decision: z.enum(["APPROVED", "REJECTED"]), reason: text }).strict(),
  z.object({ type: z.literal("transfer.request"), caseId: id, expectedVersion: version, bureauId: id, officerId: id, reason: text }).strict(),
  z.object({ type: z.literal("transfer.decide"), caseId: id, expectedVersion: version, transferId: id, decision: z.enum(["COMPLETED", "REJECTED"]), reason: text }).strict(),
  z.object({ type: z.literal("finding.review"), caseId: id, expectedVersion: version, findingId: id, decision: z.enum(["CONFIRMED", "DISMISSED", "INCONCLUSIVE"]), reason: text }).strict(),
  z.object({ type: z.literal("closure.evaluate"), caseId: id, expectedVersion: version, policyId: id }).strict(),
  z.object({ type: z.literal("closure.dispose"), caseId: id, expectedVersion: version, evaluationId: id, reason: text }).strict(),
  z.object({ type: z.literal("notification.read"), notificationId: id }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export const envelopeSchema = z.object({ idempotencyKey: z.uuid(), command: commandSchema }).strict();
export type Envelope = z.infer<typeof envelopeSchema>;
export const resultSchema = z.object({ entityId: id, revision: version, invalidates: z.array(z.enum(["registry", "dashboard", "calendar", "case", "coordination", "notifications", "intelligence"])) }).strict();
export type CommandResult = z.infer<typeof resultSchema>;
export type Evaluation = { id: string; caseId: string; policyId: string; fingerprint: string; passed: boolean; checks: { code: string; pass: boolean }[]; actorId: string; at: string };
export type State = Snapshot & { staff: Staff[]; revokedSessions: string[]; grants: { caseId: string; userId: string; scope: z.infer<typeof scopeSchema>; until: string; revoked: boolean }[];
  evaluations: Evaluation[]; receipts: Record<string, { input: string; result: CommandResult }>; nextCaseNumber: string };
export class PlatformError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
