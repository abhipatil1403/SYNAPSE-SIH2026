import { z } from "zod";
import { actorFor, bureaus, createSeed, officers } from "./seed";
import {
  linkTypes,
  roles,
  statuses,
  type AccessScope,
  type Actor,
  type Case,
  type CaseStatus,
  type DemoState,
  type Finding,
  type GateEvaluation,
  type LinkType,
  type Settings,
  type TaskStatus,
} from "./types";

export class WorkflowError extends Error {}
export const humanize = (value: string) =>
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (x) => x.toUpperCase());
export const taskStatuses: TaskStatus[] = [
  "To Do",
  "In Progress",
  "In Review",
  "Done",
];
export function actorWithGrants(
  actor: Actor,
  s: DemoState,
  now = new Date().toISOString(),
): Actor {
  return {
    ...actor,
    grants: s.accessRequests
      .filter(
        (r) =>
          r.requesterId === actor.id &&
          r.state === "Approved" &&
          r.expiresAt > now,
      )
      .map((r) => ({ caseId: r.caseId, scope: r.scope })),
  };
}
function granted(actor: Actor, c: Case, scopes: AccessScope[]) {
  return (
    actor.grants?.some((g) => g.caseId === c.id && scopes.includes(g.scope)) ??
    false
  );
}
export function canView(actor: Actor, c: Case) {
  if (actor.role === "Admin" || actor.role === "Intake Officer") return false;
  if (actor.role === "Supervisor") return true;
  if (actor.role === "Case Officer")
    return (
      c.officer === actor.id || granted(actor, c, ["DETAILS", "COORDINATE"])
    );
  return (
    c.bureau === actor.bureau || granted(actor, c, ["DETAILS", "COORDINATE"])
  );
}
export function canEdit(actor: Actor, c: Case) {
  return (
    canView(actor, c) &&
    (actor.role === "Supervisor" ||
      (actor.role === "Bureau Head" && c.bureau === actor.bureau) ||
      (actor.role === "Case Officer" && c.officer === actor.id) ||
      (!["Auditor", "Admin", "Intake Officer"].includes(actor.role) &&
        granted(actor, c, ["COORDINATE"])))
  );
}
export function canApprove(actor: Actor, c: Case) {
  return (
    canEdit(actor, c) &&
    (actor.role === "Supervisor" ||
      (actor.role === "Bureau Head" && c.bureau === actor.bureau))
  );
}
export function canViewEvidence(actor: Actor, c: Case) {
  return (
    canView(actor, c) &&
    (actor.role === "Supervisor" ||
      c.officer === actor.id ||
      (["Bureau Head", "Auditor"].includes(actor.role) &&
        c.bureau === actor.bureau) ||
      granted(actor, c, ["DOCUMENTS"]))
  );
}
export function canDiscover(actor: Actor, c: Case, s: DemoState) {
  return (
    ["Case Officer", "Bureau Head", "Auditor"].includes(actor.role) &&
    !canView(actor, c) &&
    (c.participants.includes(actor.bureau) ||
      s.cases.some(
        (own) => canView(actor, own) && own.institution === c.institution,
      ))
  );
}
export function visibleCases(s: DemoState, actor: Actor) {
  return s.cases.filter((c) => canView(actor, c));
}
export function visibleTasks(s: DemoState, actor: Actor) {
  const ids = new Set(visibleCases(s, actor).map((c) => c.id));
  return s.tasks.filter((t) => ids.has(t.caseId));
}
export function visibleFindings(s: DemoState, actor: Actor) {
  return s.findings.filter((f) =>
    f.caseIds.every((id) =>
      s.cases.some(
        (c) =>
          c.id === id &&
          canView(actor, c) &&
          (f.type !== "Evidence contradiction" || canViewEvidence(actor, c)),
      ),
    ),
  );
}
export function visibleAudit(s: DemoState, actor: Actor) {
  return s.audit.filter((e) =>
    actor.role === "Admin"
      ? e.target === "settings"
      : e.target === "settings"
        ? e.actor === actor.name
        : s.cases.some((c) => c.id === e.target && canView(actor, c)) ||
          (["Supervisor", "Intake Officer"].includes(actor.role) &&
            e.target.startsWith("IN-")),
  );
}
export function evaluateGate(s: DemoState, c: Case): GateEvaluation {
  const tasks = s.tasks.filter((t) => t.caseId === c.id);
  const dependencies = s.relationships.filter(
    (r) => r.source === c.id && r.type === "DEPENDS_ON",
  );
  const items = [
    {
      label: "Investigation work completed",
      pass: tasks.length > 0 && tasks.every((t) => t.status === "Done"),
      detail: `${tasks.filter((t) => t.status === "Done").length} of ${tasks.length} work items completed`,
    },
    {
      label: "Mandatory investigation report",
      pass: c.evidence.some((e) => e.mandatory),
      detail: "A versioned investigation report must be attached",
    },
    {
      label: "Participating Bureau approval",
      pass: c.contributionApproved,
      detail: "A Bureau Head or Supervisor records contribution approval",
    },
    {
      label: "Dependencies resolved",
      pass: dependencies.every(
        (r) => s.cases.find((d) => d.id === r.target)?.status === "DISPOSED",
      ),
      detail: dependencies.length
        ? `${dependencies.length} prerequisite case(s) must be disposed`
        : "No blocking dependencies",
    },
    {
      label: "Final communication recorded",
      pass: c.communicationSent,
      detail: "Officer confirms final communication is retained",
    },
    {
      label: "Case is in resolution review",
      pass: c.status === "RESOLUTION_REVIEW",
      detail: `Current state: ${humanize(c.status)}`,
    },
  ];
  return {
    result: items.every((i) => i.pass) ? "PASS" : "BLOCKED",
    caseVersion: c.version,
    revision: s.revision,
    policy: "Synthetic checklist DEMO-QG v1.0",
    items,
  };
}
export function hasDependencyCycle(
  links: DemoState["relationships"],
  source: string,
  target: string,
) {
  const seen = new Set<string>();
  function reaches(node: string): boolean {
    if (node === source) return true;
    if (seen.has(node)) return false;
    seen.add(node);
    return links
      .filter((e) => e.type === "DEPENDS_ON" && e.source === node)
      .some((e) => reaches(e.target));
  }
  return reaches(target);
}
const textInput = z
  .string()
  .trim()
  .min(3, "Enter at least 3 characters.")
  .max(4000);
const settingsSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email(),
  digest: z.boolean(),
  deadlines: z.boolean(),
  reducedMotion: z.boolean(),
  compact: z.boolean(),
});
export type Command =
  | {
      type: "create-case";
      subject: string;
      institution: string;
      bureau: string;
      priority: Case["priority"];
      category: string;
    }
  | {
      type: "transition";
      caseId: string;
      status: CaseStatus;
      reason: string;
      version: number;
      evaluation?: GateEvaluation;
    }
  | { type: "move-task"; taskId: string; status: TaskStatus; version: number }
  | { type: "create-task"; caseId: string; title: string; assignee: string }
  | { type: "note"; caseId: string; text: string }
  | { type: "assign"; caseId: string; officer: string; reason: string }
  | {
      type: "request-access";
      caseId: string;
      scope: AccessScope;
      purpose: string;
      days: number;
    }
  | {
      type: "decide-access";
      requestId: string;
      approve: boolean;
      reason: string;
    }
  | { type: "export"; caseIds: string[] }
  | {
      type: "evidence";
      caseId: string;
      name: string;
      body: string;
      hash: string;
      mandatory: boolean;
    }
  | { type: "contribution" | "communication"; caseId: string; reason: string }
  | {
      type: "review-finding";
      findingId: string;
      decision: Finding["state"];
      reason: string;
    }
  | {
      type: "link";
      source: string;
      target: string;
      linkType: LinkType;
      reason: string;
    }
  | { type: "verify-intake"; submissionId: string; institution: string }
  | {
      type: "decide-intake";
      submissionId: string;
      decision: "Register" | "Associate" | "Reject";
      reason: string;
      caseId?: string;
    }
  | { type: "request-transfer"; caseId: string; to: string; reason: string }
  | {
      type: "decide-transfer";
      transferId: string;
      approve: boolean;
      reason: string;
    }
  | { type: "settings"; settings: Settings }
  | { type: "read-notifications"; ids: string[] };

export function execute(
  s: DemoState,
  actor: Actor,
  command: Command,
  expectedRevision = s.revision,
  now = new Date().toISOString(),
): DemoState {
  actor = actorWithGrants(actor, s, now);
  if (expectedRevision !== s.revision)
    throw new WorkflowError(
      "This workspace changed. Refresh the data and retry.",
    );
  const next = structuredClone(s);
  const id = (prefix: string) =>
    `${prefix}-${s.revision + 1}-${next.audit.length}`;
  const audit = (action: string, target: string, detail: string) =>
    next.audit.unshift({
      id: id("AUD"),
      action,
      target,
      actor: actor.name,
      at: now,
      detail,
    });
  function getCase(caseId: string, approval = false) {
    const c = next.cases.find((c) => c.id === caseId);
    if (!c || !(approval ? canApprove(actor, c) : canEdit(actor, c)))
      throw new WorkflowError(
        "You do not have permission for this case action.",
      );
    return c;
  }
  function touch(c: Case) {
    c.version++;
    c.updatedAt = now;
  }
  function reason(value: string) {
    return textInput.parse(value);
  }
  function createCase(
    subject: string,
    institution: string,
    bureau: string,
    priority: Case["priority"],
    category: string,
  ) {
    if (!["Supervisor", "Intake Officer", "Bureau Head"].includes(actor.role))
      throw new WorkflowError(
        "Registration requires an Intake Officer, Bureau Head or Supervisor.",
      );
    if (
      !bureaus.includes(bureau) ||
      (actor.role === "Bureau Head" && bureau !== actor.bureau)
    )
      throw new WorkflowError("Select an authorized lead Bureau.");
    const highest = Math.max(
      ...next.cases.map((c) => Number(c.id.split("-").at(-1))),
      1040,
    );
    const c: Case = {
      id: `SYN-2026-${highest + 1}`,
      subject: textInput.parse(subject),
      institution: textInput.parse(institution),
      city: "To verify",
      bureau,
      officer: "",
      participants: [bureau],
      category: textInput.parse(category),
      priority: z.enum(["High", "Medium", "Low"]).parse(priority),
      status: "REGISTERED",
      description: subject,
      receivedAt: now,
      updatedAt: now,
      dueAt: new Date(new Date(now).getTime() + 14 * 86400000).toISOString(),
      version: 1,
      cycle: 1,
      evidence: [],
      notes: [],
      contributionApproved: false,
      communicationSent: false,
    };
    next.cases.unshift(c);
    audit(
      "Complaint registered",
      c.id,
      "Human-confirmed registration. Synthetic 14-day demonstration SLA; no official policy asserted.",
    );
    return c;
  }
  switch (command.type) {
    case "create-case":
      createCase(
        command.subject,
        command.institution,
        command.bureau,
        command.priority,
        command.category,
      );
      break;
    case "transition": {
      const c = getCase(
        command.caseId,
        ["DISPOSED", "REOPENED", "ON_HOLD"].includes(command.status),
      );
      if (c.version !== command.version)
        throw new WorkflowError(
          "Stale case version. Reopen the case and retry.",
        );
      const why = reason(command.reason);
      const legal: Partial<Record<CaseStatus, CaseStatus[]>> = {
        REGISTERED: ["TRIAGED"],
        TRIAGED: ["ASSIGNED"],
        ASSIGNED: ["IN_PROGRESS"],
        IN_PROGRESS: ["RESOLUTION_REVIEW", "ON_HOLD"],
        RESOLUTION_REVIEW: ["DISPOSED", "IN_PROGRESS", "ON_HOLD"],
        DISPOSED: ["REOPENED"],
        REOPENED: ["IN_PROGRESS"],
        ON_HOLD: [c.previousStatus ?? "IN_PROGRESS"],
      };
      if (!legal[c.status]?.includes(command.status))
        throw new WorkflowError("This case transition is not permitted.");
      if (command.status === "ASSIGNED" && !c.officer)
        throw new WorkflowError(
          "An accountable officer must be assigned first. Use the assignment action.",
        );
      if (
        command.status === "RESOLUTION_REVIEW" &&
        next.tasks.some((t) => t.caseId === c.id && t.status !== "Done")
      )
        throw new WorkflowError(
          "Complete investigation work before requesting resolution review.",
        );
      if (command.status === "DISPOSED") {
        if (
          !command.evaluation ||
          command.evaluation.revision !== s.revision ||
          command.evaluation.caseVersion !== c.version
        )
          throw new WorkflowError(
            "Evaluate the current Quality Gate again before disposal.",
          );
        if (evaluateGate(next, c).result !== "PASS")
          throw new WorkflowError(
            "Quality Gate blocked: mandatory requirements remain unmet.",
          );
        c.disposedAt = now;
      }
      if (command.status === "ON_HOLD") c.previousStatus = c.status;
      if (command.status === "REOPENED") {
        c.cycle++;
        c.contributionApproved = false;
        c.communicationSent = false;
        c.previousStatus = undefined;
      }
      const previous = c.status;
      c.status = command.status;
      touch(c);
      audit(
        `${humanize(previous)} → ${humanize(c.status)}`,
        c.id,
        `${why} · Review cycle ${c.cycle}. SLA retained; hold does not pause the clock.`,
      );
      break;
    }
    case "move-task": {
      const t = next.tasks.find((t) => t.id === command.taskId);
      if (!t) throw new WorkflowError("Work item not found.");
      const c = getCase(t.caseId);
      if (c.status === "DISPOSED")
        throw new WorkflowError("Reopen the case before changing its work.");
      if (actor.role === "Case Officer" && t.assignee !== actor.id)
        throw new WorkflowError(
          "Only the assigned officer or authorized head may move this work item.",
        );
      if (t.version !== command.version)
        throw new WorkflowError("Stale work item. Please retry.");
      if (
        !taskStatuses.includes(command.status) ||
        Math.abs(
          taskStatuses.indexOf(t.status) - taskStatuses.indexOf(command.status),
        ) !== 1
      )
        throw new WorkflowError("Move work one stage at a time.");
      t.status = command.status;
      t.version++;
      touch(c);
      audit("Work item moved", c.id, `${t.title} → ${t.status}`);
      break;
    }
    case "create-task": {
      const c = getCase(command.caseId);
      if (c.status === "DISPOSED")
        throw new WorkflowError("Reopen the case before adding work.");
      if (
        !officers.some(
          (o) => o.id === command.assignee && o.bureau === c.bureau,
        )
      )
        throw new WorkflowError(
          "Choose an active fictional officer from the lead Bureau.",
        );
      if (command.assignee !== c.officer && !canApprove(actor, c))
        throw new WorkflowError(
          "Only a Bureau Head can assign work to another officer.",
        );
      next.tasks.push({
        id: id("WI"),
        caseId: c.id,
        title: reason(command.title),
        bureau: c.bureau,
        assignee: command.assignee || actor.id,
        status: "To Do",
        priority: c.priority,
        dueAt: c.dueAt,
        category: c.category,
        version: 1,
      });
      touch(c);
      audit("Work item created", c.id, command.title);
      break;
    }
    case "note": {
      const c = getCase(command.caseId);
      c.notes.push({ text: reason(command.text), actor: actor.name, at: now });
      touch(c);
      audit("Case note added", c.id, command.text);
      break;
    }
    case "assign": {
      const c = getCase(command.caseId, true);
      if (c.status === "DISPOSED")
        throw new WorkflowError("Reopen this case before reassignment.");
      if (
        !officers.some((o) => o.id === command.officer && o.bureau === c.bureau)
      )
        throw new WorkflowError("Choose an officer from the lead Bureau.");
      c.officer = command.officer;
      touch(c);
      audit(
        "Accountable officer assigned",
        c.id,
        `${command.officer}: ${reason(command.reason)}`,
      );
      break;
    }
    case "export": {
      for (const cid of command.caseIds) {
        const c = next.cases.find((c) => c.id === cid);
        if (!c || !canView(actor, c))
          throw new WorkflowError("Export includes a case you cannot access.");
      }
      for (const cid of command.caseIds)
        audit(
          "Authorized metadata exported",
          cid,
          "CSV export; document bodies excluded.",
        );
      break;
    }
    case "evidence": {
      const c = getCase(command.caseId);
      if (c.status === "DISPOSED")
        throw new WorkflowError(
          "Reopen the case before adding material evidence.",
        );
      if (!canViewEvidence(actor, c))
        throw new WorkflowError(
          "A separate DOCUMENTS grant is required for evidence.",
        );
      const name = textInput.parse(command.name);
      const versions = c.evidence.filter((e) => e.name === name);
      next.cases
        .find((c) => c.id === command.caseId)!
        .evidence.push({
          id: id("EV"),
          name,
          body: z.string().min(3).max(30000).parse(command.body),
          source: `Demo text attachment by ${actor.name}`,
          version: Math.max(0, ...versions.map((e) => e.version)) + 1,
          at: now,
          mandatory: command.mandatory,
          hash: command.hash,
        });
      touch(c);
      audit(
        "Evidence version retained",
        c.id,
        `${name} · previous versions preserved`,
      );
      break;
    }
    case "contribution": {
      const c = getCase(command.caseId, true);
      c.contributionApproved = true;
      touch(c);
      audit("Bureau contribution approved", c.id, reason(command.reason));
      break;
    }
    case "communication": {
      const c = getCase(command.caseId);
      c.communicationSent = true;
      touch(c);
      audit("Final communication recorded", c.id, reason(command.reason));
      break;
    }
    case "review-finding": {
      const f = next.findings.find((f) => f.id === command.findingId);
      if (
        !f ||
        !f.caseIds.every((cid) =>
          next.cases.some((c) => c.id === cid && canEdit(actor, c)),
        )
      )
        throw new WorkflowError("Finding is not authorized for review.");
      if (f.state !== "Pending review" && f.state !== "Needs information")
        throw new WorkflowError("This finding has already been reviewed.");
      f.state = z
        .enum(["Confirmed", "Dismissed", "Needs information"])
        .parse(command.decision);
      f.reason = reason(command.reason);
      f.reviewer = actor.name;
      f.reviewedAt = now;
      for (const cid of f.caseIds)
        audit(
          `Finding ${f.state.toLowerCase()}`,
          cid,
          `${f.id}: ${f.reason}. Advisory only; no case merged or disposed.`,
        );
      break;
    }
    case "link": {
      getCase(command.source);
      getCase(command.target);
      z.enum(linkTypes).parse(command.linkType);
      if (command.source === command.target)
        throw new WorkflowError("A case cannot link to itself.");
      if (
        next.relationships.some(
          (r) =>
            r.source === command.source &&
            r.target === command.target &&
            r.type === command.linkType,
        )
      )
        throw new WorkflowError("This relationship already exists.");
      if (
        command.linkType === "DEPENDS_ON" &&
        hasDependencyCycle(next.relationships, command.source, command.target)
      )
        throw new WorkflowError("This dependency would create a cycle.");
      next.relationships.push({
        id: id("REL"),
        source: command.source,
        target: command.target,
        type: command.linkType,
        rationale: reason(command.reason),
        actor: actor.name,
        at: now,
      });
      audit(
        "Relationship confirmed",
        command.source,
        `${command.linkType} ${command.target}: ${command.reason}. No automatic merge.`,
      );
      break;
    }
    case "verify-intake": {
      if (!["Supervisor", "Intake Officer"].includes(actor.role))
        throw new WorkflowError(
          "Intake review is restricted to authorized intake staff.",
        );
      const draft = next.submissions.find((d) => d.id === command.submissionId);
      if (!draft || draft.state !== "Draft")
        throw new WorkflowError("Draft is no longer pending.");
      draft.institution = textInput.parse(command.institution);
      draft.verified = true;
      audit("Intake extraction verified", draft.id, draft.institution);
      break;
    }
    case "decide-intake": {
      if (!["Supervisor", "Intake Officer"].includes(actor.role))
        throw new WorkflowError("You cannot confirm intake.");
      const draft = next.submissions.find((d) => d.id === command.submissionId);
      if (!draft) throw new WorkflowError("Draft not found.");
      if (draft.state !== "Draft") return s; // Idempotent replay never creates a second case.
      const why = reason(command.reason);
      if (command.decision !== "Reject" && !draft.verified)
        throw new WorkflowError(
          "Verify the extracted institution before registration or association.",
        );
      if (command.decision === "Register") {
        const c = createCase(
          draft.translation === "Original is already English."
            ? draft.subject
            : draft.translation.split(".")[0],
          draft.institution,
          "Approval",
          "Medium",
          "Pending classification",
        );
        draft.caseId = c.id;
        draft.state = "Registered";
      } else if (command.decision === "Associate") {
        // Intake-only identities can register but cannot inspect or associate to restricted cases.
        const c = next.cases.find(
          (c) => c.id === command.caseId && canView(actor, c),
        );
        if (!c) throw new WorkflowError("The selected case is not authorized.");
        draft.caseId = c.id;
        draft.state = "Associated";
        audit("Submission associated", c.id, `${draft.id}: ${why}`);
      } else draft.state = "Rejected";
      draft.reason = why;
      audit(`Intake ${draft.state.toLowerCase()}`, draft.id, why);
      break;
    }
    case "request-transfer": {
      const c = getCase(command.caseId);
      if (c.status === "DISPOSED")
        throw new WorkflowError("A disposed case cannot be transferred.");
      if (!bureaus.includes(command.to) || command.to === c.bureau)
        throw new WorkflowError("Select a different Bureau.");
      if (
        next.transfers.some(
          (t) => t.caseId === c.id && t.status === "Requested",
        )
      )
        throw new WorkflowError("A transfer is already pending.");
      next.transfers.push({
        id: id("TR"),
        caseId: c.id,
        from: c.bureau,
        to: command.to,
        reason: reason(command.reason),
        status: "Requested",
        actor: actor.name,
      });
      audit(
        "Transfer requested",
        c.id,
        `${c.bureau} → ${command.to}: ${command.reason}`,
      );
      break;
    }
    case "request-access": {
      const c = next.cases.find((c) => c.id === command.caseId);
      if (!c || !(canDiscover(actor, c, next) || canView(actor, c)))
        throw new WorkflowError("No discovery permission for this case.");
      if (!["Case Officer", "Bureau Head", "Auditor"].includes(actor.role))
        throw new WorkflowError(
          "Use an authorized operational perspective for access requests.",
        );
      if (
        next.accessRequests.some(
          (r) =>
            r.caseId === c.id &&
            r.scope === command.scope &&
            r.requesterId === actor.id &&
            r.state === "Requested",
        )
      )
        throw new WorkflowError("A request for this scope is already pending.");
      const scope = z
        .enum(["DETAILS", "DOCUMENTS", "COORDINATE"])
        .parse(command.scope);
      const days = z.number().int().min(1).max(30).parse(command.days);
      next.accessRequests.push({
        id: id("AR"),
        caseId: c.id,
        requesterId: actor.id,
        requesterName: actor.name,
        scope,
        purpose: reason(command.purpose),
        expiresAt: new Date(Date.parse(now) + days * 86400000).toISOString(),
        state: "Requested",
      });
      audit(
        "Scoped access requested",
        c.id,
        `${scope} by ${actor.name}: ${command.purpose}`,
      );
      break;
    }
    case "decide-access": {
      if (actor.role !== "Supervisor")
        throw new WorkflowError(
          "Only the demo Supervisor may decide cross-Bureau access.",
        );
      const r = next.accessRequests.find((r) => r.id === command.requestId);
      if (!r || r.state !== "Requested" || r.expiresAt <= now)
        throw new WorkflowError("Access request is no longer actionable.");
      r.state = command.approve ? "Approved" : "Rejected";
      r.reviewer = actor.name;
      r.decisionReason = reason(command.reason);
      audit(
        `Scoped access ${r.state.toLowerCase()}`,
        r.caseId,
        `${r.scope} for ${r.requesterName}: ${r.decisionReason}`,
      );
      break;
    }
    case "decide-transfer": {
      const t = next.transfers.find((t) => t.id === command.transferId);
      if (!t || t.status !== "Requested")
        throw new WorkflowError("Transfer is no longer pending.");
      const c = getCase(t.caseId, true);
      if (actor.role !== "Supervisor")
        throw new WorkflowError(
          "The demo requires a cross-Bureau Supervisor for transfer decisions.",
        );
      if (c.bureau !== t.from)
        throw new WorkflowError("Transfer source is stale.");
      t.status = command.approve ? "Approved" : "Rejected";
      if (command.approve) {
        c.bureau = t.to;
        c.officer = "";
        c.participants = Array.from(new Set([...c.participants, t.to]));
        touch(c);
      }
      audit(
        `Transfer ${t.status.toLowerCase()}`,
        c.id,
        `${reason(command.reason)}. Original SLA deadline retained.`,
      );
      break;
    }
    case "settings":
      next.settings = settingsSchema.parse(command.settings);
      audit(
        "Preferences saved",
        "settings",
        "Local demo profile and accessibility preferences updated.",
      );
      break;
    case "read-notifications":
      next.readNotifications = Array.from(
        new Set([...next.readNotifications, ...command.ids]),
      );
      break;
  }
  next.revision++;
  return next;
}

// Parse all persisted data, not just the top-level version marker.
const iso = z.iso.datetime();
const evidenceSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number().int().positive(),
  source: z.string(),
  at: iso,
  mandatory: z.boolean(),
  body: z.string(),
  hash: z.string(),
});
const caseSchema = z.object({
  id: z.string(),
  subject: z.string(),
  institution: z.string(),
  city: z.string(),
  bureau: z.string(),
  officer: z.string(),
  participants: z.array(z.string()),
  category: z.string(),
  priority: z.enum(["High", "Medium", "Low"]),
  status: z.enum(statuses),
  description: z.string(),
  receivedAt: iso,
  updatedAt: iso,
  dueAt: iso,
  disposedAt: iso.optional(),
  previousStatus: z.enum(statuses).optional(),
  version: z.number().int().positive(),
  cycle: z.number().int().positive(),
  evidence: z.array(evidenceSchema),
  notes: z.array(z.object({ text: z.string(), actor: z.string(), at: iso })),
  contributionApproved: z.boolean(),
  communicationSent: z.boolean(),
});
const baseStateSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  seedDate: iso,
  cases: z.array(caseSchema),
  tasks: z.array(
    z.object({
      id: z.string(),
      caseId: z.string(),
      title: z.string(),
      bureau: z.string(),
      assignee: z.string(),
      status: z.enum(["To Do", "In Progress", "In Review", "Done"]),
      priority: z.enum(["High", "Medium", "Low"]),
      dueAt: iso,
      category: z.string(),
      version: z.number().int().positive(),
    }),
  ),
  findings: z.array(
    z.object({
      id: z.string(),
      type: z.enum([
        "Related cases",
        "Conflict Sentinel",
        "Evidence contradiction",
        "Triage insight",
      ]),
      title: z.string(),
      caseIds: z.array(z.string()),
      explanation: z.string(),
      sources: z.array(z.string()),
      confidence: z.string(),
      severity: z.enum(["High", "Medium", "Low"]),
      state: z.enum([
        "Pending review",
        "Confirmed",
        "Dismissed",
        "Needs information",
      ]),
      ruleVersion: z.string(),
      reviewer: z.string().optional(),
      reason: z.string().optional(),
      reviewedAt: iso.optional(),
    }),
  ),
  submissions: z.array(
    z.object({
      id: z.string(),
      messageId: z.string(),
      subject: z.string(),
      institution: z.string(),
      language: z.enum(["English", "Hindi", "Marathi"]),
      body: z.string(),
      translation: z.string(),
      receivedAt: iso,
      state: z.enum(["Draft", "Registered", "Associated", "Rejected"]),
      caseId: z.string().optional(),
      reason: z.string().optional(),
      attachment: z.string(),
      verified: z.boolean(),
    }),
  ),
  relationships: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
      type: z.enum(linkTypes),
      rationale: z.string(),
      actor: z.string(),
      at: iso,
    }),
  ),
  audit: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      target: z.string(),
      actor: z.string(),
      at: iso,
      detail: z.string(),
    }),
  ),
  transfers: z.array(
    z.object({
      id: z.string(),
      caseId: z.string(),
      from: z.string(),
      to: z.string(),
      reason: z.string(),
      status: z.enum(["Requested", "Approved", "Rejected"]),
      actor: z.string(),
    }),
  ),
  settings: settingsSchema,
  readNotifications: z.array(z.string()),
});
export const stateSchema = baseStateSchema.extend({
  accessRequests: z
    .array(
      z.object({
        id: z.string(),
        caseId: z.string(),
        requesterId: z.string(),
        requesterName: z.string(),
        scope: z.enum(["DETAILS", "DOCUMENTS", "COORDINATE"]),
        purpose: z.string(),
        expiresAt: iso,
        state: z.enum(["Requested", "Approved", "Rejected"]),
        reviewer: z.string().optional(),
        decisionReason: z.string().optional(),
      }),
    )
    .default([]),
});
export const STORAGE_KEY = "synapse.demo.v1";
export function deserialize(raw: string | null): DemoState | null {
  if (!raw) return null;
  try {
    const parsed = stateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
export function serialize(state: DemoState) {
  return JSON.stringify(stateSchema.parse(state));
}
export function safeActor(role: string): Actor {
  return actorFor(z.enum(roles).catch("Supervisor").parse(role));
}
export const freshState = () => createSeed();
