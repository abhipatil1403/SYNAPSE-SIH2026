import { PlatformError, type State, type Principal, type PlatformCase, type Staff } from "./contracts";
export const current = (from: string, until: string | null, now: string) => Date.parse(from) <= Date.parse(now) && (!until || Date.parse(until) > Date.parse(now));
export function resolveStaff(state: State, p: Principal) {
  const staff = state.staff.find((u) => u.id === p.userId && u.authId === p.authId && u.active);
  if (!staff || state.revokedSessions.includes(p.sessionId)) throw new PlatformError(401, "session_revoked", "Sign in with an active provisioned account.");
  return staff;
}
export function member(u: Staff, bureauId: string, now: string) {
  return u.memberships.some((m) => m.bureauId === bureauId && current(m.from, m.until, now));
}
export function role(u: Staff, code: Staff["roles"][number]["code"], bureauId: string, now: string) {
  return u.roles.some((r) => r.code === code && current(r.from, r.until, now) &&
    (!r.bureauId || r.bureauId === bureauId) && member(u, bureauId, now));
}
export function granted(s: State, u: Staff, c: PlatformCase, scopes: string[], now: string) {
  return s.grants.some((g) => g.caseId === c.id && g.userId === u.id && scopes.includes(g.scope) && !g.revoked && Date.parse(g.until) > Date.parse(now));
}
export function canRead(s: State, u: Staff, c: PlatformCase, now: string) {
  return role(u, "CASE_OFFICER", c.bureauId, now) && c.officerId === u.id ||
    role(u, "BUREAU_HEAD", c.bureauId, now) || role(u, "AUDITOR", c.bureauId, now) ||
    (u.roles.some((r) => r.code !== "SYSTEM_ADMIN" && current(r.from, r.until, now)) && granted(s, u, c, ["DETAILS", "COORDINATE"], now));
}
export function canEdit(s: State, u: Staff, c: PlatformCase, now: string) {
  return role(u, "BUREAU_HEAD", c.bureauId, now) || role(u, "CASE_OFFICER", c.bureauId, now) && c.officerId === u.id ||
    role(u, "CASE_OFFICER", c.bureauId, now) && granted(s, u, c, ["COORDINATE"], now);
}
export function canDocuments(s: State, u: Staff, c: PlatformCase, now: string) {
  return canRead(s, u, c, now) && (role(u, "BUREAU_HEAD", c.bureauId, now) || role(u, "AUDITOR", c.bureauId, now) ||
    c.officerId === u.id || granted(s, u, c, ["DOCUMENTS"], now));
}
export function requireCase(s: State, u: Staff, id: string, now: string, edit = false) {
  const c = s.cases.find((row) => row.id === id);
  if (!c || !(edit ? canEdit(s, u, c, now) : canRead(s, u, c, now)))
    throw new PlatformError(404, "not_found", "The authorized record is unavailable.");
  return c;
}
