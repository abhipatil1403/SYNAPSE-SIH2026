import type { State, Staff, Command, PlatformCase } from "./contracts";
import { PlatformError } from "./contracts";
import { current, member, role, requireCase } from "./authorization";

function ensure(value: unknown, message: string, status = 409): asserts value { if (!value) throw new PlatformError(status, "operation_rejected", message); }
export const configurationAdmin = (u: Staff, now: string) => u.roles.some((r) => r.code === "SYSTEM_ADMIN" && current(r.from, r.until, now));
export const intakeAuthority = (u: Staff, bureau: string, now: string) => role(u, "BUREAU_HEAD", bureau, now) || role(u, "CASE_OFFICER", bureau, now);
export const normalizeInstitutionId = (value: string) => value.normalize("NFKC").replace(/\s+/g, "").toUpperCase();

/** Shared domain operations; persistence/identity are supplied by the repository. */
export function supplementalOperation(s: State, u: Staff, cmd: Command, now: string, uuid: () => string): { entityId: string; changed?: PlatformCase } | undefined {
  if (cmd.type === "institution.create") {
    ensure(configurationAdmin(u, now) || u.memberships.some((m) => intakeAuthority(u, m.bureauId, now)), "Current registry authority required.", 403);
    const permanentId = normalizeInstitutionId(cmd.permanentId);
    ensure(/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(permanentId), "Review the institution's AICTE Permanent ID.", 400);
    ensure(!s.institutions.some((i) => i.permanentId === permanentId), "This Permanent ID is already registered.");
    const id = uuid(); s.institutions.push({ id, name: cmd.name, permanentId, region: cmd.region, state: cmd.state, version: "1" }); return { entityId: id };
  }
  if (cmd.type === "institution.update") {
    ensure(configurationAdmin(u, now), "Institution changes require configuration administrator review.", 403);
    const i = s.institutions.find((i) => i.id === cmd.institutionId); ensure(i && (i.version ?? "1") === cmd.expectedVersion, "Institution changed; reload.");
    Object.assign(i, { name: cmd.name, region: cmd.region, state: cmd.state, version: String(BigInt(cmd.expectedVersion) + 1n) }); return { entityId: i.id };
  }
  if (cmd.type === "category.create" || cmd.type === "policy.publish") {
    ensure(configurationAdmin(u, now), "Current configuration administrator required.", 403); const id = uuid();
    if (cmd.type === "category.create") { ensure(!s.categories.some((k) => k.name.toLowerCase() === cmd.name.toLowerCase()), "Category already exists."); s.categories.push({ id, name: cmd.name }); }
    else { ensure(Date.parse(cmd.until) > Date.parse(now), "Choose a future policy expiry.", 400); s.policies.push({ id, label: cmd.label, approved: true, from: now, until: cmd.until, requirements: [...new Set(cmd.requirements)] }); }
    return { entityId: id };
  }
  if (cmd.type === "translation.correct") {
    const d = s.drafts.find((d) => d.id === cmd.draftId); ensure(d && intakeAuthority(u, d.bureauId, now) && (d.creatorId === u.id || role(u, "BUREAU_HEAD", d.bureauId, now)), "Draft unavailable.", 404);
    ensure(d.version === cmd.expectedVersion, "Draft changed; reload.");
    ensure(['DRAFT','UNDER_REVIEW'].includes(d.state),'Only an unregistered source draft can receive translation corrections.');
    const t = s.translations?.find((t) => t.id === cmd.translationId && t.draftId === d.id); ensure(t, "Persisted translation unavailable.", 404);
    Object.assign(t, { subject: cmd.subject, body: cmd.body, correctedBy: u.id, reason: cmd.reason }); d.version = String(BigInt(d.version) + 1n); return { entityId: d.id };
  }
  if (cmd.type === "transfer.decide") {
    const t=s.transfers.find(t=>t.id===cmd.transferId&&t.caseId===cmd.caseId&&t.status==='REQUESTED'),c=s.cases.find(c=>c.id===cmd.caseId);
    ensure(t&&c&&c.version===cmd.expectedVersion&&t.expectedVersion===c.version&&c.bureauId===t.fromBureauId,"Transfer changed; reload.");
    ensure(c.status!=='DISPOSED','Disposed cases cannot be transferred.');
    const source=s.staff.find(v=>v.id===t.requestedBy&&v.active),destination=s.staff.find(v=>v.id===t.officerId&&v.active);
    ensure(t.requestedBy!==u.id&&source&&role(source,"BUREAU_HEAD",t.fromBureauId,now)&&role(u,"BUREAU_HEAD",t.toBureauId,now),"Current independent source and destination Bureau approvals are required.",403);
    ensure(destination&&role(destination,"CASE_OFFICER",t.toBureauId,now),"Destination officer authority changed.");
    if(cmd.decision==='COMPLETED'){c.bureauId=t.toBureauId;c.officerId=t.officerId;}t.status=cmd.decision;return {entityId:c.id,changed:c};
  }
  if (!["sla.set", "event.schedule", "action.record", "conflict.review", "access.revoke", "evidence.attach", "evidence.review"].includes(cmd.type)) return;
  ensure("caseId" in cmd && "expectedVersion" in cmd, "Versioned case operation required.", 400);
  const c = requireCase(s, u, cmd.caseId, now, true); ensure(c.version === cmd.expectedVersion, "Case changed; reload.");
  ensure(c.status!=="DISPOSED","Disposed cases are read-only until an authorized reopening workflow is approved.");
  const id = uuid();
  if (cmd.type === "sla.set") {
    ensure(role(u, "BUREAU_HEAD", c.bureauId, now), "Bureau approval authority required.", 403);
    ensure(s.policies.some((p) => p.id === cmd.policyId && p.approved && current(p.from, p.until, now)), "Select an approved current policy.");
    ensure(Date.parse(cmd.dueAt) > Date.parse(now), "Choose an explicit future deadline; no regulatory deadline is inferred.", 400);
    const prior = s.sla.find((v) => v.caseId === c.id && v.taskId === null && ["RUNNING", "PAUSED", "BREACHED"].includes(v.status));
    if (prior) prior.status = "COMPLETED";
    s.sla.push({ id, caseId: c.id, taskId: null, dueAt: cmd.dueAt, originalDueAt: prior?.originalDueAt ?? cmd.dueAt, status: "RUNNING", policyVersionId: cmd.policyId });
  } else if (cmd.type === "event.schedule") {
    s.events.push({ id, caseId: c.id, title: cmd.title, at: cmd.at, type: cmd.kind });
  } else if (cmd.type === "access.revoke") {
    ensure(role(u, "BUREAU_HEAD", c.bureauId, now) && cmd.userId !== u.id, "Independent Bureau approval authority required.", 403);
    const grants = s.grants.filter((g) => g.caseId === c.id && g.userId === cmd.userId && g.scope === cmd.scope && !g.revoked); ensure(grants.length, "Current grant unavailable.", 404); for (const g of grants) g.revoked = true;
  } else if (cmd.type === "evidence.attach") {
    ensure(cmd.evidence.caseId === c.id && !s.evidence.some((e) => e.id === cmd.evidence.id), "Invalid evidence reference.", 400);
    // The attachment API supplies only server-hashed, persisted, scanned metadata.
    ensure((['CLEAN','PENDING'].includes(cmd.evidence.scan)||cmd.evidence.scan==='NOT_REQUIRED'&&cmd.evidence.mediaType==='text/plain') && cmd.evidence.status === "SUBMITTED", "Server-verified attachment metadata required.", 400);
    for(const old of s.evidence.filter(e=>e.documentId===cmd.evidence.documentId&&e.status!=='WITHDRAWN'))old.status='SUPERSEDED';
    s.evidence.push(cmd.evidence);
  } else if(cmd.type==='evidence.review'){
    ensure(role(u,'BUREAU_HEAD',c.bureauId,now),'Bureau evidence-review authority required.',403);const e=s.evidence.find(e=>e.id===cmd.evidenceId&&e.caseId===c.id);ensure(e,'Evidence unavailable.',404);
    ensure(!['SUPERSEDED','WITHDRAWN'].includes(e.status)&&!s.evidence.some(other=>other.documentId===e.documentId&&other.number>e.number),'Review the current, non-withdrawn evidence version.');
    ensure(cmd.status!=='VERIFIED'||e.scan==='CLEAN'||e.scan==='NOT_REQUIRED'&&e.mediaType==='text/plain','Quarantined/infected evidence cannot be verified.');e.status=cmd.status;
  } else if (cmd.type === "action.record") {
    ensure(Date.parse(cmd.until) > Date.parse(cmd.from), "Action end must follow its start.", 400);
    s.actions ??= []; s.conflicts ??= [];
    const action = { id, caseId: c.id, type: cmd.actionType, topic: cmd.topic, from: cmd.from, until: cmd.until, reason: cmd.reason, actorId: u.id };
    for (const other of s.actions) {
      const otherCase = s.cases.find((r) => r.id === other.caseId); if (!otherCase || otherCase.institutionId !== c.institutionId || other.caseId === c.id || other.topic.toLowerCase() !== cmd.topic.toLowerCase()) continue;
      const overlap = Math.max(Date.parse(other.from), Date.parse(cmd.from)) < Math.min(Date.parse(other.until), Date.parse(cmd.until));
      const inspection = cmd.actionType === "INSPECTION" && other.type === "INSPECTION" && overlap;
      const contradictory = overlap && [other.type, cmd.actionType].includes("APPROVAL") && [other.type, cmd.actionType].includes("REJECTION");
      if (inspection || contradictory) s.conflicts.push({ id: uuid(), caseIds: [c.id, other.caseId], actionIds: [id, other.id], explanation: inspection ? "Two recorded inspections share the same institution/topic and overlapping time windows. Human coordination review required." : "Recorded approval/rejection actions share the same institution/topic and overlap in time. This is a potential conflict, not a legal conclusion.", ruleVersion: "development-recorded-action-overlap/1", status: "DETECTED", reviewerId: null, reason: "" });
    }
    s.actions.push(action);
  } else if (cmd.type === "conflict.review") {
    ensure(role(u, "BUREAU_HEAD", c.bureauId, now), "Current Bureau reviewer required.", 403);
    const f = s.conflicts?.find((f) => f.id === cmd.conflictId && f.caseIds.includes(c.id)); ensure(f && f.status === "DETECTED", "Pending conflict unavailable.", 404);
    for (const id of f.caseIds) requireCase(s, u, id, now); Object.assign(f, { status: cmd.decision, reviewerId: u.id, reason: cmd.reason });
  }
  return { entityId: id, changed: c };
}
export function discoveryAllowed(u: Staff, now: string) { return u.memberships.some((m) => member(u, m.bureauId, now) && ["CASE_OFFICER", "BUREAU_HEAD", "AUDITOR"].some((code) => role(u, code as Staff["roles"][number]["code"], m.bureauId, now))); }
