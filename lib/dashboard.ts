import { addCalendarDays } from "./calendar";
import type { Case } from "./types";

export type DashboardPeriod = "7D" | "30D" | "90D";
/** Seven equal-width categorical bins, with disjoint civil-day boundaries and a true zero baseline. */
export function dashboardBuckets(
  cases: readonly Case[],
  today: string,
  period: DashboardPeriod,
) {
  const days = Number(period.slice(0, -1));
  const first = addCalendarDays(today, 1 - days);
  return Array.from({ length: 7 }, (_, i) => {
    const start = addCalendarDays(first, Math.floor((i * days) / 7));
    const end = addCalendarDays(first, Math.floor(((i + 1) * days) / 7));
    const last = addCalendarDays(end, -1);
    const startAt = Date.parse(`${start}T00:00:00+05:30`);
    const endAt = Date.parse(`${end}T00:00:00+05:30`);
    return {
      key: start,
      start,
      end: last,
      name: new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
      }).format(new Date(`${last}T12:00:00+05:30`)),
      Intake: cases.filter(
        (c) =>
          Date.parse(c.receivedAt) >= startAt &&
          Date.parse(c.receivedAt) < endAt,
      ).length,
      Resolved: cases.filter(
        (c) =>
          c.status === "DISPOSED" &&
          c.disposedAt &&
          Date.parse(c.disposedAt) >= startAt &&
          Date.parse(c.disposedAt) < endAt,
      ).length,
    };
  });
}
