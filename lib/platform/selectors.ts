import { calendarDayKey, addCalendarDays } from "../calendar";
import { snapshotSchema, type State, type Snapshot, type Principal, PlatformError } from "./contracts";
import { canRead, canDocuments, resolveStaff, current, role } from "./authorization";
import { configurationAdmin, intakeAuthority, discoveryAllowed } from "./operations";

export function authorizedSnapshot(state: State, principal: Principal, now: string): Snapshot {
  const u = resolveStaff(state, principal);
  const cases = state.cases.filter((c) => canRead(state, u, c, now));
  const ids = new Set(cases.map((c) => c.id));
  const documents = new Set(cases.filter((c) => canDocuments(state, u, c, now)).map((c) => c.id));
  const evidence = state.evidence.filter((e) => documents.has(e.caseId));
  const versions = new Set(evidence.map((e) => e.versionId));
  // Explicit projection prevents staff, session IDs, grants, storage keys and receipts leaking.
  return snapshotSchema.parse({ revision: state.revision, generatedAt: now, cases,
    drafts: state.drafts.filter((d) => intakeAuthority(u, d.bureauId, now) && (d.creatorId === u.id || role(u, "BUREAU_HEAD", d.bureauId, now))),
    matches: state.matches.filter((m) => ids.has(m.caseId) && state.drafts.some((d) => d.id === m.draftId && intakeAuthority(u, d.bureauId, now) && (d.creatorId === u.id || role(u, "BUREAU_HEAD", d.bureauId, now)))),
    tasks: state.tasks.filter((t) => ids.has(t.caseId)), evidence,
    relationships: state.relationships.filter((r) => ids.has(r.sourceId) && ids.has(r.targetId)),
    findings: state.findings.filter((f) => f.caseIds.every((id) => ids.has(id)) && f.sourceVersionIds.every((id) => versions.has(id))),
    policies: state.policies.filter((p) => p.approved && current(p.from, p.until, now)),
    bureaus: state.bureaus,
    categories: state.categories,
    institutions: discoveryAllowed(u, now) || configurationAdmin(u, now) ? state.institutions : [],
    directory: state.staff.filter((v) => v.active).map((v) => ({ id: v.id, name: v.name, bureauIds: v.memberships.filter((m) => current(m.from, m.until, now)).map((m) => m.bureauId), roles: v.roles.filter((r) => current(r.from, r.until, now)).map((r) => r.code) })),
    me: { id: u.id, name: u.name, bureauIds: u.memberships.filter((m) => current(m.from, m.until, now)).map((m) => m.bureauId), roles: u.roles.filter((r) => current(r.from, r.until, now)).map((r) => r.code) },
    discovery: discoveryAllowed(u, now) ? state.cases.filter((c) => c.discoverable && !ids.has(c.id)).map((c) => ({ id: c.id, caseNumber: c.caseNumber, institutionId: c.institutionId, categoryId: c.categoryId, bureauId: c.bureauId })) : [],
    actions: state.actions?.filter((a) => ids.has(a.caseId)),
    conflicts: state.conflicts?.filter((f) => f.caseIds.every((id) => ids.has(id))),
    translations: state.translations?.filter((t) => state.drafts.some((d) => d.id === t.draftId && intakeAuthority(u, d.bureauId, now) && (d.creatorId === u.id || role(u, "BUREAU_HEAD", d.bureauId, now)))),
    comments: state.comments.filter((r) => ids.has(r.caseId)),
    activity: state.activity.filter((r) => r.caseId ? ids.has(r.caseId) : r.actorId === u.id),
    sla: state.sla.filter((r) => ids.has(r.caseId)), events: state.events.filter((r) => ids.has(r.caseId)),
    notifications: state.notifications.filter((r) => r.userId === u.id && (!r.caseId || ids.has(r.caseId))),
    accessRequests: state.accessRequests.filter((r) => r.requesterId === u.id || ids.has(r.caseId) && u.roles.some((x) => x.code === "BUREAU_HEAD" && current(x.from, x.until, now))),
    transfers: state.transfers.filter((r) => ids.has(r.caseId) || role(u,"BUREAU_HEAD",r.toBureauId,now)),
  });
}
export function registry(snapshot: Snapshot, query: { q?: string; status?: string; priority?: string; page?: number; pageSize?: number }) {
  const { page = 1, pageSize = 20 } = query;
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50)
    throw new PlatformError(400, "invalid_query", "Use a page size between 1 and 50.");
  const rows = snapshot.cases.filter((c) => (!query.status || c.status === query.status) && (!query.priority || c.priority === query.priority) &&
    (!query.q || (c.subject + " " + c.caseNumber).toLowerCase().includes(query.q.toLowerCase())))
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt) || b.id.localeCompare(a.id));
  return { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize };
}
/** Both Overview and full Calendar consume this same authorized projection. */
export function platformCalendar(s: Snapshot) {
  const active = new Set(s.cases.filter((c) => c.status !== "DISPOSED").map((c) => c.id));
  return [
    ...s.sla.filter((r) => active.has(r.caseId) && ["RUNNING", "PAUSED", "BREACHED"].includes(r.status)).map((r) => ({ id: r.id, caseId: r.caseId, title: s.cases.find((c) => c.id === r.caseId)!.subject,
      at: r.dueAt, type: "SLA" as const })),
    ...s.tasks.filter((t) => t.dueAt && !["COMPLETED", "CANCELLED"].includes(t.status)).map((t) => ({ id: t.id, caseId: t.caseId, title: t.title, at: t.dueAt!, type: "TASK" as const })),
    ...s.events,
  ].map((e) => ({ ...e, day: calendarDayKey(e.at), href: `/platform/cases/${e.caseId}` })).sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));
}
export function platformDashboard(s: Snapshot, now: string, period = 30) {
  if (![7, 30, 90].includes(period)) throw new PlatformError(400, "invalid_period", "Choose 7, 30 or 90 days.");
  const total = s.cases.length, resolved = s.cases.filter((c) => c.status === "DISPOSED").length;
  const today = calendarDayKey(now), first = addCalendarDays(today, 1 - period);
  const analytics = Array.from({ length: 7 }, (_, i) => {
    const start = addCalendarDays(first, Math.floor(i * period / 7)), end = addCalendarDays(first, Math.floor((i + 1) * period / 7));
    const lower = Date.parse(start + "T00:00:00+05:30"), upper = Date.parse(end + "T00:00:00+05:30");
    return { start, end, received: s.cases.filter((c) => Date.parse(c.receivedAt) >= lower && Date.parse(c.receivedAt) < upper).length,
      resolved: s.cases.filter((c) => c.status === "DISPOSED" && c.disposedAt && Date.parse(c.disposedAt) >= lower && Date.parse(c.disposedAt) < upper).length };
  });
  return { total, resolved, active: total - resolved, pendingReview: s.cases.filter((c) => c.status === "UNDER_REVIEW").length,
    overdue:s.cases.filter(c=>c.status!=='DISPOSED'&&s.sla.some(v=>v.caseId===c.id&&['RUNNING','BREACHED'].includes(v.status)&&Date.parse(v.dueAt)<Date.parse(now))).length,
    ageing:[{label:'0–7 days',min:0,max:7},{label:'8–30 days',min:8,max:30},{label:'31+ days',min:31,max:Infinity}].map(b=>({label:b.label,count:s.cases.filter(c=>{const days=Math.max(0,Math.floor((Date.parse(now)-Date.parse(c.receivedAt))/86400000));return days>=b.min&&days<=b.max;}).length})),
    categories:s.categories.map(k=>({name:k.name,count:s.cases.filter(c=>c.categoryId===k.id).length})),
    regions:[...new Set(s.institutions.map(i=>i.region||i.state||'Unspecified'))].map(name=>({name,count:s.cases.filter(c=>{const i=s.institutions.find(i=>i.id===c.institutionId);return (i?.region||i?.state||'Unspecified')===name;}).length})),
    resolutionPercent: total ? Math.round(resolved / total * 100) : 0,
    analytics, deadlines: platformCalendar(s).filter((e) => e.type === "SLA").slice(0, 5),
    bureaus: s.bureaus.map((b) => ({ ...b, cases: s.cases.filter((c) => c.bureauId === b.id).length, tasks: s.tasks.filter((t) => t.bureauId === b.id && t.status !== "COMPLETED" && t.status !== "CANCELLED").length })),
    recentCases: registry(s, { pageSize: 5 }).items, findings: s.findings, activity: [...s.activity].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 8),
  };
}
export function authorizedReport(s: Snapshot) {
  return { generatedAt: s.generatedAt, total: s.cases.length,
    workload: s.bureaus.map((b) => ({ bureau: b.name, total: s.cases.filter((c) => c.bureauId === b.id).length })),
    rows: s.cases.map((c) => ({ caseNumber: c.caseNumber, subject: c.subject, status: c.status, priority: c.priority, receivedAt: c.receivedAt })) };
}
