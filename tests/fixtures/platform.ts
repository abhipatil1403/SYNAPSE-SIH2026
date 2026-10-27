import type { State, Principal } from "../../lib/platform/contracts";
export const fixtureId = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const now = "2026-10-26T12:00:00.000Z";
const from = "2026-10-01T00:00:00.000Z", until = "2026-10-30T00:00:00.000Z";
export const principal = (n = 1): Principal => ({ authId: fixtureId(n + 100), userId: fixtureId(n), sessionId: fixtureId(n + 200) });
export function platformFixture(): State {
  const staff: State["staff"] = [1, 2, 3, 4].map((n) => ({ id: fixtureId(n), authId: fixtureId(n + 100), name: `Isolated test staff ${n}`, active: true,
    memberships: [{ bureauId: fixtureId(n === 2 ? 12 : 11), from, until }],
    roles: [{ code: n === 3 ? "BUREAU_HEAD" : n === 4 ? "AUDITOR" : "CASE_OFFICER", bureauId: fixtureId(n === 2 ? 12 : 11), from, until }],
  }));
  const cases: State["cases"] = [1, 2, 3].map((n) => ({ id: fixtureId(20 + n), caseNumber: String(9000 + n), institutionId: fixtureId(13), categoryId: fixtureId(14),
    bureauId: fixtureId(n === 2 ? 12 : 11), officerId: fixtureId(n === 2 ? 2 : 1), subject: `Isolated complaint ${n}`, summary: "Explicit controlled test record; never live data.",
    status: n === 3 ? "UNDER_REVIEW" : "NEW", priority: "NORMAL", receivedAt: now, updatedAt: now, disposedAt: null, version: "1" }));
  return { revision: "1", generatedAt: now, cases, staff, nextCaseNumber: "9004", receipts: {}, revokedSessions: [], grants: [], evaluations: [],
    drafts: [], matches: [], tasks: [], evidence: [], relationships: [], findings: [], policies: [{ id: fixtureId(15), label: "Isolated fixture policy v1", approved: true, from, until, requirements: ["TASKS", "EVIDENCE", "DEPENDENCIES", "FINDINGS", "APPROVAL"] }],
    bureaus: [{ id: fixtureId(11), name: "Isolated Bureau A" }, { id: fixtureId(12), name: "Isolated Bureau B" }],
    institutions: [{ id: fixtureId(13), name: "Isolated test institution" }], comments: [], activity: [],
    categories: [{ id: fixtureId(14), name: "Isolated case category" }],
    sla: [{ id: fixtureId(16), caseId: fixtureId(21), taskId: null, dueAt: "2026-10-27T18:45:00.000Z", originalDueAt: "2026-10-27T18:45:00.000Z", status: "RUNNING", policyVersionId: fixtureId(15) }],
    events: [], notifications: [], accessRequests: [], transfers: [],
  };
}
