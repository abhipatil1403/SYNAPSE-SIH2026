import { createHash, randomUUID } from "node:crypto";
import { envelopeSchema, principalSchema, PlatformError, type State, type Principal, type CommandResult, type PlatformCase, type Command } from "./contracts";
import { resolveStaff, requireCase, role, current } from "./authorization";
import { authorizedSnapshot } from "./selectors";

export interface TransactionStore {
  // Implementations must serialize competing mutations and atomically persist state,
  // receipts, audit and notification changes or roll back the complete transaction.
  transaction<T>(work: (state: State) => Promise<T>): Promise<T>;
}
export class MemoryTransactionStore implements TransactionStore {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private state: State) {}
  async transaction<T>(work: (s: State) => Promise<T>): Promise<T> {
    const turn = this.tail.then(async () => {
      const next = structuredClone(this.state);
      const result = await work(next);
      this.state = next;
      return result;
    });
    this.tail = turn.catch(() => {});
    return turn;
  }
}
const increment = (value: string) => (BigInt(value) + 1n).toString();
function reject(condition: unknown, code: string, message: string, status = 409): asserts condition {
  if (!condition) throw new PlatformError(status, code, message);
}
export function closureFingerprint(s: State, c: PlatformCase, policyId: string) {
  return createHash("sha256").update(JSON.stringify({ c, policy: s.policies.find((p) => p.id === policyId),
    tasks: s.tasks.filter((t) => t.caseId === c.id), evidence: s.evidence.filter((e) => e.caseId === c.id),
    relationships: s.relationships.filter((r) => r.sourceId === c.id || r.targetId === c.id),
    dependencies: s.relationships.filter((r) => r.sourceId === c.id && r.type === "DEPENDS_ON").map((r) => s.cases.find((x) => x.id === r.targetId)),
    findings: s.findings.filter((f) => f.caseIds.includes(c.id)),
  })).digest("hex");
}
function cycle(s: State, source: string, target: string) {
  const stack = [target], seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === source) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...s.relationships.filter((r) => r.sourceId === id && r.type === "DEPENDS_ON" && r.status === "CONFIRMED").map((r) => r.targetId));
  }
  return false;
}
// Proposed transition mapping uses deployed codes; it is not an approved hosted workflow.
const transitions: Record<string, string[]> = {
  NEW: ["ASSIGNED"], ASSIGNED: ["UNDER_REVIEW"], UNDER_REVIEW: ["AWAITING_INFORMATION", "ACTION_INITIATED", "ESCALATED"],
  AWAITING_INFORMATION: ["UNDER_REVIEW"], ACTION_INITIATED: ["UNDER_REVIEW", "ESCALATED"],
  ESCALATED: ["UNDER_REVIEW"], DISPOSED: [], REOPENED: ["ASSIGNED", "UNDER_REVIEW"],
};
export class PlatformEngine {
  constructor(private store: TransactionStore, private clock = () => new Date().toISOString(), private uuid = randomUUID as () => string) {}
  async snapshot(principal: Principal) {
    return this.store.transaction(async (s) => authorizedSnapshot(s, principalSchema.parse(principal), this.clock()));
  }
  async execute(principal: Principal, input: unknown): Promise<CommandResult> {
    const p = principalSchema.parse(principal), envelope = envelopeSchema.parse(input);
    return this.store.transaction(async (s) => {
      const now = this.clock(), user = resolveStaff(s, p), cmd = envelope.command;
      const key = p.userId + ":" + envelope.idempotencyKey, serialized = JSON.stringify(cmd);
      // Replay must reauthorize visibility; it cannot return a revoked user's prior result.
      const prior = s.receipts[key];
      if (prior) {
        reject(prior.input === serialized, "idempotency_conflict", "The key was already used for another command.");
        const entity = s.cases.find((c) => c.id === prior.result.entityId);
        if (entity) requireCase(s, user, entity.id, now);
        return prior.result;
      }
      let entityId = this.uuid(), changed: PlatformCase | undefined;
      const head = (c: PlatformCase) => reject(role(user, "BUREAU_HEAD", c.bureauId, now), "forbidden", "Current Bureau approval authority is required.", 403);
      if (cmd.type.startsWith("draft.") || cmd.type === "match.review") {
        if (cmd.type === "draft.create") {
          reject(role(user, "BUREAU_HEAD", cmd.bureauId, now), "intake_authority_unresolved", "Intake requires current scoped Bureau review authority; no live Intake role is invented.", 403);
          reject(!s.drafts.some((d) => d.sourceReference === cmd.sourceReference && d.source === cmd.source), "duplicate_source", "This source message is already captured.");
          s.drafts.push({ id: entityId, sourceReference: cmd.sourceReference, source: cmd.source, subject: cmd.subject, body: cmd.body,
            language: cmd.language, bureauId: cmd.bureauId, institutionId: cmd.institutionId, creatorId: user.id, state: "DRAFT", verified: false,
            reviewerId: null, linkedCaseId: null, receivedAt: now, version: "1" });
        } else {
          const draft = s.drafts.find((d) => d.id === (cmd as Extract<Command, { type: "draft.verify" }>).draftId);
          reject(draft && role(user, "BUREAU_HEAD", draft.bureauId, now), "not_found", "The authorized draft is unavailable.", 404);
          reject("expectedVersion" in cmd && draft.version === cmd.expectedVersion, "stale_version", "Draft changed; reload before reviewing.");
          reject(["DRAFT", "UNDER_REVIEW"].includes(draft.state), "already_reviewed", "Draft was already registered or associated.");
          draft.version = increment(draft.version); entityId = draft.id;
          if (cmd.type === "draft.verify") {
            reject(s.institutions.some((i) => i.id === cmd.institutionId), "invalid_institution", "Select a verified institution.", 400);
            draft.institutionId = cmd.institutionId; draft.verified = true; draft.state = "UNDER_REVIEW"; draft.reviewerId = user.id;
          } else if (cmd.type === "draft.register") {
            reject(draft.verified && draft.institutionId && draft.reviewerId, "unverified_draft", "Human verification must precede registration.");
            reject(s.categories.some((k) => k.id === cmd.categoryId), "invalid_category", "A configured case category is required.", 400);
            reject(!s.matches.some((m) => m.draftId === draft.id && ["PENDING", "DUPLICATE"].includes(m.decision)), "duplicate_review_required", "Review pending candidates; confirmed duplicates require explicit association.");
            const officer = s.staff.find((u) => u.id === cmd.officerId && u.active);
            reject(officer && role(officer, "CASE_OFFICER", draft.bureauId, now), "invalid_assignee", "The officer needs current Bureau membership and role.", 400);
            changed = { id: this.uuid(), caseNumber: s.nextCaseNumber, institutionId: draft.institutionId, categoryId: cmd.categoryId,
              bureauId: draft.bureauId, officerId: cmd.officerId, subject: draft.subject, summary: draft.body,
              status: "NEW", priority: cmd.priority, receivedAt: draft.receivedAt, updatedAt: now, disposedAt: null, version: "1" };
            s.nextCaseNumber = increment(s.nextCaseNumber); s.cases.push(changed); entityId = changed.id;
            draft.state = "ACCEPTED"; draft.linkedCaseId = changed.id;
          } else if (cmd.type === "draft.associate") {
            const c = requireCase(s, user, cmd.caseId, now, true); head(c);
            reject(draft.verified && draft.institutionId === c.institutionId, "association_mismatch", "Verify the matching institution before association.");
            draft.state = "LINKED_TO_EXISTING"; draft.linkedCaseId = c.id; changed = c; entityId = c.id;
          } else if (cmd.type === "draft.reject") {
            draft.state = "REJECTED"; draft.reviewerId = user.id;
          } else if (cmd.type === "match.review") {
            const candidate = s.matches.find((m) => m.id === cmd.matchId && m.draftId === draft.id);
            reject(candidate && candidate.decision === "PENDING", "not_found", "Pending authorized match unavailable.", 404);
            requireCase(s, user, candidate.caseId, now);
            candidate.decision = cmd.decision; candidate.reviewerId = user.id; candidate.reason = cmd.reason;
          }
        }
      } else if (cmd.type === "notification.read") {
        const row = s.notifications.find((n) => n.id === cmd.notificationId && n.userId === user.id);
        reject(row, "not_found", "The notification is unavailable.", 404); row.readAt = now; entityId = row.id;
      } else if (cmd.type === "access.request") {
        // No object-existence oracle: requests require existing authorized details.
        const c = requireCase(s, user, cmd.caseId, now);
        reject(Date.parse(cmd.until) > Date.parse(now) && Date.parse(cmd.until) <= Date.parse(now) + 7 * 86400000, "invalid_expiry", "Requests must expire within seven days.", 400);
        s.accessRequests.push({ id: entityId, caseId: c.id, requesterId: user.id, scope: cmd.scope, until: cmd.until, reason: cmd.reason, status: "PENDING", reviewerId: null });
      } else {
        reject("caseId" in cmd && "expectedVersion" in cmd, "invalid_command", "A versioned case command is required.", 400);
        const c = requireCase(s, user, cmd.caseId, now, true); entityId = c.id;
        reject(c.version === cmd.expectedVersion, "stale_version", "This case changed. Reload before retrying.");
        changed = c;
        switch (cmd.type) {
          case "case.assign": {
            head(c); const officer = s.staff.find((u) => u.id === cmd.officerId && u.active);
            reject(officer && role(officer, "CASE_OFFICER", c.bureauId, now), "invalid_assignee", "The officer needs an active scoped assignment.", 400);
            c.officerId = cmd.officerId; break;
          }
          case "case.priority": c.priority = cmd.priority; break;
          case "case.transition": reject(transitions[c.status]?.includes(cmd.status), "invalid_transition", "Use an approved adjacent lifecycle transition."); c.status = cmd.status; break;
          case "comment.add": s.comments.push({ id: this.uuid(), caseId: c.id, authorId: user.id, body: cmd.body, at: now }); break;
          case "task.create": {
            const assignee = s.staff.find((u) => u.id === cmd.assigneeId && u.active);
            reject(assignee && role(assignee, "CASE_OFFICER", c.bureauId, now), "invalid_assignee", "Choose a current Bureau officer.", 400);
            s.tasks.push({ id: this.uuid(), caseId: c.id, bureauId: c.bureauId, assigneeId: cmd.assigneeId, title: cmd.title, type: cmd.taskType, status: "OPEN", dueAt: cmd.dueAt, updatedAt: now }); break;
          }
          case "task.update": {
            const t = s.tasks.find((t) => t.id === cmd.taskId && t.caseId === c.id);
            reject(t, "not_found", "Task unavailable.", 404); t.status = cmd.status; t.updatedAt = now; break;
          }
          case "relationship.propose": {
            requireCase(s, user, cmd.targetId, now);
            reject(c.id !== cmd.targetId, "self_link", "A case cannot depend on itself.");
            reject(!s.relationships.some((r) => r.sourceId === c.id && r.targetId === cmd.targetId && r.type === cmd.relation && r.status !== "REJECTED" && r.status !== "RETIRED"), "duplicate_link", "This relationship already exists.");
            s.relationships.push({ id: this.uuid(), sourceId: c.id, targetId: cmd.targetId, type: cmd.relation, status: "PROPOSED", reason: cmd.reason, reviewerId: null }); break;
          }
          case "relationship.review": {
            head(c); const r = s.relationships.find((r) => r.id === cmd.relationshipId && r.sourceId === c.id);
            reject(r && r.status === "PROPOSED", "not_found", "Pending relationship unavailable.", 404);
            requireCase(s, user, r.targetId, now);
            reject(cmd.decision !== "CONFIRMED" || r.type !== "DEPENDS_ON" || !cycle(s, r.sourceId, r.targetId), "dependency_cycle", "This dependency creates a cycle.");
            r.status = cmd.decision; r.reviewerId = user.id; r.reason = cmd.reason; break;
          }
          case "access.decide": {
            head(c); const r = s.accessRequests.find((r) => r.id === cmd.requestId && r.caseId === c.id && r.status === "PENDING");
            reject(r && r.requesterId !== user.id && Date.parse(r.until) > Date.parse(now), "invalid_request", "A current request requires a different approver.");
            r.status = cmd.decision; r.reviewerId = user.id;
            if (cmd.decision === "APPROVED") s.grants.push({ caseId: c.id, userId: r.requesterId, scope: r.scope, until: r.until, revoked: false }); break;
          }
          case "transfer.request": {
            head(c); reject(cmd.bureauId !== c.bureauId && s.bureaus.some((b) => b.id === cmd.bureauId), "invalid_transfer", "Select a different Bureau.");
            const officer = s.staff.find((u) => u.id === cmd.officerId && u.active);
            reject(officer && role(officer, "CASE_OFFICER", cmd.bureauId, now), "invalid_assignee", "Destination officer is not currently authorized.");
            s.transfers.push({ id: this.uuid(), caseId: c.id, fromBureauId: c.bureauId, toBureauId: cmd.bureauId, officerId: cmd.officerId, reason: cmd.reason, status: "REQUESTED", requestedBy: user.id, expectedVersion: increment(c.version) }); break;
          }
          case "transfer.decide": {
            const t = s.transfers.find((t) => t.id === cmd.transferId && t.caseId === c.id && t.status === "REQUESTED");
            reject(t && t.expectedVersion === c.version && t.requestedBy !== user.id, "stale_transfer", "Transfer needs an independent current approver.");
            reject(role(user, "BUREAU_HEAD", t.fromBureauId, now) && role(user, "BUREAU_HEAD", t.toBureauId, now), "dual_bureau_authority_required", "Both source and destination approval authority are required.", 403);
            const target = s.staff.find((u) => u.id === t.officerId && u.active);
            reject(target && role(target, "CASE_OFFICER", t.toBureauId, now), "invalid_assignee", "Destination officer authority changed; review the transfer again.");
            if (cmd.decision === "COMPLETED") { c.bureauId = t.toBureauId; c.officerId = t.officerId; }
            t.status = cmd.decision; break; // SLA original/current timestamps remain unchanged.
          }
          case "finding.review": {
            head(c); const f = s.findings.find((f) => f.id === cmd.findingId && f.caseIds.includes(c.id));
            reject(f && f.caseIds.every((id) => authorizedSnapshot(s, p, now).cases.some((x) => x.id === id)), "not_found", "Finding unavailable.", 404);
            reject(f.status === "DETECTED", "already_reviewed", "Finding was already reviewed.");
            f.status = cmd.decision; f.reviewerId = user.id; f.reviewReason = cmd.reason; break;
          }
          case "closure.evaluate": {
            const policy = s.policies.find((r) => r.id === cmd.policyId && r.approved && current(r.from, r.until, now));
            reject(policy, "policy_unavailable", "An approved current policy is required.");
            const tests = {
              EVIDENCE: s.evidence.some((e) => e.caseId === c.id && e.status === "VERIFIED" && e.scan === "CLEAN"),
              TASKS: !s.tasks.some((t) => t.caseId === c.id && !["COMPLETED", "CANCELLED"].includes(t.status)),
              DEPENDENCIES: !s.relationships.some((r) => r.sourceId === c.id && r.type === "DEPENDS_ON" && r.status === "CONFIRMED" && s.cases.find((x) => x.id === r.targetId)?.status !== "DISPOSED"),
              FINDINGS: !s.findings.some((f) => f.caseIds.includes(c.id) && ["DETECTED", "CONFIRMED"].includes(f.status)),
              APPROVAL: role(user, "BUREAU_HEAD", c.bureauId, now),
            };
            const checks = policy.requirements.map((code) => ({ code, pass: tests[code] }));
            // Evaluation itself does not mutate the case version it certifies.
            changed = undefined; entityId = this.uuid();
            s.evaluations.push({ id: entityId, caseId: c.id, policyId: policy.id, fingerprint: closureFingerprint(s, c, policy.id), passed: checks.every((x) => x.pass), checks, actorId: user.id, at: now }); break;
          }
          case "closure.dispose": {
            head(c); const e = s.evaluations.find((e) => e.id === cmd.evaluationId && e.caseId === c.id);
            reject(e && e.passed && Date.parse(e.at) >= Date.parse(now) - 15 * 60000 && e.fingerprint === closureFingerprint(s, c, e.policyId), "stale_evaluation", "Rerun the current closure checklist.");
            const policy = s.policies.find((x) => x.id === e.policyId);
            reject(policy?.approved && current(policy.from, policy.until, now), "policy_expired", "Closure policy is no longer approved/current.");
            reject(c.status === "UNDER_REVIEW", "invalid_disposal_state", "Disposal requires the approved resolution-review state mapping.");
            c.status = "DISPOSED"; c.disposedAt = now; break;
          }
        }
      }
      if (changed) { if (cmd.type !== "draft.register") changed.version = increment(changed.version); changed.updatedAt = now; }
      s.revision = increment(s.revision); s.generatedAt = now;
      s.activity.push({ id: this.uuid(), caseId: changed?.id ?? ("caseId" in cmd ? cmd.caseId : null), actorId: user.id,
        type: cmd.type, reason: "reason" in cmd ? cmd.reason : "body" in cmd ? "Recorded content" : "Authorized workflow", at: now });
      if (changed?.officerId) s.notifications.push({ id: this.uuid(), userId: changed.officerId, caseId: changed.id, title: `Case updated: ${changed.subject}`, at: now, readAt: null });
      const result: CommandResult = { entityId, revision: s.revision, invalidates: ["registry", "dashboard", "calendar", "case", "coordination", "notifications", "intelligence"] };
      s.receipts[key] = { input: serialized, result };
      return result;
    });
  }
}
