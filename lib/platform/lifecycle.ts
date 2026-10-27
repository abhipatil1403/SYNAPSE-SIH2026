// Raw deployed lifecycle codes. DISPOSED is reachable only through the Quality
// Gate command; reopening awaits a persisted review-cycle implementation.
export const allowedTransitions: Record<string, string[]> = {
  NEW: ["ASSIGNED"], ASSIGNED: ["UNDER_REVIEW"], UNDER_REVIEW: ["AWAITING_INFORMATION", "ACTION_INITIATED", "ESCALATED"],
  AWAITING_INFORMATION: ["UNDER_REVIEW"], ACTION_INITIATED: ["UNDER_REVIEW", "ESCALATED"],
  ESCALATED: ["UNDER_REVIEW"], DISPOSED: [], REOPENED: ["ASSIGNED", "UNDER_REVIEW"],
};
