import type { Snapshot } from "./contracts";
export type CaseGraphNode = { id: string; kind: "CASE" | "INSTITUTION" | "BUREAU" | "OFFICER"; label: string; href?: string };
export type CaseGraphEdge = { id: string; source: string; target: string; type: string; derived: boolean };
/** Input must be the server's authorized projection, never an unfiltered graph. */
export function caseGraph(snapshot: Snapshot, query = "", includeProposed = false) {
  const cases = snapshot.cases.filter((c) => !query || `${c.caseNumber} ${c.subject} ${snapshot.institutions.find((i) => i.id === c.institutionId)?.name ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const nodes = new Map<string, CaseGraphNode>(), edges: CaseGraphEdge[] = [], ids = new Set(cases.map((c) => c.id));
  for (const c of cases) {
    const key = "case:" + c.id;
    nodes.set(key, { id: key, kind: "CASE", label: `#${c.caseNumber} · ${c.subject}`, href: "/platform/cases/" + c.id });
    for (const [kind, id, label, relation] of [
      ["INSTITUTION", c.institutionId, snapshot.institutions.find((i) => i.id === c.institutionId)?.name, "SAME_INSTITUTION_CONTEXT"],
      ["BUREAU", c.bureauId, snapshot.bureaus.find((b) => b.id === c.bureauId)?.name, "LEAD_BUREAU"],
      ["OFFICER", c.officerId, c.officerId ? `Officer · ${c.officerId.slice(-8)}` : undefined, "ACCOUNTABLE_OFFICER"],
    ] as const) {
      if (!id || !label) continue;
      const target = kind.toLowerCase() + ":" + id;
      nodes.set(target, { id: target, kind, label }); edges.push({ id: key + ":" + target, source: key, target, type: relation, derived: true });
    }
  }
  for (const r of snapshot.relationships) if (ids.has(r.sourceId) && ids.has(r.targetId) && (r.status === "CONFIRMED" || includeProposed && r.status === "PROPOSED"))
    edges.push({ id: r.id, source: "case:" + r.sourceId, target: "case:" + r.targetId, type: r.type + (r.status === "PROPOSED" ? " · PROPOSED" : ""), derived: false });
  return { nodes: [...nodes.values()], edges };
}
