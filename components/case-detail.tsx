"use client";
import {ActionForm} from "./feedback";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCheck,
  Clock3,
  Download,
  FilePlus2,
  FileText,
  GitBranch,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "./symbols";
import {
  canApprove,
  canEdit,
  canViewEvidence,
  evaluateGate,
  humanize,
  taskStatuses,
} from "@/lib/domain";
import { bureaus, officers } from "@/lib/seed";
import type { CaseStatus, Evidence } from "@/lib/types";
import { useDemo } from "./provider";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CheckItem,
  Empty,
  Forbidden,
  Modal,
  PageHeader,
  Tabs,
  date,
  downloadText,
} from "./ui";
import { NewTaskButton } from "./forms";

type Action =
  | "transition"
  | "evidence"
  | "assign"
  | "transfer"
  | "contribution"
  | "communication";
export function CaseDetail({ id }: { id: string }) {
  const { cases, state, actor, tasks, findings, audit, run, notify } =
    useDemo();
  const [tab, setTab] = useState("Overview");
  const [action, setAction] = useState<Action | null>(null);
  const [target, setTarget] = useState<CaseStatus>("IN_PROGRESS");
  const [preview, setPreview] = useState<Evidence | null>(null);
  const [busy, setBusy] = useState(false);
  const c = cases.find((c) => c.id === id);
  if (!c)
    return (
      <Forbidden description="This case is unavailable or outside your authorized demo scope. No restricted case details are shown." />
    );
  const editable = canEdit(actor, c),
    approver = canApprove(actor, c),
    documents = canViewEvidence(actor, c);
  const caseTasks = tasks.filter((t) => t.caseId === c.id);
  const caseFindings = findings.filter((f) => f.caseIds.includes(c.id));
  const caseAudit = audit.filter((a) => a.target === c.id);
  const gate = evaluateGate(state, c);
  const next: Partial<Record<CaseStatus, CaseStatus>> = {
    REGISTERED: "TRIAGED",
    TRIAGED: "ASSIGNED",
    ASSIGNED: "IN_PROGRESS",
    IN_PROGRESS: "RESOLUTION_REVIEW",
    RESOLUTION_REVIEW: "DISPOSED",
    ON_HOLD: c.previousStatus ?? "IN_PROGRESS",
    DISPOSED: "REOPENED",
    REOPENED: "IN_PROGRESS",
  };
  function transition(status: CaseStatus) {
    setTarget(status);
    setAction("transition");
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!c) return;
    const f = new FormData(e.currentTarget);
    const why = String(f.get("reason") ?? "");
    let ok = false;
    if (action === "transition")
      ok = run(
        {
          type: "transition",
          caseId: c.id,
          status: target,
          reason: why,
          version: c.version,
          evaluation: target === "DISPOSED" ? gate : undefined,
        },
        `Case moved to ${humanize(target).toLowerCase()}`,
      );
    if (action === "assign")
      ok = run(
        {
          type: "assign",
          caseId: c.id,
          officer: String(f.get("officer")),
          reason: why,
        },
        "Accountable officer assigned",
      );
    if (action === "transfer")
      ok = run(
        {
          type: "request-transfer",
          caseId: c.id,
          to: String(f.get("to")),
          reason: why,
        },
        "Transfer requested for supervisor review",
      );
    if (action === "contribution" || action === "communication")
      ok = run(
        { type: action, caseId: c.id, reason: why },
        action === "contribution"
          ? "Bureau approval recorded"
          : "Final communication recorded",
      );
    if (action === "evidence") {
      const file = f.get("file") as File | null;
      if (!file || !file.size) {
        notify("Select a text evidence file.", true);
        return;
      }
      if (file.size > 30000 || !file.name.toLowerCase().endsWith(".txt")) {
        notify("The demo accepts .txt evidence up to 30 KB.", true);
        return;
      }
      setBusy(true);
      try {
        const body = await file.text();
        const hash = Array.from(
          new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(body),
            ),
          ),
        )
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        ok = run(
          {
            type: "evidence",
            caseId: c.id,
            name: file.name,
            body,
            hash,
            mandatory: f.get("mandatory") === "on",
          },
          "Evidence version saved locally; prior versions preserved",
        );
      } catch {
        notify("The evidence could not be read.", true);
      } finally {
        setBusy(false);
      }
    }
    if (ok) setAction(null);
  }
  return (
    <>
      <Link
        className="text-btn"
        href="/complaints"
        style={{ marginBottom: 18 }}
      >
        <ArrowLeft size={13} />
        Back to complaints
      </Link>
      <PageHeader
        title={c.subject}
        subtitle={`${c.id} · ${c.institution}`}
        eyebrow={`CASE WORKSPACE · REVIEW CYCLE ${c.cycle}`}
      >
        <NewTaskButton caseId={c.id} />
      </PageHeader>
      <div className="detail-tags">
        <Badge>{c.status}</Badge>
        <Badge>{c.priority}</Badge>
        <Badge tone="neutral">
          <Clock3 size={11} />
          Example SLA · {date(c.dueAt)}
        </Badge>
        <span className="fine-print">
          Version {c.version} · Updated {date(c.updatedAt)}
        </span>
      </div>
      <div className="detail-tabs">
        <Tabs
          options={[
            "Overview",
            "Evidence",
            "Work Items",
            "Intelligence",
            "Timeline",
            "Resolution",
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      <div className="detail-grid">
        <div>
          {tab === "Overview" && (
            <>
              <Card title="Case Overview">
                <p className="description">{c.description}</p>
                <dl className="metadata-list">
                  <div>
                    <dt>INSTITUTION</dt>
                    <dd>{c.institution}</dd>
                  </div>
                  <div>
                    <dt>CAMPUS / CITY</dt>
                    <dd>Main campus · {c.city}</dd>
                  </div>
                  <div>
                    <dt>CATEGORY</dt>
                    <dd>{c.category}</dd>
                  </div>
                  <div>
                    <dt>RECEIVED</dt>
                    <dd>
                      {date(c.receivedAt, {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt>LEAD BUREAU</dt>
                    <dd>{c.bureau}</dd>
                  </div>
                  <div>
                    <dt>PARTICIPATING BUREAUS</dt>
                    <dd>{c.participants.join(", ")}</dd>
                  </div>
                </dl>
                <div className="notice">
                  <ShieldCheck size={16} />
                  <p>
                    Fictional case. AI findings are advisory. Example deadlines
                    and synthetic policies do not establish official AICTE
                    requirements.
                  </p>
                </div>
              </Card>
              <Card title="Case Notes" action={<MessageSquare size={17} />}>
                {c.notes.map((n, i) => (
                  <div className="note-item" key={i}>
                    <span>
                      {n.actor} · {date(n.at)}
                    </span>
                    <p>{n.text}</p>
                  </div>
                ))}
                {!c.notes.length && (
                  <p className="description">
                    Keep the context together. Add a note for the next person
                    reviewing this case.
                  </p>
                )}
                <ActionForm
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const f = new FormData(form);
                    if (
                      run(
                        {
                          type: "note",
                          caseId: c.id,
                          text: String(f.get("note")),
                        },
                        "Note saved to the case timeline",
                      )
                    )
                      form.reset();
                  }}
                  className="form-stack"
                  style={{ marginTop: 18 }}
                >
                  <label>
                    Add an investigation note
                    <textarea
                      name="note"
                      required
                      minLength={3}
                      disabled={!editable}
                      placeholder="Record the source, context, and next step…"
                    />
                  </label>
                  <div style={{ textAlign: "right" }}>
                    <Button type="submit" kind="primary" disabled={!editable}>
                      Save Note
                    </Button>
                  </div>
                </ActionForm>
              </Card>
              <Card
                title="Linked Cases"
                action={
                  <Link className="text-btn" href="/dependencies">
                    Explore graph <ArrowUpRight size={12} />
                  </Link>
                }
              >
                {state.relationships
                  .filter((r) => r.source === c.id || r.target === c.id)
                  .filter((r) =>
                    cases.some(
                      (k) => k.id === (r.source === c.id ? r.target : r.source),
                    ),
                  )
                  .map((r) => {
                    const other = cases.find(
                      (k) => k.id === (r.source === c.id ? r.target : r.source),
                    )!;
                    return (
                      <div className="evidence-row" key={r.id}>
                        <GitBranch size={18} />
                        <div>
                          <Link href={`/complaints/${other.id}`}>
                            <h3>
                              {other.id} · {other.subject}
                            </h3>
                          </Link>
                          <p>
                            {humanize(r.type)} · {r.actor}
                          </p>
                        </div>
                        <Badge>{other.status}</Badge>
                      </div>
                    );
                  })}
                {!state.relationships.some(
                  (r) =>
                    (r.source === c.id || r.target === c.id) &&
                    cases.some(
                      (k) => k.id === (r.source === c.id ? r.target : r.source),
                    ),
                ) && (
                  <p className="description">
                    No authorized case relationships.
                  </p>
                )}
              </Card>
            </>
          )}
          {tab === "Evidence" && (
            <Card
              title="Evidence & Provenance"
              action={
                <Button
                  disabled={!editable || !documents || c.status === "DISPOSED"}
                  onClick={() => setAction("evidence")}
                >
                  <FilePlus2 size={14} />
                  Add Evidence
                </Button>
              }
            >
              <p className="description">
                Private local demo attachments. Text evidence is versioned and
                hashed; nothing is uploaded to Supabase.
              </p>
              {!documents && (
                <div className="notice warning">
                  Case details do not grant document access. Request a separate
                  DOCUMENTS scope in Cross-Bureau.
                </div>
              )}
              {(documents ? c.evidence : []).map((ev) => (
                <div className="evidence-row" key={ev.id}>
                  <span className="case-icon">
                    <FileText size={17} />
                  </span>
                  <div>
                    <h3>
                      {ev.name} <Badge tone="neutral">v{ev.version}</Badge>
                    </h3>
                    <p>
                      {ev.source} · {date(ev.at)} ·{" "}
                      {ev.mandatory
                        ? "Mandatory report"
                        : "Supporting evidence"}
                    </p>
                    <p>{ev.id}</p>
                  </div>
                  <Button onClick={() => setPreview(ev)}>Read Source</Button>
                </div>
              ))}
              {documents && !c.evidence.length && (
                <Empty
                  title="No evidence retained"
                  description="Add a text attachment to keep provenance and review context."
                />
              )}
            </Card>
          )}
          {tab === "Work Items" && (
            <Card
              title="Investigation Work"
              action={<NewTaskButton caseId={c.id} />}
            >
              {caseTasks.map((t) => (
                <div key={t.id} className="case-inline-work">
                  <Avatar id={t.assignee} small />
                  <div>
                    <h3>{t.title}</h3>
                    <p className="fine-print">
                      {t.id} · {t.bureau} · Due {date(t.dueAt)}
                    </p>
                  </div>
                  <Badge>{t.status}</Badge>
                  <select
                    aria-label={`Move ${t.title}`}
                    className="task-status-select"
                    value={t.status}
                    disabled={
                      !editable ||
                      c.status === "DISPOSED" ||
                      (actor.role === "Case Officer" && actor.id !== t.assignee)
                    }
                    onChange={(e) =>
                      run({
                        type: "move-task",
                        taskId: t.id,
                        status: e.target.value as typeof t.status,
                        version: t.version,
                      })
                    }
                  >
                    {taskStatuses.map((s, i) => (
                      <option
                        key={s}
                        disabled={
                          Math.abs(i - taskStatuses.indexOf(t.status)) > 1
                        }
                      >
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              {!caseTasks.length && <Empty title="No work items yet" />}
            </Card>
          )}
          {tab === "Intelligence" && (
            <Card title="Human-reviewed Intelligence">
              {caseFindings.map((f) => (
                <div className="finding-sources" key={f.id}>
                  <div className="finding-type">
                    <Sparkles size={14} />
                    {f.type}
                    <Badge>{f.state}</Badge>
                  </div>
                  <h3 style={{ marginTop: 12 }}>{f.title}</h3>
                  <p>{f.explanation}</p>
                  <Link
                    className="text-btn"
                    href="/intelligence"
                    style={{ marginTop: 12 }}
                  >
                    Review sources and finding <ArrowUpRight size={12} />
                  </Link>
                </div>
              ))}
              {!caseFindings.length && (
                <Empty title="No authorized findings for this case" />
              )}
            </Card>
          )}
          {tab === "Timeline" && (
            <Card title="Case Timeline">
              <p className="description">
                Retained decisions, sources, and accountable actors.
              </p>
              {caseAudit.map((e) => (
                <div className="timeline-item" key={e.id}>
                  <h3>{e.action}</h3>
                  <small>
                    {e.actor} ·{" "}
                    {date(e.at, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                  <p>{e.detail}</p>
                </div>
              ))}
              {!caseAudit.length && <Empty title="No recorded events" />}
            </Card>
          )}
          {tab === "Resolution" && (
            <Card
              title="Resolution Quality Gate"
              action={<Badge>{gate.result}</Badge>}
            >
              <p className="description">
                {gate.policy}. Evaluation recalculates from the current
                workspace; disposal revalidates every mandatory requirement.
              </p>
              {gate.items.map((item) => (
                <CheckItem
                  key={item.label}
                  pass={item.pass}
                  title={item.label}
                  detail={item.detail}
                />
              ))}
              <div className="finding-actions">
                <Link className="btn" href="/resolutions">
                  Open Resolution Center <ArrowUpRight size={14} />
                </Link>
                <Button
                  kind="primary"
                  disabled={!approver || gate.result !== "PASS"}
                  title={
                    !approver
                      ? "Closure requires a Bureau Head or Supervisor."
                      : gate.result !== "PASS"
                        ? "Complete every blocked requirement."
                        : undefined
                  }
                  onClick={() => transition("DISPOSED")}
                >
                  Approve Disposal
                </Button>
              </div>
            </Card>
          )}
        </div>
        <aside className="detail-sidebar">
          <Card title="Accountable Officer">
            <div
              className="profile-row"
              style={{ marginBottom: 12, paddingBottom: 15 }}
            >
              <Avatar id={c.officer} />
              <div>
                <strong>
                  {officers.find((o) => o.id === c.officer)?.name ??
                    "Awaiting assignment"}
                </strong>
                <p>{c.bureau} Bureau</p>
              </div>
            </div>
            <Button
              disabled={!approver || c.status === "DISPOSED"}
              onClick={() => setAction("assign")}
            >
              <UserRound size={14} />
              Assign Officer
            </Button>
            <Button
              disabled={!editable || c.status === "DISPOSED"}
              onClick={() => setAction("transfer")}
            >
              Request Transfer <ArrowUpRight size={13} />
            </Button>
          </Card>
          <Card title="Case Actions">
            <p>
              {editable
                ? "Every transition records a human reason and enforces the case lifecycle."
                : "Your perspective has read-only access to this case."}
            </p>
            {next[c.status] && (
              <Button
                kind="primary"
                disabled={
                  !editable ||
                  (["DISPOSED", "REOPENED"].includes(next[c.status]!) &&
                    !approver)
                }
                onClick={() => transition(next[c.status]!)}
              >
                {c.status === "ON_HOLD"
                  ? "Resume Investigation"
                  : c.status === "DISPOSED"
                    ? "Reopen with Reason"
                    : `Move to ${humanize(next[c.status]!)}`}
              </Button>
            )}
            {["IN_PROGRESS", "RESOLUTION_REVIEW"].includes(c.status) && (
              <Button
                disabled={!approver}
                title="Requires a Bureau Head or Supervisor. SLA keeps running."
                onClick={() => transition("ON_HOLD")}
              >
                Place on Hold
              </Button>
            )}
            {c.status === "RESOLUTION_REVIEW" && (
              <Button
                disabled={!editable}
                onClick={() => transition("IN_PROGRESS")}
              >
                Return for Investigation
              </Button>
            )}
          </Card>
          <Card title="Closure Requirements">
            <p>Address missing requirements, then evaluate the gate.</p>
            <Button
              disabled={
                !approver || c.contributionApproved || c.status === "DISPOSED"
              }
              onClick={() => setAction("contribution")}
            >
              <CheckCheck size={14} />
              {c.contributionApproved
                ? "Bureau Approved"
                : "Record Bureau Approval"}
            </Button>
            <Button
              disabled={
                !editable || c.communicationSent || c.status === "DISPOSED"
              }
              onClick={() => setAction("communication")}
            >
              <Check size={14} />
              {c.communicationSent
                ? "Communication Recorded"
                : "Record Communication"}
            </Button>
            <p className="fine-print" style={{ marginTop: 15 }}>
              Approval: scoped head or supervisor. SLA retained across holds and
              transfers.
            </p>
          </Card>
        </aside>
      </div>
      {action && (
        <Modal
          title={
            action === "transition"
              ? `Move to ${humanize(target)}`
              : action === "evidence"
                ? "Retain evidence version"
                : action === "assign"
                  ? "Assign accountable officer"
                  : action === "transfer"
                    ? "Request Bureau transfer"
                    : action === "contribution"
                      ? "Record Bureau approval"
                      : "Record final communication"
          }
          onClose={() => !busy && setAction(null)}
        >
          <ActionForm onSubmit={submit} className="form-stack">
            {action === "evidence" ? (
              <>
                <p className="dialog-description">
                  Demo supports .txt files up to 30 KB. Same-name uploads create
                  a new version. Content stays in this browser.
                </p>
                <label>
                  Evidence file
                  <input
                    name="file"
                    className="file-input"
                    type="file"
                    accept=".txt,text/plain"
                    required
                  />
                </label>
                <label className="checkbox-label">
                  <input name="mandatory" type="checkbox" />
                  This is the mandatory investigation report
                </label>
              </>
            ) : (
              <>
                {action === "assign" && (
                  <label>
                    Lead Bureau officer
                    <select name="officer" defaultValue={c.officer}>
                      {officers
                        .filter((o) => o.bureau === c.bureau)
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {action === "transfer" && (
                  <label>
                    Destination Bureau
                    <select name="to">
                      {bureaus
                        .filter((b) => b !== c.bureau)
                        .map((b) => (
                          <option key={b}>{b}</option>
                        ))}
                    </select>
                  </label>
                )}
                {action === "transition" && target === "DISPOSED" && (
                  <div className="notice warning">
                    <ShieldCheck size={17} />
                    <p>
                      This records a fictional human-approved disposition.
                      Current gate: {gate.result}. Mandatory requirements are
                      revalidated when you confirm.
                    </p>
                  </div>
                )}
                <label>
                  {action === "communication"
                    ? "Communication reference and confirmation"
                    : "Decision reason"}
                  <textarea
                    name="reason"
                    required
                    minLength={3}
                    placeholder={
                      action === "communication"
                        ? "Record the retained communication reference and recipient context…"
                        : "Explain the evidence and reason for this decision…"
                    }
                  />
                </label>
              </>
            )}
            <div className="dialog-actions">
              <Button disabled={busy} onClick={() => setAction(null)}>
                Cancel
              </Button>
              <Button kind="primary" type="submit" disabled={busy}>
                {busy ? "Retaining…" : "Confirm Action"}
              </Button>
            </div>
          </ActionForm>
        </Modal>
      )}
      {preview && documents && (
        <Modal title={preview.name} onClose={() => setPreview(null)} wide>
          <p className="evidence-meta">
            {preview.id} · Version {preview.version} · {preview.source}
            <br />
            Recorded{" "}
            {date(preview.at, {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            <br />
            Hash / seed marker: {preview.hash}
          </p>
          <div className="source-text evidence-body">{preview.body}</div>
          <div className="dialog-actions">
            <Button onClick={() => downloadText(preview.name, preview.body)}>
              <Download size={14} />
              Download Text
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
