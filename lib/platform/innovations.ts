import { createHash } from "node:crypto";
import { type Snapshot } from "./contracts";

export type Rule = { id: string; version: string; policyVersionId: string; approved: boolean;
  incompatible: [string, string]; explanation: string };
export type Action = { id: string; caseId: string; institutionId: string; campus: string; issue: string; type: string;
  startsAt: string; endsAt: string; sourceVersionIds: string[] };
/** Rule-only candidates, never a claim that an AI scan or regulatory decision completed. */
export function conflictCandidates(s: Snapshot, actions: Action[], rules: Rule[]) {
  const ids = new Set(s.cases.map((c) => c.id)), sources = new Set(s.evidence.filter((e) => e.scan === "CLEAN").map((e) => e.versionId));
  const permitted = actions.filter((a) => ids.has(a.caseId) && a.sourceVersionIds.length && a.sourceVersionIds.every((id) => sources.has(id)));
  return permitted.flatMap((a, i) => permitted.slice(i + 1).flatMap((b) => rules.filter((r) => r.approved && s.policies.some((p) => p.id === r.policyVersionId && p.approved) &&
    a.institutionId === b.institutionId && a.campus === b.campus && a.issue === b.issue &&
    Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(b.startsAt) < Date.parse(a.endsAt) &&
    ((r.incompatible[0] === a.type && r.incompatible[1] === b.type) || (r.incompatible[0] === b.type && r.incompatible[1] === a.type)))
    .map((r) => ({ key: createHash("sha256").update([r.id, r.version, a.id, b.id].join(":")).digest("hex"),
      kind: "CONFLICT" as const, caseIds: [...new Set([a.caseId, b.caseId])], policyVersionId: r.policyVersionId, ruleVersion: r.version,
      explanation: r.explanation, sourceVersionIds: [...new Set([...a.sourceVersionIds, ...b.sourceVersionIds])], reviewRequired: true as const }))));
}
export type SourcedClaim = { id: string; caseId: string; subject: string; predicate: string; value: string; campus: string;
  from: string; until: string; versionId: string; page: number; quote: string };
export function contradictionCandidates(s: Snapshot, claims: SourcedClaim[]) {
  const allowed = claims.filter((c) => s.evidence.some((e) => e.caseId === c.caseId && e.versionId === c.versionId && e.scan === "CLEAN") && c.page > 0 && c.quote.trim());
  return allowed.flatMap((a, i) => allowed.slice(i + 1).filter((b) => a.subject === b.subject && a.predicate === b.predicate && a.campus === b.campus &&
    a.value.trim().toLowerCase() !== b.value.trim().toLowerCase() && Date.parse(a.from) < Date.parse(b.until) && Date.parse(b.from) < Date.parse(a.until))
    .map((b) => ({ kind: "CONTRADICTION" as const, claimIds: [a.id, b.id], caseIds: [...new Set([a.caseId, b.caseId])],
      sourceVersionIds: [a.versionId, b.versionId], explanation: `Sourced values differ for ${a.subject} / ${a.predicate} in the same campus and overlapping period. Human context review is required.`,
      provenance: [{ page: a.page, quote: a.quote }, { page: b.page, quote: b.quote }], ruleVersion: "exact-context-v1", reviewRequired: true as const })));
}
export const unsupportedServices = Object.freeze({ modelExtraction: "No approved extraction/model provider is configured; no scan is reported as completed.",
  translation: "Only persisted source and reviewed translation records may be shown; no translated output is fabricated.",
  malwareScanning: "No trusted scan worker is configured; uploads remain quarantined and disabled." });
