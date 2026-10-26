import { test } from "node:test";
import assert from "node:assert/strict";
import { actorFor, createSeed } from "../lib/seed";
import { visibleCases, visibleTasks } from "../lib/domain";
import {
  addCalendarDays,
  calendarDayKey,
  calendarMonthDays,
  eventsOnDay,
  isCalendarDay,
  selectCalendarEvents,
  shiftCalendarMonth,
} from "../lib/calendar";
import { dashboardBuckets } from "../lib/dashboard";

const seed = () => createSeed(new Date("2026-10-26T04:00:00Z"));
test("scheduled calendar records sort by instant across mixed UTC offsets", () => {
  const s = seed();
  const records = [
    {
      id: "early",
      caseId: s.cases[0].id,
      title: "Earlier approval",
      type: "Approvals" as const,
      bureau: "Approval",
      startsAt: "2026-10-26T09:00:00+05:30",
    },
    {
      id: "later",
      caseId: s.cases[0].id,
      title: "Later approval",
      type: "Approvals" as const,
      bureau: "Approval",
      startsAt: "2026-10-26T05:00:00Z",
    },
  ];
  assert.deepEqual(selectCalendarEvents([], [], records), []);
  assert.deepEqual(
    selectCalendarEvents(s.cases, [], records)
      .filter((e) => e.id.startsWith("scheduled:"))
      .map((e) => e.id),
    ["scheduled:early", "scheduled:later"],
  );
});
test("calendar dates use India time at UTC day boundaries", () => {
  assert.equal(calendarDayKey("2026-10-25T20:00:00Z"), "2026-10-26");
  assert.equal(calendarDayKey("2026-10-26T18:29:59Z"), "2026-10-26");
  assert.equal(calendarDayKey("2026-10-26T18:30:00Z"), "2026-10-27");
});
test("month navigation crosses year and leap-year boundaries", () => {
  assert.equal(shiftCalendarMonth("2026-12", 1), "2027-01");
  assert.equal(shiftCalendarMonth("2026-01", -1), "2025-12");
  assert.equal(addCalendarDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addCalendarDays("2024-02-29", 1), "2024-03-01");
});
test("month grids have correct weekdays, dates and no missing month days", () => {
  for (const month of ["2024-02", "2026-02", "2026-03", "2026-10", "2026-12"]) {
    const days = calendarMonthDays(month);
    assert.equal(days.length % 7, 0);
    assert.equal(new Date(`${days[0].key}T12:00:00Z`).getUTCDay(), 1);
    const inMonth = days.filter((d) => !d.outside);
    assert.equal(inMonth[0].day, 1);
    assert.equal(new Set(days.map((d) => d.key)).size, days.length);
    assert.equal(
      inMonth.at(-1)?.day,
      new Date(
        Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0),
      ).getUTCDate(),
    );
    assert.equal(calendarMonthDays(month, true).length, 42);
  }
});
test("invalid day query parameters cannot create invalid calendar state", () => {
  for (const day of [
    null,
    "not-a-date",
    "2026-02-29",
    "2026-13-01",
    "2026-10-32",
    "2026-1-1",
  ])
    assert.equal(isCalendarDay(day), false);
  assert.equal(isCalendarDay("2024-02-29"), true);
});
test("shared calendar includes actual open SLAs and review/follow-up work only", () => {
  const s = seed();
  const events = selectCalendarEvents(s.cases, s.tasks);
  assert.equal(
    events.filter((e) => e.type === "SLA deadlines").length,
    s.cases.filter((c) => c.status !== "DISPOSED").length,
  );
  assert.equal(
    events.filter((e) => e.id.startsWith("work:")).length,
    s.tasks.filter((t) => t.status !== "Done").length,
  );
  assert.ok(events.some((e) => e.type === "Bureau reviews"));
  assert.ok(events.every((e) => e.href === `/complaints/${e.caseId}`));
  assert.equal(eventsOnDay(events, "2026-10-27").length, 2);
});
test("calendar scope excludes unauthorized tasks, scheduled records and cases", () => {
  const s = seed();
  const actor = actorFor("Case Officer");
  const cases = visibleCases(s, actor);
  const events = selectCalendarEvents(cases, s.tasks, [
    {
      id: "restricted-hearing",
      caseId: s.cases[1].id,
      title: "Restricted hearing",
      bureau: "Academic",
      type: "Hearings",
      startsAt: s.cases[1].dueAt,
    },
  ]);
  assert.ok(events.every((e) => cases.some((c) => c.id === e.caseId)));
  assert.ok(!events.some((e) => e.caseId === s.cases[1].id));
  assert.deepEqual(selectCalendarEvents([], s.tasks), []);
  assert.deepEqual(
    selectCalendarEvents(
      visibleCases(s, actorFor("Admin")),
      visibleTasks(s, actorFor("Admin")),
    ),
    [],
  );
});
test("scheduled hearing/approval/activity indicators consume real authorized adapter records", () => {
  const s = seed();
  const caseId = s.cases[0].id;
  const types = ["Hearings", "Approvals", "Bureau activities"] as const;
  const records = types.map((type, i) => ({
    id: `schedule-${i}`,
    caseId,
    title: `Recorded ${type}`,
    bureau: "Approval",
    type,
    startsAt: s.cases[0].dueAt,
  }));
  const events = selectCalendarEvents(s.cases, s.tasks, records);
  for (const type of types)
    assert.equal(events.filter((e) => e.type === type).length, 1);
});
test("dashboard bins reconcile to received cases and use disjoint day boundaries", () => {
  const s = seed();
  for (const period of ["7D", "30D", "90D"] as const) {
    const bins = dashboardBuckets(s.cases, "2026-10-26", period);
    assert.equal(bins.length, 7);
    const start = Date.parse(
      `${addCalendarDays("2026-10-26", 1 - Number(period.slice(0, -1)))}T00:00:00+05:30`,
    );
    const end = Date.parse("2026-10-27T00:00:00+05:30");
    assert.equal(
      bins.reduce((n, b) => n + b.Intake, 0),
      s.cases.filter(
        (c) =>
          Date.parse(c.receivedAt) >= start && Date.parse(c.receivedAt) < end,
      ).length,
    );
    assert.equal(
      bins.reduce((n, b) => n + b.Resolved, 0),
      s.cases.filter(
        (c) =>
          c.status === "DISPOSED" &&
          c.disposedAt &&
          Date.parse(c.disposedAt) >= start &&
          Date.parse(c.disposedAt) < end,
      ).length,
    );
    for (let i = 1; i < 7; i++)
      assert.equal(addCalendarDays(bins[i - 1].end, 1), bins[i].start);
  }
});
test("current-day registrations after the seed time appear, future dates do not", () => {
  const s = seed();
  const cases = [
    { ...s.cases[0], receivedAt: "2026-10-26T23:59:59+05:30" },
    { ...s.cases[1], receivedAt: "2026-10-27T00:00:00+05:30" },
  ];
  const bins = dashboardBuckets(cases, "2026-10-26", "7D");
  assert.equal(
    bins.reduce((n, b) => n + b.Intake, 0),
    1,
  );
  assert.equal(bins[6].Intake, 1);
  assert.equal(
    dashboardBuckets([], "2026-10-26", "30D").reduce(
      (n, b) => n + b.Intake + b.Resolved,
      0,
    ),
    0,
  );
});
