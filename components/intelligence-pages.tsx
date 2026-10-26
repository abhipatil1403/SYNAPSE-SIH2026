"use client";
import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import {
  ArrowUpRight,
  Check,
  FileCheck2,
  GitBranch,
  Network,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { canApprove, canEdit, evaluateGate, humanize } from "@/lib/domain";
import { linkTypes, type Finding, type GateEvaluation } from "@/lib/types";
import { bureaus, officers } from "@/lib/seed";
import { useDemo } from "./provider";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CheckItem,
  Empty,
  Modal,
  PageHeader,
  Tabs,
  date,
} from "./ui";
import { LinkCaseButton } from "./forms";
import { AccessPanel } from "./access-panel";

export function Intelligence() {
  const { findings, cases, actor, run } = useDemo();
  const [filter, setFilter] = useState("All findings");
  const [type, setType] = useState("All types");
  const [review, setReview] = useState<{
    finding: Finding;
    decision: Finding["state"];
  } | null>(null);
  const filtered = findings.filter(
    (f) =>
      (filter === "All findings" ||
        (filter === "Pending review" &&
          ["Pending review", "Needs information"].includes(f.state)) ||
        (filter === "Reviewed" &&
          ["Confirmed", "Dismissed"].includes(f.state))) &&
      (type === "All types" || f.type === type),
  );
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!review) return;
    const f = new FormData(e.currentTarget);
    if (
      run(
        {
          type: "review-finding",
          findingId: review.finding.id,
          decision: review.decision,
          reason: String(f.get("reason")),
        },
        "Human finding review recorded; no automatic case decision",
      )
    )
      setReview(null);
  }
  return (
    <>
      <PageHeader
        title="AI Intelligence"
        subtitle="See the connections. Question the evidence. Keep people in control."
      >
        <Badge tone="green">
          <Sparkles size={12} />
          Simulated & explainable
        </Badge>
      </PageHeader>
      <div className="notice">
        <ShieldCheck size={18} />
        <p>
          All findings are deterministic fictional examples, with synthetic
          rules and source references. Confidence labels are uncalibrated. Only
          authorized humans make regulatory, relationship, or disposal
          decisions.
        </p>
      </div>
      <div className="toolbar">
        <Tabs
          options={["All findings", "Pending review", "Reviewed"]}
          value={filter}
          onChange={setFilter}
        />
        <select
          aria-label="Finding type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {[
            "All types",
            "Related cases",
            "Conflict Sentinel",
            "Evidence contradiction",
            "Triage insight",
          ].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <div className="findings-grid">
        {filtered.map((f) => {
          const editable = f.caseIds.every((id) =>
            cases.some((c) => c.id === id && canEdit(actor, c)),
          );
          const final = ["Confirmed", "Dismissed"].includes(f.state);
          return (
            <Card key={f.id} className="finding-card">
              <div className="finding-type">
                <Sparkles size={16} />
                {f.type}
                <Badge>{f.severity}</Badge>
              </div>
              <h2>{f.title}</h2>
              <p>{f.explanation}</p>
              <div className="finding-meta">
                <Badge>{f.state}</Badge>
                <Badge tone="neutral">{f.id}</Badge>
              </div>
              <div className="finding-cases">
                {f.caseIds.map((id) => (
                  <Link key={id} href={`/complaints/${id}`}>
                    {id}{" "}
                    <ArrowUpRight size={10} style={{ display: "inline" }} />
                  </Link>
                ))}
              </div>
              <div className="finding-sources">
                <strong>EVIDENCE & RULE PROVENANCE</strong>
                {f.sources.map((s, i) => (
                  <p key={s}>
                    <span style={{ color: "var(--green)" }}>0{i + 1}</span> ·{" "}
                    {s}
                  </p>
                ))}
              </div>
              <p className="fine-print">
                {f.confidence}
                <br />
                Version: {f.ruleVersion}
                <br />
                Generated: fictional precomputed seed · Uncertainty: source
                completeness and context require verification.
              </p>
              {f.reviewer && (
                <div className="finding-review">
                  <Badge>{f.state}</Badge>
                  <p style={{ marginTop: 8 }}>
                    {f.reviewer} · {f.reviewedAt && date(f.reviewedAt)}
                    <br />
                    {f.reason}
                  </p>
                </div>
              )}
              <div className="finding-actions">
                <Button
                  disabled={!editable || final}
                  kind="primary"
                  onClick={() =>
                    setReview({ finding: f, decision: "Confirmed" })
                  }
                >
                  <Check size={13} />
                  Confirm
                </Button>
                <Button
                  disabled={!editable || final}
                  onClick={() =>
                    setReview({ finding: f, decision: "Dismissed" })
                  }
                >
                  <X size={13} />
                  Dismiss
                </Button>
                <Button
                  disabled={!editable || final}
                  onClick={() =>
                    setReview({ finding: f, decision: "Needs information" })
                  }
                >
                  Investigate
                </Button>
              </div>
              {!editable && (
                <p className="read-only-chip">
                  Review requires action permission on every referenced case.
                </p>
              )}
            </Card>
          );
        })}
      </div>
      {!filtered.length && (
        <Card>
          <Empty
            title="No findings in this view"
            description="Try another review filter or authorized demo perspective."
          />
        </Card>
      )}
      {review && (
        <Modal
          title={`${review.decision === "Confirmed" ? "Confirm" : review.decision === "Dismissed" ? "Dismiss" : "Investigate"} finding`}
          onClose={() => setReview(null)}
        >
          <form onSubmit={submit} className="form-stack">
            <p className="dialog-description">
              {review.finding.title}. This records your review of an advisory
              finding. Confirm any case relationship separately in Dependency
              Explorer.
            </p>
            <label>
              Evidence-backed review reason
              <textarea name="reason" minLength={3} required />
            </label>
            <div className="dialog-actions">
              <Button onClick={() => setReview(null)}>Cancel</Button>
              <Button type="submit" kind="primary">
                Record Review
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export function Coordination() {
  const { state, cases, tasks, actor, run } = useDemo();
  const [decision, setDecision] = useState<{
    id: string;
    approve: boolean;
  } | null>(null);
  const multi = cases.filter((c) => c.participants.length > 1);
  const transfers = state.transfers.filter((t) =>
    cases.some((c) => c.id === t.caseId),
  );
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!decision) return;
    const f = new FormData(e.currentTarget);
    if (
      run(
        {
          type: "decide-transfer",
          transferId: decision.id,
          approve: decision.approve,
          reason: String(f.get("reason")),
        },
        "Transfer decision recorded; SLA retained",
      )
    )
      setDecision(null);
  }
  return (
    <>
      <PageHeader
        title="Cross-Bureau"
        subtitle="One case. Shared context. Clear accountability."
      >
        <Link href="/team" className="btn">
          Bureau Directory <ArrowUpRight size={15} />
        </Link>
      </PageHeader>
      <AccessPanel />
      <div className="coordination-layout">
        <div>
          <Card
            title="Connected Case Workspaces"
            action={
              <Badge tone="green">{multi.length} multi-Bureau cases</Badge>
            }
          >
            {multi.map((c) => (
              <div key={c.id}>
                <Link className="coord-case" href={`/complaints/${c.id}`}>
                  <span className="bureau-symbol">
                    <Network size={19} />
                  </span>
                  <div>
                    <h3>{c.subject}</h3>
                    <p>
                      {c.id} · Lead: {c.bureau} Bureau
                    </p>
                  </div>
                  <Badge>{c.status}</Badge>
                </Link>
                <div
                  className="metadata-list"
                  style={{ margin: "17px 0 25px" }}
                >
                  {c.participants.map((b) => (
                    <div key={b}>
                      <div className="eyebrow" style={{ fontSize: 8 }}>
                        {b} BUREAU
                      </div>
                      {tasks
                        .filter((t) => t.caseId === c.id && t.bureau === b)
                        .map((t) => (
                          <div className="case-inline-work" key={t.id}>
                            <Avatar id={t.assignee} small />
                            <div>
                              <h3>{t.title}</h3>
                              <p className="fine-print">{t.status}</p>
                            </div>
                          </div>
                        ))}
                      {!tasks.some(
                        (t) => t.caseId === c.id && t.bureau === b,
                      ) && (
                        <p className="fine-print">
                          Participation recorded; no active work item.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!multi.length && <Empty title="No multi-Bureau cases in scope" />}
          </Card>
          <Card
            title="Transfer Requests"
            action={
              <Badge tone="neutral">
                {transfers.filter((t) => t.status === "Requested").length}{" "}
                awaiting decision
              </Badge>
            }
          >
            {transfers.map((t) => (
              <div className="transfer-item" key={t.id}>
                <div className="card-head">
                  <Link href={`/complaints/${t.caseId}`}>
                    <h3>{t.caseId}</h3>
                  </Link>
                  <Badge>{t.status}</Badge>
                </div>
                <p>
                  <strong>{t.from}</strong> → <strong>{t.to}</strong>
                </p>
                <p>
                  {t.reason}
                  <br />
                  Requested by {t.actor}
                </p>
                {t.status === "Requested" && (
                  <div className="finding-actions">
                    <Button
                      kind="primary"
                      disabled={actor.role !== "Supervisor"}
                      onClick={() => setDecision({ id: t.id, approve: true })}
                    >
                      Approve Transfer
                    </Button>
                    <Button
                      disabled={actor.role !== "Supervisor"}
                      onClick={() => setDecision({ id: t.id, approve: false })}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {!transfers.length && (
              <Empty
                title="No pending handoffs"
                description="Request a transfer from an editable case. A cross-Bureau Supervisor records the decision."
              />
            )}
          </Card>
        </div>
        <aside>
          <Card title="Bureau Workload">
            {bureaus.map((b, i) => (
              <div className="bureau-row" key={b}>
                <span className={`bureau-symbol symbol-${i}`}>
                  <Network size={17} />
                </span>
                <div>
                  <strong>{b}</strong>
                  <p>
                    {
                      tasks.filter((t) => t.bureau === b && t.status !== "Done")
                        .length
                    }{" "}
                    open work items
                  </p>
                </div>
                <span style={{ marginLeft: "auto" }}>
                  <Avatar id={officers.find((o) => o.bureau === b)?.id} small />
                </span>
              </div>
            ))}
          </Card>
          <Card title="How coordination works">
            <div className="description">
              <p>
                One lead Bureau remains accountable. Participating Bureaus
                receive separate work items.
              </p>
              <p style={{ marginTop: 15 }}>
                Demo transfer approval is delegated to the Supervisor. The
                receiving officer remains unassigned until an authorized head
                assigns one.
              </p>
              <p style={{ marginTop: 15 }}>
                Case details and document access are separate scopes. Directory
                membership does not grant access.
              </p>
            </div>
            <Link className="btn full" href="/help">
              Read Coordination Guide <ArrowUpRight size={13} />
            </Link>
          </Card>
        </aside>
      </div>
      {decision && (
        <Modal
          title={
            decision.approve
              ? "Approve Bureau transfer"
              : "Reject Bureau transfer"
          }
          onClose={() => setDecision(null)}
        >
          <form className="form-stack" onSubmit={submit}>
            <p className="dialog-description">
              A single demo command records the decision and updates the lead
              Bureau. Existing history and the SLA deadline are retained.
            </p>
            <label>
              Decision reason
              <textarea name="reason" required minLength={3} />
            </label>
            <div className="dialog-actions">
              <Button onClick={() => setDecision(null)}>Cancel</Button>
              <Button kind="primary" type="submit">
                Record Decision
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export function Dependencies() {
  const { state, cases } = useDemo();
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("All relationships");
  const visibleIds = useMemo(() => new Set(cases.map((c) => c.id)), [cases]);
  const links = state.relationships.filter(
    (r) =>
      visibleIds.has(r.source) &&
      visibleIds.has(r.target) &&
      (filter === "All relationships" || r.type === filter),
  );
  const connectedIds = new Set(links.flatMap((r) => [r.source, r.target]));
  const graphCases = cases.filter((c) =>
    filter === "All relationships"
      ? connectedIds.has(c.id) || c.status === "RESOLUTION_REVIEW"
      : connectedIds.has(c.id),
  );
  const nodes: Node[] = graphCases.map((c, i) => ({
    id: c.id,
    position: { x: (i % 2) * 350 + 40, y: Math.floor(i / 2) * 180 + 40 },
    data: {
      label: (
        <div>
          <small style={{ color: "var(--green)", fontSize: 8 }}>{c.id}</small>
          <strong style={{ display: "block", marginTop: 5, fontSize: 11 }}>
            {c.subject}
          </strong>
          <span
            style={{
              display: "block",
              marginTop: 7,
              fontSize: 9,
              color: "var(--muted)",
            }}
          >
            {c.bureau} · {humanize(c.status)}
          </span>
        </div>
      ),
    },
    selected: c.id === selected,
  }));
  const edges: Edge[] = links.map((r) => ({
    id: r.id,
    source: r.source,
    target: r.target,
    label: r.type,
    style: {
      stroke: r.type === "DEPENDS_ON" ? "#ad6a3e" : "#1d7347",
      strokeWidth: 1.6,
      strokeDasharray: r.type === "RELATED_TO" ? "5 4" : undefined,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: r.type === "DEPENDS_ON" ? "#ad6a3e" : "#1d7347",
    },
    labelBgPadding: [6, 4],
    labelBgBorderRadius: 5,
  }));
  const c = cases.find((c) => c.id === selected);
  return (
    <>
      <PageHeader
        title="Dependency Explorer"
        subtitle="Follow the relationships. Understand what’s holding progress back."
      >
        <LinkCaseButton />
      </PageHeader>
      <div className="toolbar">
        <select
          aria-label="Relationship type"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {["All relationships", ...linkTypes].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <span className="fine-print">
          {nodes.length} authorized nodes · {edges.length} confirmed links
        </span>
      </div>
      <div className="graph-layout">
        <div>
          <div className="graph-canvas" aria-label="Case relationship graph">
            <ReactFlow
              key={filter}
              nodes={nodes}
              edges={edges}
              fitView
              fitViewOptions={{ padding: 0.25 }}
              nodesDraggable={false}
              nodesConnectable={false}
              onNodeClick={(_, node) => setSelected(node.id)}
              onPaneClick={() => setSelected(null)}
              minZoom={0.3}
              maxZoom={1.6}
            >
              <Background gap={20} size={1} color="#d8e2da" />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                nodeColor="#c0e2d0"
                style={{ height: 75, width: 110 }}
              />
            </ReactFlow>
          </div>
          <div className="graph-legend">
            <span>
              <i />
              Confirmed relationship
            </span>
            <span>
              <i style={{ background: "#ad6a3e" }} />
              Directed dependency
            </span>
            <span>Cycles rejected · No automatic merging</span>
          </div>
          <div className="toolbar" style={{ marginTop: 18 }}>
            <label>
              Keyboard node selection
              <select
                aria-label="Select graph case"
                value={selected ?? ""}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Choose a case</option>
                {graphCases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} · {c.subject}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <Card title={c ? "Selected Case" : "Explore a Connection"}>
          {c ? (
            <>
              <h3 style={{ marginTop: 20, lineHeight: 1.8 }}>{c.subject}</h3>
              <p className="description">
                {c.id}
                <br />
                {c.institution}
              </p>
              <Badge>{c.status}</Badge>
              <p className="description">Lead: {c.bureau} Bureau</p>
              {links
                .filter((r) => r.source === c.id || r.target === c.id)
                .map((r) => (
                  <div className="finding-sources" key={r.id}>
                    <strong>{r.type}</strong>
                    <p>
                      {r.source} → {r.target}
                    </p>
                    <p>{r.rationale}</p>
                    <p>
                      Confirmed by {r.actor} · {date(r.at)}
                    </p>
                  </div>
                ))}
              <Link className="btn primary full" href={`/complaints/${c.id}`}>
                Open Case <ArrowUpRight size={13} />
              </Link>
            </>
          ) : (
            <>
              <GitBranch
                size={30}
                color="var(--green)"
                style={{ marginTop: 25 }}
              />
              <p className="description">
                Select a case to inspect its linked records, blockers, and
                human-confirmed rationale.
              </p>
              <p className="fine-print">
                Only nodes whose details are authorized for this demo
                perspective are included. Use the selector below the graph as a
                keyboard alternative.
              </p>
            </>
          )}
        </Card>
      </div>
    </>
  );
}

export function Resolutions() {
  const { state, cases, actor, run } = useDemo();
  const [evaluations, setEvaluations] = useState<
    Record<string, GateEvaluation>
  >({});
  const [approve, setApprove] = useState<string | null>(null);
  const queue = cases.filter((c) => c.status === "RESOLUTION_REVIEW");
  const c = cases.find((c) => c.id === approve);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!c) return;
    const f = new FormData(e.currentTarget);
    if (
      run(
        {
          type: "transition",
          caseId: c.id,
          status: "DISPOSED",
          reason: String(f.get("reason")),
          version: c.version,
          evaluation: evaluations[c.id],
        },
        "Human-approved disposition recorded",
      )
    )
      setApprove(null);
  }
  return (
    <>
      <PageHeader
        title="Resolution Center"
        subtitle="Resolution is more than a status. Make every decision evidence-backed."
      >
        <Badge tone="green">
          <ShieldCheck size={12} />
          Human authority required
        </Badge>
      </PageHeader>
      <div className="notice">
        <FileCheck2 size={18} />
        <p>
          Each disposal rechecks the current case, mandatory evidence, completed
          work, dependencies, Bureau approval, communication, and authority. A
          changed workspace invalidates earlier evaluations.
        </p>
      </div>
      {queue.map((c) => {
        const gate = evaluateGate(state, c);
        const evaluation = evaluations[c.id];
        const fresh =
          evaluation?.revision === state.revision &&
          evaluation.caseVersion === c.version;
        const allowed = canApprove(actor, c);
        return (
          <Card className="gate-card" key={c.id}>
            <div className="gate-heading">
              <div>
                <Link href={`/complaints/${c.id}`}>
                  <h2>
                    {c.subject}{" "}
                    <ArrowUpRight size={14} style={{ display: "inline" }} />
                  </h2>
                </Link>
                <p>
                  {c.id} · {c.institution} · Lead: {c.bureau}
                </p>
              </div>
              <Badge>{gate.result}</Badge>
            </div>
            <div className="gate-content">
              <div>
                {gate.items.map((item) => (
                  <CheckItem
                    key={item.label}
                    pass={item.pass}
                    title={item.label}
                    detail={item.detail}
                  />
                ))}
              </div>
              <div className="gate-summary">
                <ShieldCheck size={27} />
                <h3>
                  {gate.result === "PASS"
                    ? "Ready for human review"
                    : "A few things need attention"}
                </h3>
                <p>
                  {gate.items.filter((i) => i.pass).length} of{" "}
                  {gate.items.length} requirements satisfied.
                  <br />
                  {gate.policy}
                </p>
                <p>
                  {fresh
                    ? `Current evaluation · Case v${c.version} · Revision ${state.revision}`
                    : evaluation
                      ? "Workspace changed. Re-evaluate before approval."
                      : "Run a current evaluation before approval."}
                </p>
                <Button
                  onClick={() =>
                    setEvaluations((v) => ({
                      ...v,
                      [c.id]: evaluateGate(state, c),
                    }))
                  }
                >
                  Evaluate Quality Gate
                </Button>
                <Button
                  kind="primary"
                  disabled={!allowed || !fresh || gate.result !== "PASS"}
                  title={
                    !allowed
                      ? "Only a scoped Bureau Head or Supervisor may dispose cases."
                      : !fresh
                        ? "Run a current Quality Gate evaluation."
                        : gate.result !== "PASS"
                          ? "Mandatory requirements remain blocked."
                          : undefined
                  }
                  onClick={() => setApprove(c.id)}
                >
                  Approve Disposal
                </Button>
                <Link className="btn" href={`/complaints/${c.id}`}>
                  Address Requirements <ArrowUpRight size={13} />
                </Link>
              </div>
            </div>
          </Card>
        );
      })}
      {!queue.length && (
        <Card>
          <Empty
            title="No cases awaiting resolution"
            description="Cases appear here after investigation work is complete and resolution review is requested."
          />
        </Card>
      )}
      {approve && c && (
        <Modal title="Approve case disposal" onClose={() => setApprove(null)}>
          <form className="form-stack" onSubmit={submit}>
            <div className="notice warning">
              <ShieldCheck size={17} />
              <p>
                This is a human-controlled fictional disposition of {c.id}. The
                gate is revalidated on confirmation; history is preserved.
              </p>
            </div>
            <label>
              Disposition reason and evidence reference
              <textarea name="reason" required minLength={3} />
            </label>
            <div className="dialog-actions">
              <Button onClick={() => setApprove(null)}>Cancel</Button>
              <Button type="submit" kind="primary">
                Confirm Disposal
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
