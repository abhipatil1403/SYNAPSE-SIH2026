"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  GripVertical,
  Languages,
  Search,
} from "lucide-react";
import { canEdit, taskStatuses } from "@/lib/domain";
import { officers } from "@/lib/seed";
import {
  formatCalendarDay,
  isCalendarDay,
  selectCalendarEvents,
  shiftCalendarMonth,
} from "@/lib/calendar";
import { CalendarMonthGrid, useTodayKey } from "./calendar-view";
import type { TaskStatus } from "@/lib/types";
import { useDemo } from "./provider";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Empty,
  Forbidden,
  Modal,
  PageHeader,
  Tabs,
  csv,
  date,
  downloadText,
} from "./ui";
import { CreateCaseButton, NewTaskButton } from "./forms";

export function Complaints() {
  const { cases, run } = useDemo();
  const params = useSearchParams();
  const initial = params.get("status") ?? "all";
  const [tab, setTab] = useState(
    initial === "DISPOSED"
      ? "Resolved"
      : initial === "RESOLUTION_REVIEW"
        ? "Pending review"
        : initial === "active"
          ? "Active"
          : "All cases",
  );
  const [query, setQuery] = useState("");
  const [bureau, setBureau] = useState(params.get("bureau") ?? "All Bureaus");
  const [priority, setPriority] = useState("All priorities");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("Recent");
  const filtered = cases
    .filter(
      (c) =>
        (tab === "All cases" ||
          (tab === "Active" && c.status !== "DISPOSED") ||
          (tab === "Resolved" && c.status === "DISPOSED") ||
          (tab === "Pending review" && c.status === "RESOLUTION_REVIEW")) &&
        `${c.id} ${c.subject} ${c.institution} ${officers.find((o) => o.id === c.officer)?.name}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (bureau === "All Bureaus" || c.bureau === bureau) &&
        (priority === "All priorities" || c.priority === priority),
    )
    .sort((a, b) =>
      sort === "SLA deadline"
        ? a.dueAt.localeCompare(b.dueAt)
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 8));
  const currentPage = Math.min(page, pageCount);
  const paginated = filtered.slice((currentPage - 1) * 8, currentPage * 8);
  const exportRows = () => {
    if (
      run(
        { type: "export", caseIds: filtered.map((c) => c.id) },
        "Visible complaint metadata exported and audited",
      )
    )
      downloadText(
        "synapse-cases.csv",
        csv([
          [
            "ID",
            "Institution",
            "Subject",
            "Bureau",
            "Priority",
            "State",
            "Example SLA",
          ],
          ...filtered.map((c) => [
            c.id,
            c.institution,
            c.subject,
            c.bureau,
            c.priority,
            c.status,
            c.dueAt,
          ]),
        ]),
        "text/csv",
      );
  };
  return (
    <>
      <PageHeader
        title="Complaints"
        subtitle="One authoritative record. Every issue, owner, and next step."
      >
        <Button onClick={exportRows}>
          <ArrowDownToLine size={15} />
          Export CSV
        </Button>
        <CreateCaseButton />
      </PageHeader>
      <div className="toolbar">
        <Tabs
          options={["All cases", "Active", "Pending review", "Resolved"]}
          value={tab}
          onChange={(v) => {
            setTab(v);
            setPage(1);
          }}
        />
        <span className="muted fine-print">
          {filtered.length} authorized cases
        </span>
      </div>
      <div className="toolbar">
        <div className="search-input">
          <Search size={15} />
          <input
            aria-label="Search complaints"
            placeholder="Search cases or institutions…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="toolbar-group">
          <select
            aria-label="Filter by Bureau"
            value={bureau}
            onChange={(e) => {
              setBureau(e.target.value);
              setPage(1);
            }}
          >
            {["All Bureaus", ...new Set(cases.map((c) => c.bureau))].map(
              (b) => (
                <option key={b}>{b}</option>
              ),
            )}
          </select>
          <select
            aria-label="Filter by priority"
            value={priority}
            onChange={(e) => {
              setPriority(e.target.value);
              setPage(1);
            }}
          >
            {["All priorities", "High", "Medium", "Low"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <select
            aria-label="Sort complaints"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option>Recent</option>
            <option>SLA deadline</option>
          </select>
        </div>
      </div>
      <Card className="table-card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>CASE ID</th>
                <th>COMPLAINT / INSTITUTION</th>
                <th>LEAD BUREAU</th>
                <th>OFFICER</th>
                <th>PRIORITY</th>
                <th>STATE</th>
                <th>EXAMPLE SLA</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/complaints/${c.id}`}>{c.id}</Link>
                  </td>
                  <td className="subject-cell">
                    <Link href={`/complaints/${c.id}`}>
                      <strong>{c.subject}</strong>
                      <p>{c.institution}</p>
                    </Link>
                  </td>
                  <td>{c.bureau}</td>
                  <td>
                    <Avatar id={c.officer} small />
                  </td>
                  <td>
                    <Badge>{c.priority}</Badge>
                  </td>
                  <td>
                    <Badge>{c.status}</Badge>
                  </td>
                  <td>
                    <span
                      style={{
                        color:
                          c.status !== "DISPOSED" &&
                          new Date(c.dueAt) < new Date()
                            ? "var(--red)"
                            : undefined,
                      }}
                    >
                      {date(c.dueAt)}
                    </span>
                    <p>Updated {date(c.updatedAt)}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <Empty
            title="No matching complaints"
            description="Adjust the filters or switch to an authorized demo perspective."
          />
        )}
        <div className="table-summary">
          <span>
            {filtered.length
              ? `${(currentPage - 1) * 8 + 1}–${Math.min(currentPage * 8, filtered.length)} of ${filtered.length} complaints`
              : "0 complaints"}
          </span>
          <div className="pagination">
            <button
              aria-label="Previous page"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft size={13} />
            </button>
            {Array.from({ length: pageCount }, (_, i) => (
              <button
                key={i}
                aria-label={`Page ${i + 1}`}
                aria-current={currentPage === i + 1 ? "page" : undefined}
                className={currentPage === i + 1 ? "selected" : ""}
                onClick={() => setPage(i + 1)}
              >
                {i + 1}
              </button>
            ))}
            <button
              aria-label="Next page"
              disabled={currentPage === pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </Card>
    </>
  );
}

export function Tasks() {
  const { tasks, actor, cases, run } = useDemo();
  const [filter, setFilter] = useState("All work");
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const filtered = tasks.filter(
    (t) =>
      `${t.title} ${t.caseId}`.toLowerCase().includes(query.toLowerCase()) &&
      (filter === "All work" ||
        (filter === "My work" && t.assignee === actor.id) ||
        (filter === "High priority" && t.priority === "High") ||
        (filter === "Due this week" &&
          Date.parse(t.dueAt) >= now &&
          Date.parse(t.dueAt) <= now + 7 * 86400000)),
  );
  function move(taskId: string, status: TaskStatus) {
    const t = tasks.find((t) => t.id === taskId);
    if (t)
      run(
        { type: "move-task", taskId, status, version: t.version },
        `Work item moved to ${status.toLowerCase()}`,
      );
    setDragging(null);
  }
  return (
    <>
      <PageHeader
        title="My Work"
        subtitle="Small steps, shared purpose. Keep the important work moving."
      >
        <NewTaskButton />
      </PageHeader>
      <div className="toolbar">
        <Tabs
          options={["All work", "My work", "High priority", "Due this week"]}
          value={filter}
          onChange={setFilter}
        />
        <div className="search-input">
          <Search size={15} />
          <input
            aria-label="Search work items"
            placeholder="Search work items…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="kanban">
        {taskStatuses.map((status, col) => (
          <section
            key={status}
            className="kanban-column"
            aria-label={`${status} column`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragging) move(dragging, status);
            }}
          >
            <div className="column-head">
              <span
                className="status-dot"
                style={{
                  background: ["#8d9a92", "#1d7347", "#b0925f", "#5dbd8b"][col],
                }}
              />
              {status}
              <span className="count">
                {filtered.filter((t) => t.status === status).length}
              </span>
              <span className="muted" style={{ marginLeft: "auto" }}>
                <GripVertical size={15} />
              </span>
            </div>
            {filtered
              .filter((t) => t.status === status)
              .map((t) => {
                const c = cases.find((c) => c.id === t.caseId)!;
                const editable =
                  canEdit(actor, c) &&
                  c.status !== "DISPOSED" &&
                  (actor.role !== "Case Officer" || actor.id === t.assignee);
                return (
                  <article
                    key={t.id}
                    className="task-card"
                    draggable={editable}
                    onDragStart={() => setDragging(t.id)}
                    onDragEnd={() => setDragging(null)}
                  >
                    <div className="task-card-header">
                      <Badge tone={col === 2 ? "amber" : "green"}>
                        {t.category}
                      </Badge>
                      <Badge>{t.priority}</Badge>
                    </div>
                    <Link href={`/complaints/${t.caseId}`}>
                      <h3>{t.title}</h3>
                    </Link>
                    <Link
                      className="task-case"
                      href={`/complaints/${t.caseId}`}
                    >
                      {t.caseId}{" "}
                      <ArrowUpRight size={9} style={{ display: "inline" }} />
                    </Link>
                    <p>{t.bureau} Bureau</p>
                    <div
                      className="task-progress"
                      aria-label={`Stage ${col + 1} of 4`}
                    >
                      <span style={{ width: `${(col + 1) * 25}%` }} />
                    </div>
                    <div className="task-footer">
                      <Clock3 size={11} />
                      {date(t.dueAt)}
                      <Avatar id={t.assignee} small />
                      <select
                        aria-label={`Move ${t.title}`}
                        className="task-status-select"
                        disabled={!editable}
                        title={
                          !editable
                            ? "Read-only: requires assignment and an active case."
                            : "Keyboard alternative to dragging; one stage at a time."
                        }
                        value={status}
                        onChange={(e) =>
                          move(t.id, e.target.value as TaskStatus)
                        }
                      >
                        {taskStatuses.map((s, i) => (
                          <option key={s} disabled={Math.abs(i - col) > 1}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </article>
                );
              })}
            {!filtered.some((t) => t.status === status) && (
              <div className="empty" style={{ padding: "30px 5px" }}>
                <p>No work items</p>
              </div>
            )}
          </section>
        ))}
      </div>
      <p className="fine-print" style={{ marginTop: 17 }}>
        Drag between adjacent stages or use each card’s status selector. This
        board tracks work items; case disposal always requires a separate human
        approval.
      </p>
    </>
  );
}

export function Calendar() {
  const { cases, tasks } = useDemo();
  const localKey = useTodayKey();
  const params = useSearchParams();
  const requested = params.get("date");
  const initial = isCalendarDay(requested) ? requested : localKey;
  const [month, setMonth] = useState(initial.slice(0, 7));
  const [selected, setSelected] = useState(initial);
  const [filter, setFilter] = useState("All events");
  const monthYear = formatCalendarDay(`${month}-01`, {
    month: "long",
    year: "numeric",
  });
  const events = selectCalendarEvents(cases, tasks).filter(
    (event) => filter === "All events" || event.type === filter,
  );
  const selectedEvents = events.filter((event) => event.key === selected);
  const upcoming = events.filter((event) => event.key >= localKey).slice(0, 3);
  function shift(offset: number) {
    setMonth((current) => shiftCalendarMonth(current, offset));
  }
  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="A little foresight makes room for better decisions."
      >
        <Badge tone="green">Asia / Kolkata</Badge>
      </PageHeader>
      <div className="calendar-filter">
        <Tabs
          options={[
            "All events",
            "SLA deadlines",
            "Bureau reviews",
            "Follow-ups",
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>
      <div className="calendar-layout">
        <Card className="calendar-card">
          <div className="calendar-toolbar">
            <h2>{monthYear}</h2>
            <div className="calendar-controls">
              <Button
                onClick={() => {
                  setMonth(localKey.slice(0, 7));
                  setSelected(localKey);
                }}
              >
                Today
              </Button>
              <button
                className="icon-btn"
                aria-label="Previous month"
                onClick={() => shift(-1)}
              >
                <ChevronLeft size={15} />
              </button>
              <button
                className="icon-btn"
                aria-label="Next month"
                onClick={() => shift(1)}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
          <CalendarMonthGrid
            month={month}
            today={localKey}
            selected={selected}
            events={events}
            onSelect={setSelected}
            onMonthChange={setMonth}
          />
        </Card>
        <aside className="calendar-rail">
          <Card
            title={selected === localKey ? "Today’s Schedule" : "Selected Day"}
          >
            <p className="mini-date">
              {date(`${selected}T12:00:00+05:30`, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            {selectedEvents.map((e) => (
              <Link
                href={e.href}
                key={e.id}
                className="event-detail"
                style={{ display: "block" }}
              >
                <Badge>{e.type}</Badge>
                <h3 style={{ marginTop: 8 }}>{e.title}</h3>
                <p>
                  {e.bureau} Bureau · {e.caseId}
                </p>
                <span className="text-btn">
                  Open case <ArrowUpRight size={12} />
                </span>
              </Link>
            ))}
            {!selectedEvents.length && (
              <Empty
                title="A little breathing room"
                description="No events recorded for this date."
              />
            )}
          </Card>
          <Card title="Coming Up">
            {upcoming.map((e) => (
              <Link
                key={e.id}
                href={e.href}
                className="event-detail"
                style={{ display: "block" }}
              >
                <p>{date(`${e.key}T12:00:00+05:30`)}</p>
                <h3>{e.title}</h3>
                <p>{e.type}</p>
              </Link>
            ))}
            {!upcoming.length && (
              <p className="fine-print" style={{ marginTop: 15 }}>
                No upcoming events.
              </p>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}

export function Intake() {
  const { state, cases, actor, run } = useDemo();
  const [selected, setSelected] = useState(state.submissions[0]?.id);
  const [tab, setTab] = useState("Pending");
  const [query, setQuery] = useState("");
  const [translation, setTranslation] = useState(false);
  const [decision, setDecision] = useState<
    "Register" | "Associate" | "Reject" | null
  >(null);
  if (!["Supervisor", "Intake Officer"].includes(actor.role))
    return (
      <Forbidden description="Original intake communications are restricted to Intake Officers and Supervisors in this demonstration." />
    );
  const filtered = state.submissions.filter(
    (s) =>
      (tab === "All submissions" || s.state === "Draft") &&
      `${s.subject} ${s.institution}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const draft = filtered.find((d) => d.id === selected) ?? filtered[0];
  function decide(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!draft || !decision) return;
    const f = new FormData(e.currentTarget);
    if (
      run(
        {
          type: "decide-intake",
          submissionId: draft.id,
          decision,
          reason: String(f.get("reason")),
          caseId: String(f.get("caseId") ?? ""),
        },
        `Submission ${decision === "Register" ? "registered" : decision === "Associate" ? "associated" : "rejected"}`,
      )
    )
      setDecision(null);
  }
  return (
    <>
      <PageHeader
        title="Intake Queue"
        subtitle="Start with the source. Verify the context. Let a human decide."
      >
        <Badge tone="green">
          {state.submissions.filter((s) => s.state === "Draft").length} pending
          review
        </Badge>
      </PageHeader>
      <div className="toolbar">
        <Tabs
          options={["Pending", "All submissions"]}
          value={tab}
          onChange={setTab}
        />
        <div className="search-input">
          <Search size={15} />
          <input
            placeholder="Search submissions…"
            aria-label="Search intake"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="intake-layout">
        <div className="intake-list">
          {filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSelected(s.id);
                setTranslation(false);
              }}
              className={`intake-item ${draft?.id === s.id ? "selected" : ""}`}
            >
              <div className="intake-tags">
                <Badge tone="green">{s.language}</Badge>
                <small>{date(s.receivedAt)}</small>
              </div>
              <h3>{s.subject}</h3>
              <p>{s.institution}</p>
              <div className="intake-tags" style={{ marginTop: 12 }}>
                <small>{s.id}</small>
                <Badge>{s.state}</Badge>
              </div>
            </button>
          ))}
          {!filtered.length && <Empty title="Queue is clear" />}
        </div>
        {draft ? (
          <Card>
            <div className="card-head">
              <h2>{draft.subject}</h2>
              <Badge>{draft.state}</Badge>
            </div>
            <p className="fine-print">
              {draft.id} · {draft.messageId} · Original retained · Fictional
              mailbox fixture
            </p>
            <div className="toolbar" style={{ marginTop: 20 }}>
              <Badge tone="neutral">
                <Languages size={12} />
                {draft.language}
              </Badge>
              <Button onClick={() => setTranslation((v) => !v)}>
                {translation ? "View Original" : "View English Translation"}
              </Button>
            </div>
            <div className="source-text">
              <p
                lang={
                  translation
                    ? "en"
                    : draft.language === "Marathi"
                      ? "mr"
                      : draft.language === "Hindi"
                        ? "hi"
                        : "en"
                }
              >
                {translation ? draft.translation : draft.body}
              </p>
            </div>
            <div className="notice">
              <FileText size={17} />
              <p>
                {draft.attachment}. No live email ingestion or attachment
                download is implied.
              </p>
            </div>
            <form
              key={draft.id}
              className="extraction-row"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(
                  {
                    type: "verify-intake",
                    submissionId: draft.id,
                    institution: String(f.get("institution")),
                  },
                  "Extracted institution verified by a human",
                );
              }}
            >
              <label>
                Extracted institution ·{" "}
                {draft.verified ? "human verified" : "requires verification"}
                <input
                  name="institution"
                  defaultValue={draft.institution}
                  required
                  minLength={3}
                  disabled={draft.state !== "Draft"}
                />
              </label>
              <Button type="submit" disabled={draft.state !== "Draft"}>
                <Check size={14} />
                Verify
              </Button>
            </form>
            <div className="finding-sources">
              <strong>SIMULATED RELATED-CASE RECOMMENDATION</strong>
              <p>
                The institution also appears in an existing fictional
                submission. Sharing an institution does not establish
                duplication. Original source: {draft.messageId}. Rule: Demo
                matching v1.0; contextual match, uncalibrated.
              </p>
              {cases
                .filter((c) => c.institution === draft.institution)
                .slice(0, 2)
                .map((c) => (
                  <p key={c.id}>
                    <Link className="text-btn" href={`/complaints/${c.id}`}>
                      {c.id} · {c.subject} <ArrowUpRight size={12} />
                    </Link>
                  </p>
                ))}
              {actor.role === "Intake Officer" && (
                <p>
                  Related case details require a separate case-access grant.
                </p>
              )}
            </div>
            {draft.reason && (
              <p className="description">
                Review decision: {draft.reason}
                {draft.caseId && ` · ${draft.caseId}`}
              </p>
            )}
            <div className="finding-actions">
              <Button
                kind="primary"
                disabled={draft.state !== "Draft" || !draft.verified}
                title={
                  !draft.verified
                    ? "Verify the extracted institution first."
                    : undefined
                }
                onClick={() => setDecision("Register")}
              >
                Register New Case
              </Button>
              <Button
                disabled={
                  draft.state !== "Draft" || !draft.verified || !cases.length
                }
                title={
                  !cases.length
                    ? "Association requires case details access."
                    : undefined
                }
                onClick={() => setDecision("Associate")}
              >
                Associate Existing
              </Button>
              <Button
                kind="danger"
                disabled={draft.state !== "Draft"}
                onClick={() => setDecision("Reject")}
              >
                Reject with Reason
              </Button>
            </div>
          </Card>
        ) : (
          <Card>
            <Empty title="No submissions match" />
          </Card>
        )}
      </div>
      {decision && draft && (
        <Modal
          title={`${decision} submission`}
          onClose={() => setDecision(null)}
        >
          <form onSubmit={decide} className="form-stack">
            <p className="muted">
              This records a human decision on {draft.id}. Repeated registration
              will not create another case.
            </p>
            {decision === "Associate" && (
              <label>
                Authorized case
                <select name="caseId">
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id} · {c.subject}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Decision reason
              <textarea name="reason" required minLength={3} />
            </label>
            <div className="dialog-actions">
              <Button onClick={() => setDecision(null)}>Cancel</Button>
              <Button
                kind={decision === "Reject" ? "danger" : "primary"}
                type="submit"
              >
                Confirm {decision.toLowerCase()}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
