import { test } from "node:test";
import assert from "node:assert/strict";
import { actorFor, createSeed } from "../lib/seed";
import {
  actorWithGrants,
  canApprove,
  canEdit,
  canView,
  canViewEvidence,
  deserialize,
  evaluateGate,
  execute,
  hasDependencyCycle,
  serialize,
  visibleAudit,
  visibleCases,
  visibleFindings,
  type Command,
} from "../lib/domain";
import { metrics } from "../lib/metrics";

const supervisor = actorFor("Supervisor");
const officer = actorFor("Case Officer");
const head = actorFor("Bureau Head");
const auditor = actorFor("Auditor");
const admin = actorFor("Admin");
const seed = () => createSeed(new Date("2026-10-26T04:00:00Z"));
test("seed is deterministic, typed and serializable", () => {
  assert.deepEqual(seed(), seed());
  const raw = serialize(seed());
  assert.equal(serialize(deserialize(raw)!), raw);
});
test("invalid or incompatible persisted state is rejected", () => {
  for (const value of [
    "{",
    "{}",
    "null",
    '{"schemaVersion":2}',
    JSON.stringify({ ...seed(), cases: [{ id: "oops" }] }),
  ])
    assert.equal(deserialize(value), null);
});
test("case officer sees assigned records only", () => {
  const s = seed();
  const visible = visibleCases(s, officer);
  assert.ok(visible.length > 0);
  assert.ok(visible.every((c) => c.officer === officer.id));
  assert.equal(canView(officer, s.cases[1]), false);
});
test("administrator receives no blanket case access", () => {
  const s = seed();
  assert.equal(visibleCases(s, admin).length, 0);
  assert.equal(visibleFindings(s, admin).length, 0);
  assert.equal(canApprove(admin, s.cases[0]), false);
});
test("auditor and Bureau Head remain Bureau scoped", () => {
  const s = seed();
  assert.ok(visibleCases(s, auditor).every((c) => c.bureau === "Approval"));
  assert.equal(canEdit(auditor, s.cases[0]), false);
  assert.equal(canApprove(head, s.cases[1]), false);
});
test("findings do not reveal partially authorized cross-Bureau details", () => {
  const s = seed();
  assert.ok(!visibleFindings(s, officer).some((f) => f.id === "AI-001"));
  assert.equal(visibleFindings(s, supervisor).length, 4);
});
test("audit events follow case visibility", () => {
  const s = seed();
  assert.ok(
    visibleAudit(s, officer).every((e) =>
      s.cases.some((c) => c.id === e.target && c.officer === officer.id),
    ),
  );
  assert.equal(visibleAudit(s, admin).length, 0);
});
test("invalid legal transition is rejected even for Supervisor", () => {
  const s = seed();
  assert.throws(
    () =>
      execute(s, supervisor, {
        type: "transition",
        caseId: s.cases[0].id,
        status: "DISPOSED",
        reason: "Skip all work",
        version: 1,
      }),
    /not permitted/,
  );
});
test("auditor cannot mutate case notes", () => {
  const s = seed();
  assert.throws(
    () =>
      execute(s, auditor, {
        type: "note",
        caseId: s.cases[0].id,
        text: "Unauthorized note",
      }),
    /permission/,
  );
});
test("notes persist and append accountable audit events", () => {
  const s = seed();
  const n = execute(s, officer, {
    type: "note",
    caseId: s.cases[0].id,
    text: "Verified the original source",
  });
  assert.equal(n.cases[0].notes[0].actor, officer.name);
  assert.equal(n.cases[0].version, 2);
  assert.equal(n.audit[0].action, "Case note added");
  assert.equal(s.cases[0].notes.length, 0);
  assert.equal(deserialize(serialize(n))?.cases[0].notes.length, 1);
});
test("optimistic revisions and case versions reject stale writes", () => {
  const s = seed();
  assert.throws(
    () =>
      execute(
        s,
        supervisor,
        { type: "note", caseId: s.cases[0].id, text: "Good note" },
        42,
      ),
    /changed/,
  );
  assert.throws(
    () =>
      execute(s, supervisor, {
        type: "transition",
        caseId: s.cases[0].id,
        status: "ON_HOLD",
        reason: "Await records",
        version: 9,
      }),
    /Stale/,
  );
});
test("hold and resume retain previous state and original SLA", () => {
  const s = seed();
  let n = execute(s, supervisor, {
    type: "transition",
    caseId: s.cases[0].id,
    status: "ON_HOLD",
    reason: "Await institution records",
    version: 1,
  });
  assert.equal(n.cases[0].dueAt, s.cases[0].dueAt);
  assert.equal(n.cases[0].previousStatus, "IN_PROGRESS");
  n = execute(n, supervisor, {
    type: "transition",
    caseId: s.cases[0].id,
    status: "IN_PROGRESS",
    reason: "Records received",
    version: 2,
  });
  assert.equal(n.cases[0].status, "IN_PROGRESS");
});
test("assigned officer cannot place a case on hold without approval authority", () => {
  const s = seed();
  assert.throws(
    () =>
      execute(s, officer, {
        type: "transition",
        caseId: s.cases[0].id,
        status: "ON_HOLD",
        reason: "Pause please",
        version: 1,
      }),
    /permission/,
  );
});
test("review requires completed investigation work", () => {
  const s = seed();
  assert.throws(
    () =>
      execute(s, supervisor, {
        type: "transition",
        caseId: s.cases[0].id,
        status: "RESOLUTION_REVIEW",
        reason: "Request closure",
        version: 1,
      }),
    /Complete investigation/,
  );
});
test("work cannot jump stages or dispose a case", () => {
  const s = seed();
  const t = s.tasks[0];
  assert.throws(
    () =>
      execute(s, supervisor, {
        type: "move-task",
        taskId: t.id,
        status: "Done",
        version: t.version,
      }),
    /one stage/,
  );
  const n = execute(s, officer, {
    type: "move-task",
    taskId: t.id,
    status: "In Review",
    version: t.version,
  });
  assert.equal(n.cases[0].status, "IN_PROGRESS");
});
test("work for another officer cannot be moved", () => {
  const s = seed();
  assert.throws(
    () =>
      execute(s, officer, {
        type: "move-task",
        taskId: s.tasks[1].id,
        status: "Done",
        version: 1,
      }),
    /permission/,
  );
});
test("closed-case work is immutable until reopening", () => {
  const s = seed();
  assert.throws(
    () =>
      execute(s, supervisor, {
        type: "move-task",
        taskId: s.tasks[6].id,
        status: "In Review",
        version: 1,
      }),
    /Reopen/,
  );
});
test("missing report and unresolved dependency block Quality Gate", () => {
  const s = seed();
  const g = evaluateGate(s, s.cases[2]);
  assert.equal(g.result, "BLOCKED");
  assert.equal(
    g.items.find((i) => i.label === "Mandatory investigation report")?.pass,
    false,
  );
  assert.equal(
    g.items.find((i) => i.label === "Dependencies resolved")?.pass,
    false,
  );
});
test("fresh passing Quality Gate permits scoped human disposal", () => {
  const s = seed();
  const c = s.cases[5];
  const g = evaluateGate(s, c);
  assert.equal(g.result, "PASS");
  const n = execute(s, head, {
    type: "transition",
    caseId: c.id,
    status: "DISPOSED",
    reason: "Verified report and final communication",
    version: c.version,
    evaluation: g,
  });
  assert.equal(n.cases[5].status, "DISPOSED");
  assert.ok(n.cases[5].disposedAt);
  assert.equal(n.audit[0].actor, head.name);
});
test("forged PASS result cannot bypass underlying gate", () => {
  const s = seed();
  const c = s.cases[2];
  const g = evaluateGate(s, c);
  g.result = "PASS";
  g.items.forEach((i) => (i.pass = true));
  assert.throws(
    () =>
      execute(s, supervisor, {
        type: "transition",
        caseId: c.id,
        status: "DISPOSED",
        reason: "Forged evaluation",
        version: 1,
        evaluation: g,
      }),
    /Quality Gate blocked/,
  );
});
test("stale gate invalidates after any material workspace mutation", () => {
  const s = seed();
  const c = s.cases[5];
  const g = evaluateGate(s, c);
  const n = execute(s, supervisor, {
    type: "note",
    caseId: c.id,
    text: "Additional source context",
  });
  assert.throws(
    () =>
      execute(n, supervisor, {
        type: "transition",
        caseId: c.id,
        status: "DISPOSED",
        reason: "Trying stale gate",
        version: 2,
        evaluation: g,
      }),
    /Evaluate the current/,
  );
});
test("Case Officer cannot dispose even with a passing gate", () => {
  const s = seed();
  const c = s.cases[5];
  assert.throws(
    () =>
      execute(s, officer, {
        type: "transition",
        caseId: c.id,
        status: "DISPOSED",
        reason: "Officer approval attempt",
        version: 1,
        evaluation: evaluateGate(s, c),
      }),
    /permission/,
  );
});
test("reopening retains prior disposition and starts a new review cycle", () => {
  const s = seed();
  const c = s.cases[6];
  const n = execute(s, supervisor, {
    type: "transition",
    caseId: c.id,
    status: "REOPENED",
    reason: "New supporting evidence received",
    version: 1,
  });
  assert.equal(n.cases[6].cycle, 2);
  assert.equal(n.cases[6].disposedAt, c.disposedAt);
  assert.equal(n.cases[6].contributionApproved, false);
});
test("evidence versions preserve earlier content", () => {
  const s = seed();
  const c = s.cases[0];
  const n = execute(s, officer, {
    type: "evidence",
    caseId: c.id,
    name: c.evidence[0].name,
    body: "New revised factual response",
    hash: "testhash",
    mandatory: false,
  });
  assert.equal(n.cases[0].evidence.at(-1)?.version, 2);
  assert.equal(n.cases[0].evidence[0].version, 1);
});
test("dependency self-links and directed cycles are rejected", () => {
  const s = seed();
  const r = s.relationships[1];
  assert.equal(hasDependencyCycle(s.relationships, r.target, r.source), true);
  assert.throws(
    () =>
      execute(s, supervisor, {
        type: "link",
        source: r.target,
        target: r.source,
        linkType: "DEPENDS_ON",
        reason: "Would create a cycle",
      }),
    /cycle/,
  );
  assert.throws(
    () =>
      execute(s, supervisor, {
        type: "link",
        source: r.source,
        target: r.source,
        linkType: "RELATED_TO",
        reason: "Self reference",
      }),
    /itself/,
  );
});
test("confirming related cases never merges or disposes records", () => {
  const s = seed();
  const n = execute(s, supervisor, {
    type: "link",
    source: s.cases[0].id,
    target: s.cases[1].id,
    linkType: "RELATED_TO",
    reason: "Shared context, different issues",
  });
  assert.equal(n.cases.length, s.cases.length);
  assert.equal(n.cases[0].status, s.cases[0].status);
  assert.equal(n.relationships.length, s.relationships.length + 1);
});
test("finding review requires a human reason, records reviewer, preserves cases", () => {
  const s = seed();
  const command: Command = {
    type: "review-finding",
    findingId: "AI-002",
    decision: "Confirmed",
    reason: "Both action dates verified against synthetic rule",
  };
  const n = execute(s, supervisor, command);
  assert.equal(n.findings[1].reviewer, supervisor.name);
  assert.equal(n.findings[1].state, "Confirmed");
  assert.deepEqual(n.cases, s.cases);
  assert.throws(() => execute(n, supervisor, command), /already been reviewed/);
});
test("read-only or partly authorized finding review fails", () => {
  const s = seed();
  for (const actor of [auditor, officer, admin])
    assert.throws(
      () =>
        execute(s, actor, {
          type: "review-finding",
          findingId: "AI-001",
          decision: "Dismissed",
          reason: "Not authorized",
        }),
      /not authorized/,
    );
});
test("intake verification is required before registration", () => {
  const s = seed();
  assert.throws(
    () =>
      execute(s, supervisor, {
        type: "decide-intake",
        submissionId: "IN-001",
        decision: "Register",
        reason: "Human review completed",
      }),
    /Verify/,
  );
});
test("repeated intake confirmation creates exactly one case and preserves original language", () => {
  let s = seed();
  const original = s.submissions[0].body;
  s = execute(s, supervisor, {
    type: "verify-intake",
    submissionId: "IN-001",
    institution: "Sahyadri Institute of Technology",
  });
  const command: Command = {
    type: "decide-intake",
    submissionId: "IN-001",
    decision: "Register",
    reason: "Human confirmed new complaint",
  };
  const n = execute(s, supervisor, command);
  const replay = execute(n, supervisor, command);
  assert.equal(n.cases.length, 17);
  assert.equal(replay.cases.length, 17);
  assert.equal(replay.submissions[0].body, original);
  assert.equal(replay.submissions[0].language, "Marathi");
});
test("unauthorized intake and unauthorized CSV export fail", () => {
  const s = seed();
  assert.throws(
    () =>
      execute(s, officer, {
        type: "verify-intake",
        submissionId: "IN-001",
        institution: "Example School",
      }),
    /restricted/,
  );
  assert.throws(
    () => execute(s, officer, { type: "export", caseIds: [s.cases[1].id] }),
    /cannot access/,
  );
});
test("authorized CSV metadata export is audited", () => {
  const s = seed();
  const n = execute(s, officer, { type: "export", caseIds: [s.cases[0].id] });
  assert.equal(n.audit[0].action, "Authorized metadata exported");
});
test("transfer decision preserves SLA and assigns exactly one lead", () => {
  let s = seed();
  const original = s.cases[0].dueAt;
  s = execute(s, officer, {
    type: "request-transfer",
    caseId: s.cases[0].id,
    to: "Academic",
    reason: "Academic review is the lead issue",
  });
  const tr = s.transfers[0];
  assert.throws(
    () =>
      execute(s, head, {
        type: "decide-transfer",
        transferId: tr.id,
        approve: true,
        reason: "Bureau-only approval",
      }),
    /Supervisor/,
  );
  const n = execute(s, supervisor, {
    type: "decide-transfer",
    transferId: tr.id,
    approve: true,
    reason: "Cross-Bureau coordination approved",
  });
  assert.equal(n.cases[0].bureau, "Academic");
  assert.equal(n.cases[0].dueAt, original);
  assert.equal(n.cases[0].officer, "");
  assert.throws(
    () =>
      execute(n, supervisor, {
        type: "decide-transfer",
        transferId: tr.id,
        approve: true,
        reason: "Repeated decision",
      }),
    /no longer pending/,
  );
});
test("settings email validation does not accept invalid input", () => {
  const s = seed();
  assert.throws(() =>
    execute(s, supervisor, {
      type: "settings",
      settings: { ...s.settings, email: "not-an-email" },
    }),
  );
});
test("KPI counts reconcile to visible underlying records", () => {
  const s = seed();
  const m = metrics(s.cases, new Date("2026-10-26T10:00:00Z"));
  assert.equal(m.total, 16);
  assert.equal(m.resolved, 6);
  assert.equal(m.active, 10);
  assert.equal(m.review, 2);
  assert.equal(m.total, m.resolved + m.active);
  assert.equal(metrics([]).onTime, null);
});
test("DETAILS grant does not confer DOCUMENTS or mutation authority", () => {
  let s = seed();
  const c = s.cases[1];
  s = execute(s, officer, {
    type: "request-access",
    caseId: c.id,
    scope: "DETAILS",
    purpose: "Review related institutional context",
    days: 7,
  });
  s = execute(s, supervisor, {
    type: "decide-access",
    requestId: s.accessRequests[0].id,
    approve: true,
    reason: "Purpose and scope justified",
  });
  const scoped = actorWithGrants(officer, s);
  assert.equal(canView(scoped, c), true);
  assert.equal(canViewEvidence(scoped, c), false);
  assert.equal(canEdit(scoped, c), false);
  assert.throws(
    () =>
      execute(s, officer, {
        type: "note",
        caseId: c.id,
        text: "Details-only mutation",
      }),
    /permission/,
  );
});
test("DOCUMENTS requires an independent grant and details permission", () => {
  let s = seed();
  const c = s.cases[1];
  for (const scope of ["DETAILS", "DOCUMENTS"] as const) {
    s = execute(s, officer, {
      type: "request-access",
      caseId: c.id,
      scope,
      purpose: "Review source versions for related complaint",
      days: 7,
    });
    const request = s.accessRequests.at(-1)!;
    s = execute(s, supervisor, {
      type: "decide-access",
      requestId: request.id,
      approve: true,
      reason: "Source review justified",
    });
  }
  assert.equal(canViewEvidence(actorWithGrants(officer, s), c), true);
  assert.equal(canEdit(actorWithGrants(officer, s), c), false);
});
test("access requests require designated approval and expire", () => {
  let s = seed();
  const c = s.cases[1];
  s = execute(s, officer, {
    type: "request-access",
    caseId: c.id,
    scope: "DETAILS",
    purpose: "Time-limited contextual review",
    days: 1,
  });
  const r = s.accessRequests[0];
  assert.throws(
    () =>
      execute(s, head, {
        type: "decide-access",
        requestId: r.id,
        approve: true,
        reason: "Unauthorized approval",
      }),
    /Supervisor/,
  );
  s = execute(s, supervisor, {
    type: "decide-access",
    requestId: r.id,
    approve: true,
    reason: "Approved one-day contextual review",
  });
  const expired = actorWithGrants(
    officer,
    s,
    new Date(Date.parse(r.expiresAt) + 1000).toISOString(),
  );
  assert.equal(canView(expired, c), false);
});
test("browser-supplied grant claims are ignored by workflow service", () => {
  const s = seed();
  const forged = {
    ...officer,
    grants: [{ caseId: s.cases[1].id, scope: "COORDINATE" as const }],
  };
  assert.throws(
    () =>
      execute(s, forged, {
        type: "note",
        caseId: s.cases[1].id,
        text: "Forged client scope",
      }),
    /permission/,
  );
});
