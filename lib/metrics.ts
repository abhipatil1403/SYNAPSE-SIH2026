import type { Case } from "./types";
export function metrics(cases: Case[], now = new Date()) {
  const resolved = cases.filter((c) => c.status === "DISPOSED");
  const active = cases.filter((c) => c.status !== "DISPOSED");
  const overdue = active.filter((c) => new Date(c.dueAt) < now);
  const onTime = resolved.filter(
    (c) => c.disposedAt && c.disposedAt <= c.dueAt,
  );
  const durations = resolved
    .filter((c) => c.disposedAt)
    .map(
      (c) => (Date.parse(c.disposedAt!) - Date.parse(c.receivedAt)) / 86400000,
    )
    .sort((a, b) => a - b);
  const mid = Math.floor(durations.length / 2);
  const median = !durations.length
    ? null
    : durations.length % 2
      ? durations[mid]
      : (durations[mid - 1] + durations[mid]) / 2;
  return {
    total: cases.length,
    resolved: resolved.length,
    active: active.length,
    review: active.filter((c) => c.status === "RESOLUTION_REVIEW").length,
    overdue: overdue.length,
    onTime: resolved.length
      ? Math.round((onTime.length / resolved.length) * 100)
      : null,
    median,
    rate: cases.length ? Math.round((resolved.length / cases.length) * 100) : 0,
  };
}
