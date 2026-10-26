"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Network, ShieldCheck, RefreshCw, ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";
import { snapshotSchema, type Snapshot, type Command, type PlatformCase } from "@/lib/platform/contracts";
import { platformDashboard, platformCalendar, registry, authorizedReport } from "@/lib/platform/selectors";
import { calendarMonthDays, calendarDayKey, shiftCalendarMonth, formatCalendarDay } from "@/lib/calendar";
import { liveStatusLabels, livePriorityLabels } from "@/lib/live/contracts";

const sections = [["dashboard", "Overview"], ["cases", "Case registry"], ["intake", "Intake review"], ["tasks", "Work items"], ["calendar", "Calendar"], ["coordination", "Coordination"], ["intelligence", "Intelligence"], ["notifications", "Notifications"], ["reports", "Reports"]];
type Status = "loading" | "ready" | "locked" | "error";
export function PlatformWorkspace({ path }: { path: string[] }) {
  const section = path[0] ?? "dashboard", caseId = section === "cases" ? path[1] : undefined;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [status, setStatus] = useState<Status>("loading"), [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false), [q, setQ] = useState(""), [filter, setFilter] = useState(""), [page, setPage] = useState(1), [period, setPeriod] = useState(30);
  const [source, setSource] = useState("Authorized Supabase contract");
  const generation = useRef(0), active = useRef<AbortController | null>(null);
  const today = calendarDayKey(new Date()), [month, setMonth] = useState(today.slice(0, 7)), [day, setDay] = useState(today);
  const load = useCallback(async (signal?: AbortSignal) => {
    active.current?.abort();
    const controller = new AbortController(), requestGeneration = ++generation.current;
    active.current = controller;
    const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    try {
      const response = await fetch("/api/phase1/platform/snapshot", { cache: "no-store", signal: requestSignal });
      const body = await response.json();
      if (requestSignal.aborted || generation.current !== requestGeneration) return;
      if (!response.ok) {
        setSnapshot(null); setMessage(body?.error?.message ?? "The authorized service is unavailable.");
        setStatus(response.status === 503 && body?.error?.code === "platform_locked" ? "locked" : "error"); return;
      }
      setSnapshot(snapshotSchema.parse(body)); setSource(response.headers.get("X-Synapse-Data-Source") ?? "Authorized Supabase contract");
      setStatus("ready"); setMessage("");
    } catch {
      if (!requestSignal.aborted && generation.current === requestGeneration) { setSnapshot(null); setStatus("error"); setMessage("The protected data contract could not be verified. Retry when access is available."); }
    }
  }, []);
  useEffect(() => { const c = new AbortController(); queueMicrotask(() => { if (!c.signal.aborted) void load(c.signal); }); return () => { c.abort(); active.current?.abort(); }; }, [load]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 30000);
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("synapse-auth-session");
    if (channel) channel.onmessage = () => { active.current?.abort(); setSnapshot(null); setStatus("loading"); void load(); };
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); window.clearInterval(timer); channel?.close(); };
  }, [load]);
  const command = async (cmd: Command, key: string) => {
    setBusy(true); setMessage("");
    try {
      const r = await fetch("/api/phase1/platform/commands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: key, command: cmd }) });
      const body = await r.json();
      if (!r.ok) { setMessage(body?.error?.message ?? "The operation could not be committed."); return false; }
      await load(); return true;
    } catch { setMessage("The result could not be verified. Retry with the same request key to avoid duplication."); return false; }
    finally { setBusy(false); }
  };
  const dash = useMemo(() => snapshot ? platformDashboard(snapshot, snapshot.generatedAt, period) : null, [snapshot, period]);
  const list = snapshot ? registry(snapshot, { q, status: filter, page, pageSize: 10 }) : null;
  const events = snapshot ? platformCalendar(snapshot) : [];
  const selected = snapshot?.cases.find((c) => c.id === caseId);
  return <div className="platform-workspace">
    <header className="live-preview-topbar"><Link className="brand" href="/platform"><Network size={24} /> SYNAPSE</Link><span className="badge"><ShieldCheck size={14} /> Platform integration · gated</span><Link className="btn" href="/dashboard">Demo workspace</Link></header>
    <div className="platform-frame"><nav aria-label="Platform navigation">{sections.map(([id, label]) => <Link key={id} href={`/platform/${id}`} aria-current={section === id ? "page" : undefined}>{label}</Link>)}<Link href="/live-preview">Security checklist</Link></nav>
      <main><div className="platform-heading"><div><p className="eyebrow">{status === "ready" ? source : "SECURITY PREREQUISITES REQUIRED"}</p><h1>{caseId ? "Case workspace" : sections.find(([id]) => id === section)?.[1] ?? "Platform"}</h1></div><button className="btn" onClick={() => void load()} disabled={busy}><RefreshCw size={16} /> Refresh data</button></div>
        {message && <p className="platform-notice" role="alert">{message}</p>}
        {status === "loading" && <div className="card platform-state" role="status">Loading authorized platform data…</div>}
        {status === "locked" && <section className="card platform-state"><LockKeyhole size={32} /><h2>Platform activation is blocked</h2><p>Live Mode, persistent preview and business writes remain disabled. No fictional data is substituted here.</p><Link className="btn primary" href="/dashboard">Open working Demo Mode</Link></section>}
        {status === "error" && <section className="card platform-state"><h2>Authorized data unavailable</h2><p>Sign in with an approved account or retry after the security prerequisites pass.</p><button className="btn" onClick={() => void load()}>Retry</button></section>}
        {snapshot && status === "ready" && <>
          {section === "dashboard" && dash && <><div className="platform-kpis">{[["Total Complaints", dash.total], ["Resolved Cases", dash.resolved], ["Active Cases", dash.active], ["Pending Review", dash.pendingReview]].map(([label, value]) => <article className="card" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
            <div className="platform-grid"><section className="card"><div className="card-head"><h2>Complaint Analytics</h2><select aria-label="Analytics period" value={period} onChange={(e) => setPeriod(Number(e.target.value))}>{[7, 30, 90].map((n) => <option key={n} value={n}>{n} days</option>)}</select></div><div className="platform-bars" role="img" aria-label="Authorized registrations and resolutions by period">{dash.analytics.map((b) => { const max = Math.max(1, ...dash.analytics.flatMap((x) => [x.received, x.resolved])); return <div key={b.start}><div className="platform-bar-pair"><i style={{ height: `${b.received / max * 100}%` }} title={`${b.received} registered`} /><i style={{ height: `${b.resolved / max * 100}%` }} title={`${b.resolved} resolved`} /></div><span>{b.received} / {b.resolved}</span><small>{b.start.slice(5)}</small></div>; })}</div><p className="muted">Registered / resolved · accurate zero baseline</p></section>
              <section className="card"><h2>Resolution Progress</h2><div className="platform-gauge" style={{ background: `conic-gradient(var(--green) ${dash.resolutionPercent}%, #dfeae3 0)` }}><strong>{dash.resolutionPercent}%</strong></div><p>{dash.resolved} resolved of {dash.total} authorized cases</p></section>
              <section className="card"><h2>Bureau Coordination</h2>{dash.bureaus.map((b) => <div className="platform-row" key={b.id}><strong>{b.name}</strong><span>{b.cases} cases · {b.tasks} active tasks</span></div>)}</section>
              <section className="card"><h2>Upcoming SLA Deadlines</h2><EventList events={dash.deadlines} /><Link className="btn" href="/platform/calendar">Open Full Calendar</Link></section>
              <section className="card"><h2>Recent Cases</h2><CaseTable cases={dash.recentCases} /></section>
              <section className="card"><h2>AI Findings</h2>{dash.findings.length ? dash.findings.map((f) => <p key={f.id}>{f.title} · {f.status}</p>) : <p className="muted">No authorized findings. No scan completion is inferred.</p>}</section>
              <section className="card"><h2>Recent Activity</h2>{dash.activity.map((a) => <div className="platform-row" key={a.id}><span>{a.type}</span><time>{new Date(a.at).toLocaleString("en-IN")}</time></div>)}{!dash.activity.length && <p>No authorized activity.</p>}</section>
              <section className="card"><h2>Overview Calendar</h2><Month month={month} day={day} events={events} onMonth={setMonth} onDay={setDay} today={today} /><EventList events={events.filter((e) => e.day === day)} /><Link className="btn" href="/platform/calendar">Open Full Calendar</Link></section>
            </div></>}
          {section === "cases" && !caseId && <section className="card"><div className="platform-filters"><label>Search cases<input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label><label>Status<select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}><option value="">All states</option>{Object.entries(liveStatusLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div><CaseTable cases={list!.items} /><div className="platform-row"><button className="btn" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>{list!.total} authorized cases · Page {page}</span><button className="btn" disabled={page * 10 >= list!.total} onClick={() => setPage(page + 1)}>Next</button></div></section>}
          {section === "cases" && caseId && (!selected ? <section className="card"><h2>Case unavailable</h2><p>No authorized case matches this link.</p></section> : <><section className="card"><p className="eyebrow">#{selected.caseNumber} · {liveStatusLabels[selected.status]}</p><h2>{selected.subject}</h2><p>{selected.summary}</p><p>Priority: {livePriorityLabels[selected.priority]} · Version {selected.version}</p><p>Original received: {selected.receivedAt}</p><CommandForm label="Add accountable comment" busy={busy} send={command} build={(value) => ({ type: "comment.add", caseId: selected.id, expectedVersion: selected.version, body: value })} /><CommandForm label="Set priority (LOW, NORMAL, HIGH, URGENT)" busy={busy} send={command} build={(value) => ({ type: "case.priority", caseId: selected.id, expectedVersion: selected.version, priority: value as PlatformCase["priority"], reason: "Explicit priority review" })} /></section>
            <div className="platform-grid"><section className="card"><h2>Comments & activity</h2>{snapshot.comments.filter((c) => c.caseId === selected.id).map((c) => <p key={c.id}>{c.body}</p>)}{snapshot.activity.filter((a) => a.caseId === selected.id).map((a) => <p key={a.id}>{a.type} · {a.reason}</p>)}</section><section className="card"><h2>Evidence</h2>{snapshot.evidence.filter((e) => e.caseId === selected.id).map((e) => <p key={e.id}>{e.name} · version {e.number} · {e.scan}</p>)}<p>Private upload/download requires approved storage policies and a trusted scan worker.</p><button className="btn" disabled title="Live evidence writes are disabled">Upload evidence</button></section><section className="card"><h2>Tasks & SLA</h2>{snapshot.tasks.filter((t) => t.caseId === selected.id).map((t) => <p key={t.id}>{t.title} · {t.status}</p>)}{snapshot.sla.filter((s) => s.caseId === selected.id).map((s) => <p key={s.id}>Due {s.dueAt} · {s.status}</p>)}</section><section className="card"><h2>Dependencies & resolution</h2>{snapshot.relationships.filter((r) => r.sourceId === selected.id || r.targetId === selected.id).map((r) => <p key={r.id}><Link href={`/platform/cases/${r.sourceId === selected.id ? r.targetId : r.sourceId}`}>{r.type} · {r.status}</Link></p>)}<p>Disposal requires a current policy, complete evidence, tasks, dependency decisions and an authorized fresh evaluation.</p><button className="btn" disabled>Evaluate closure · approval required</button></section></div></>)}
          {section === "calendar" && <section className="card"><Month month={month} day={day} events={events} onMonth={setMonth} onDay={setDay} today={today} /><h2>{formatCalendarDay(day, { dateStyle: "long" })}</h2><EventList events={events.filter((e) => e.day === day)} /></section>}
          {section === "tasks" && <section className="card"><h2>Authorized work items</h2>{snapshot.tasks.map((t) => <div className="platform-row" key={t.id}><Link href={`/platform/cases/${t.caseId}`}>{t.title}</Link><span>{t.status} · {t.dueAt ?? "No deadline configured"}</span></div>)}{!snapshot.tasks.length && <p>No assigned work items.</p>}</section>}
          {section === "intake" && <IntakePanel snapshot={snapshot} busy={busy} send={command} />}
          {section === "coordination" && <div className="platform-grid"><section className="card"><h2>Access requests</h2>{snapshot.accessRequests.map((r) => <p key={r.id}>{r.scope} · {r.status} · {r.reason}</p>)}{!snapshot.accessRequests.length && <p>No authorized access requests.</p>}</section><section className="card"><h2>Transfers</h2>{snapshot.transfers.map((t) => <p key={t.id}>{t.status} · {t.reason}</p>)}{!snapshot.transfers.length && <p>No authorized transfers.</p>}</section><section className="card"><h2>Case relationships</h2>{snapshot.relationships.map((r) => <p key={r.id}><Link href={`/platform/cases/${r.sourceId}`}>{r.type} · {r.status}</Link></p>)}</section></div>}
          {section === "intelligence" && <section className="card"><h2>Provenance and human review</h2>{snapshot.findings.map((f) => <article key={f.id}><h3>{f.title}</h3><p>{f.explanation}</p><p>{f.kind} · {f.status} · Rule {f.ruleVersion}</p><p>{f.sourceVersionIds.length} authorized source versions</p></article>)}{!snapshot.findings.length && <p>No authorized findings. Rule-based candidate generation requires sourced records and approved policy versions.</p>}<p className="muted">Model extraction and external AI services are not configured. Human review never merges or disposes a case automatically.</p></section>}
          {section === "notifications" && <section className="card">{snapshot.notifications.map((n) => <div className="platform-row" key={n.id}><span>{n.title}</span><button className="btn" disabled={busy || !!n.readAt} onClick={() => void command({ type: "notification.read", notificationId: n.id }, crypto.randomUUID())}>{n.readAt ? "Read" : "Mark read"}</button></div>)}{!snapshot.notifications.length && <p>No authorized notifications.</p>}</section>}
          {section === "reports" && <section className="card"><h2>Authorized workload report</h2><p>{authorizedReport(snapshot).total} cases · generated {snapshot.generatedAt}</p>{authorizedReport(snapshot).workload.map((b) => <div className="platform-row" key={b.bureau}><strong>{b.bureau}</strong><span>{b.total}</span></div>)}<CaseTable cases={snapshot.cases} /></section>}
        </>}
      </main></div></div>;
}
function CaseTable({ cases }: { cases: PlatformCase[] }) {
  return <div className="platform-table"><table><thead><tr><th>Case</th><th>Status</th><th>Priority</th><th>Received</th></tr></thead><tbody>{cases.map((c) => <tr key={c.id}><td><Link href={`/platform/cases/${c.id}`}><strong>{c.subject}</strong></Link><small>#{c.caseNumber}</small></td><td>{liveStatusLabels[c.status]}</td><td><span className="badge">{livePriorityLabels[c.priority]}</span></td><td>{new Date(c.receivedAt).toLocaleDateString("en-IN")}</td></tr>)}</tbody></table>{!cases.length && <p>No authorized cases match these filters.</p>}</div>;
}
function EventList({ events }: { events: { id: string; at: string; title: string; href: string }[] }) {
  return <div>{events.map((e) => <div className="platform-row" key={e.id}><Link href={e.href}>{e.title}</Link><time>{new Date(e.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</time></div>)}{!events.length && <p className="muted">No authorized events for this selection.</p>}</div>;
}
function Month({ month, day, today, events, onMonth, onDay }: { month: string; day: string; today: string; events: { day: string }[]; onMonth: (s: string) => void; onDay: (s: string) => void }) {
  return <div className="platform-calendar"><div className="card-head"><button className="btn" aria-label="Previous month" onClick={() => onMonth(shiftCalendarMonth(month, -1))}><ArrowLeft size={16} /></button><strong>{month}</strong><button className="btn" onClick={() => { onMonth(today.slice(0, 7)); onDay(today); }}>Today</button><button className="btn" aria-label="Next month" onClick={() => onMonth(shiftCalendarMonth(month, 1))}><ArrowRight size={16} /></button></div><div className="platform-days">{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}{calendarMonthDays(month).map((d) => <button key={d.key} className={`${d.outside ? "outside" : ""} ${d.key === today ? "today" : ""}`} aria-label={d.key} aria-pressed={d.key === day} onClick={() => onDay(d.key)}>{d.day}{events.some((e) => e.day === d.key) && <i />}</button>)}</div></div>;
}
function CommandForm({ label, busy, build, send }: { label: string; busy: boolean; build: (value: string) => Command; send: (c: Command, key: string) => Promise<boolean> }) {
  const [value, setValue] = useState(""), [key, setKey] = useState(() => crypto.randomUUID());
  return <form className="platform-command" onSubmit={async (e) => { e.preventDefault(); if (await send(build(value), key)) { setValue(""); setKey(crypto.randomUUID()); } }}><label>{label}<input required value={value} maxLength={4000} onChange={(e) => { setValue(e.target.value); setKey(crypto.randomUUID()); }} /></label><button className="btn primary" disabled={busy}>{busy ? "Saving…" : "Submit"}</button></form>;
}
function IntakePanel({ snapshot: s, busy, send }: { snapshot: Snapshot; busy: boolean; send: (c: Command, key: string) => Promise<boolean> }) {
  const [selected, setSelected] = useState(""), [institution, setInstitution] = useState(""), [officer, setOfficer] = useState(""), [category, setCategory] = useState("");
  const [captureKey, setCaptureKey] = useState(() => crypto.randomUUID());
  const draft = s.drafts.find((d) => d.id === selected), pending = draft && ["DRAFT", "UNDER_REVIEW"].includes(draft.state);
  const officers = [...new Set(s.cases.map((c) => c.officerId).filter((id): id is string => !!id))];
  return <div className="platform-grid"><section className="card"><h2>Capture original complaint</h2><p>Source text is preserved. No translated or matched output is invented.</p><form className="form-stack" onChange={() => setCaptureKey(crypto.randomUUID())} onSubmit={async (e) => {
    e.preventDefault(); const form = e.currentTarget, data = new FormData(form);
    if (await send({ type: "draft.create", source: "MANUAL", sourceReference: String(data.get("sourceReference")), subject: String(data.get("subject")), body: String(data.get("body")),
      language: data.get("language") as "en" | "hi" | "mr", bureauId: String(data.get("bureau")), institutionId: null }, captureKey)) { form.reset(); setCaptureKey(crypto.randomUUID()); }
  }}><label>Source reference<input name="sourceReference" required maxLength={200} /></label><label>Original subject<input name="subject" required maxLength={500} /></label><label>Original complaint<textarea name="body" required maxLength={4000} /></label><label>Language<select name="language"><option value="en">English</option><option value="hi">Hindi</option><option value="mr">Marathi</option></select></label><label>Review Bureau<select name="bureau" required><option value="">Select an authorized Bureau</option>{s.bureaus.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><button className="btn primary" disabled={busy || !s.bureaus.length}>Save draft</button></form></section>
    <section className="card"><h2>Human verification</h2><label>Draft<select value={selected} onChange={(e) => setSelected(e.target.value)}><option value="">Select a draft</option>{s.drafts.map((d) => <option key={d.id} value={d.id}>{d.subject} · {d.state}</option>)}</select></label>
      {draft ? <><p>{draft.body}</p><p>{draft.language} · version {draft.version} · {draft.verified ? "Verified" : "Verification required"}</p><label>Verified institution<select value={institution} onChange={(e) => setInstitution(e.target.value)}><option value="">Select a verified institution</option>{s.institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label><button className="btn" disabled={busy || !pending || !institution} onClick={() => void send({ type: "draft.verify", draftId: draft.id, expectedVersion: draft.version, institutionId: institution, reason: "Human confirmed institution against original complaint" }, crypto.randomUUID())}>Confirm verification</button>
        <label>Accountable officer<select value={officer} onChange={(e) => setOfficer(e.target.value)}><option value="">Select a known authorized officer</option>{officers.map((id) => <option key={id} value={id}>Officer {id.slice(0, 8)}</option>)}</select></label><label>Case category<select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Select an existing category</option>{s.categories.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></label><button className="btn primary" disabled={busy || !pending || !draft.verified || !officer || !category} onClick={() => void send({ type: "draft.register", draftId: draft.id, expectedVersion: draft.version, categoryId: category, officerId: officer, priority: "NORMAL" }, crypto.randomUUID())}>Register verified complaint</button>
        <h3>Duplicate candidate review</h3>{s.matches.filter((m) => m.draftId === draft.id).map((m) => <article key={m.id}><p>{m.explanation} · {m.algorithmVersion} · {m.decision}</p>{["DISTINCT", "RELATED", "DUPLICATE"].map((decision) => <button className="btn" key={decision} disabled={busy || m.decision !== "PENDING" || !pending} onClick={() => void send({ type: "match.review", draftId: draft.id, expectedVersion: draft.version, matchId: m.id, decision: decision as "DISTINCT" | "RELATED" | "DUPLICATE", reason: "Human reviewed candidate against original complaint" }, crypto.randomUUID())}>{decision.toLowerCase()}</button>)}</article>)}{!s.matches.some((m) => m.draftId === draft.id) && <p>No persisted authorized match candidates. This does not mean a matching scan completed.</p>}</> : <p>No draft selected. Intake review requires scoped Bureau authority.</p>}
    </section></div>;
}
