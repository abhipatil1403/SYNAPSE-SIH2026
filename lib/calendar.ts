import type { Case, Task } from "./types";

export const APP_TIME_ZONE = "Asia/Kolkata";
export type CalendarDay = `${number}-${string}-${string}`;
export type CalendarEventType =
  | "SLA deadlines"
  | "Bureau reviews"
  | "Follow-ups"
  | "Hearings"
  | "Approvals"
  | "Bureau activities";
export interface CalendarEvent {
  id: string;
  key: string;
  at: string;
  title: string;
  type: CalendarEventType;
  caseId: string;
  bureau: string;
  href: string;
  source: string;
}
/** Optional scheduled records from an authorized repository, never invented events. */
export interface ScheduledCaseEvent {
  id: string;
  caseId: string;
  startsAt: string;
  title: string;
  type: "Hearings" | "Approvals" | "Bureau activities";
  bureau: string;
}
export function calendarDayKey(value: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function dayInstant(key: string): Date {
  // The application calendar is explicitly India time (no daylight-saving transitions).
  return new Date(`${key}T12:00:00+05:30`);
}
export function formatCalendarDay(
  key: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: APP_TIME_ZONE,
    ...options,
  }).format(dayInstant(key));
}
export function addCalendarDays(key: string, offset: number): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset))
    .toISOString()
    .slice(0, 10);
}
export function shiftCalendarMonth(month: string, offset: number): string {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + offset, 1))
    .toISOString()
    .slice(0, 7);
}
export function isCalendarDay(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function calendarMonthDays(month: string, fixedSixWeeks = false) {
  const [year, number] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, number - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const length = fixedSixWeeks ? 42 : Math.ceil((offset + count) / 7) * 7;
  return Array.from({ length }, (_, i) => {
    const key = addCalendarDays(`${month}-01`, i - offset);
    return {
      key,
      day: Number(key.slice(-2)),
      outside: key.slice(0, 7) !== month,
    };
  });
}
/** Inputs must be authorized case/task reads. Scheduled rows are also checked against that case scope. */
export function selectCalendarEvents(
  cases: readonly Case[],
  tasks: readonly Task[],
  scheduled: readonly ScheduledCaseEvent[] = [],
): CalendarEvent[] {
  const caseIds = new Set(cases.map((c) => c.id));
  const rows: CalendarEvent[] = [
    ...cases
      .filter((c) => c.status !== "DISPOSED")
      .map((c) => ({
        id: `sla:${c.id}`,
        key: calendarDayKey(c.dueAt),
        at: c.dueAt,
        title: c.subject,
        type: "SLA deadlines" as const,
        caseId: c.id,
        bureau: c.bureau,
        href: `/complaints/${c.id}`,
        source: "Case SLA · example policy",
      })),
    ...tasks
      .filter((t) => t.status !== "Done" && caseIds.has(t.caseId))
      .map((t) => ({
        id: `work:${t.id}`,
        key: calendarDayKey(t.dueAt),
        at: t.dueAt,
        title: t.title,
        type:
          t.status === "In Review"
            ? ("Bureau reviews" as const)
            : ("Follow-ups" as const),
        caseId: t.caseId,
        bureau: t.bureau,
        href: `/complaints/${t.caseId}`,
        source: `Work item ${t.id}`,
      })),
    ...scheduled
      .filter((e) => caseIds.has(e.caseId))
      .map((e) => ({
        id: `scheduled:${e.id}`,
        key: calendarDayKey(e.startsAt),
        at: e.startsAt,
        title: e.title,
        type: e.type,
        caseId: e.caseId,
        bureau: e.bureau,
        href: `/complaints/${e.caseId}`,
        source: `Scheduled ${e.type.toLowerCase()}`,
      })),
  ];
  return rows.sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id),
  );
}

export function eventsOnDay(events: readonly CalendarEvent[], key: string) {
  return events.filter((event) => event.key === key);
}
