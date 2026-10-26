"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ReactFlow, Background, Controls, MiniMap, MarkerType } from "@xyflow/react";
import { caseGraph } from "@/lib/platform/graph";
import { allowedTransitions } from "@/lib/platform/lifecycle";
import type { Snapshot, Command, PlatformCase } from "@/lib/platform/contracts";
import { liveStatusLabels } from "@/lib/live/contracts";
export function PlatformGraph({ snapshot }: { snapshot: Snapshot }) {
  const [query, setQuery] = useState(""), [proposed, setProposed] = useState(false), [selected, setSelected] = useState<string | null>(null);
  const graph = useMemo(() => caseGraph(snapshot, query, proposed), [snapshot, query, proposed]);
  const nodes = useMemo(() => graph.nodes.map((n, i) => ({ id: n.id, data: { label: n.label }, position: { x: n.kind === "CASE" ? 0 : n.kind === "INSTITUTION" ? 450 : 850, y: i * 115 },
    style: { borderRadius: 16, background: n.kind === "CASE" ? "#e0f0db" : "white", border: "1px solid #9ebaa5", width: 270, padding: 15 }, ariaLabel: n.kind + ": " + n.label })), [graph]);
  const edges = useMemo(() => graph.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.type.replaceAll("_", " "),
    markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: e.derived ? "#9ca99d" : "#235b43", strokeWidth: e.derived ? 1 : 2, strokeDasharray: e.derived ? "5 4" : undefined } })), [graph]);
  const detail = graph.nodes.find((n) => n.id === selected);
  return <section className="card"><h2>Authorized case relationship graph</h2><p>Dashed context edges come from institution and assignment fields. They never imply the same issue or a confirmed duplicate. Solid edges are persisted relationship records in the authorized snapshot.</p>
    <div className="platform-filters"><label>Filter graph<input value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null); }} /></label><label><input type="checkbox" checked={proposed} onChange={(e) => setProposed(e.target.checked)} /> Include proposed relationships</label></div>
    <div style={{ height: 520, width: "100%", border: "1px solid #e2e8df", borderRadius: 18 }}><ReactFlow nodes={nodes} edges={edges} fitView nodesConnectable={false} nodesDraggable={false} onNodeClick={(_, n) => setSelected(n.id)} proOptions={{ hideAttribution: false }}><Background /><Controls showInteractive={false} /><MiniMap pannable zoomable /></ReactFlow></div>
    {detail && <p role="status"><strong>{detail.kind} · {detail.label}</strong>{detail.href && <> · <Link href={detail.href}>Open authorized case</Link></>}</p>}
    {!nodes.length && <p>No authorized graph nodes match this filter.</p>}<p className="muted">Regulatory action/inspection nodes and policy conflict alerts require the reviewed action-record adapter. No inspection or conflict is invented.</p>
  </section>;
}
export function PlatformKanban({ snapshot, busy, send }: { snapshot: Snapshot; busy: boolean; send: (command: Command, key: string) => Promise<boolean> }) {
  return <section className="card"><h2>Authorized complaint workflow</h2><p>Raw database states are preserved. Actions require current server authority and expected row version. Disposal uses the separate Quality Gate; reopening needs a persisted review cycle.</p><div className="platform-kanban">{Object.entries(liveStatusLabels).map(([status, label]) => <section key={status} className="platform-kanban-column"><h3>{label}<span className="badge">{snapshot.cases.filter((c) => c.status === status).length}</span></h3>{snapshot.cases.filter((c) => c.status === status).map((c) => <WorkflowCase key={c.id} c={c} busy={busy} send={send} />)}</section>)}</div></section>;
}
function WorkflowCase({ c, busy, send }: { c: PlatformCase; busy: boolean; send: (command: Command, key: string) => Promise<boolean> }) {
  const [key, setKey] = useState(() => crypto.randomUUID());
  return <article><Link href={`/platform/cases/${c.id}`}><strong>#{c.caseNumber} · {c.subject}</strong></Link><p>{c.priority} · Version {c.version}</p>{allowedTransitions[c.status]?.length > 0 && <form className="form-stack" onChange={() => setKey(crypto.randomUUID())} onSubmit={async (e) => {
    e.preventDefault(); const fields = new FormData(e.currentTarget); if (await send({ type: "case.transition", caseId: c.id, expectedVersion: c.version, status: String(fields.get("status")) as Exclude<PlatformCase["status"], "DISPOSED">, reason: String(fields.get("reason")) }, key)) setKey(crypto.randomUUID());
  }}><label>Next state<select name="status">{allowedTransitions[c.status].map((status) => <option key={status} value={status}>{liveStatusLabels[status as PlatformCase["status"]]}</option>)}</select></label><label>Transition reason<input name="reason" required maxLength={1000} /></label><button className="btn" disabled={busy}>Apply transition</button></form>}</article>;
}
