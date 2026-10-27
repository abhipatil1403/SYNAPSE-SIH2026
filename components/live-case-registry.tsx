"use client";
import {Feedback} from "./feedback";
import {ActionForm} from "./feedback";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  LockKeyhole,
  LogOut,
  Network,
  RefreshCw,
  Search,
  ShieldCheck,
} from "./symbols";
import {
  casePageSchema,
  identitySchema,
  liveStatuses,
  livePriorities,
  liveStatusLabels,
  livePriorityLabels,
  liveRoleLabels,
  type LiveIdentity,
  type LiveCasePage,
} from "@/lib/live/contracts";
import { LiveReadiness } from "./live-readiness";

type View = "loading" | "signed-out" | "ready" | "locked" | "error";
const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(value))
    : "Not configured";
async function responseBody(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
export function LiveCaseRegistry() {
  const [view, setView] = useState<View>("loading");
  const [identity, setIdentity] = useState<LiveIdentity | null>(null);
  const [cases, setCases] = useState<LiveCasePage | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState({
    q: "",
    status: "",
    priority: "",
    sort: "received_desc",
  });
  const [applied, setApplied] = useState({ ...filters, page: 1 });
  const [retry, setRetry] = useState(0);
  const active = useRef<AbortController | null>(null);
  const sessionChannel = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("synapse-auth-session");
    sessionChannel.current = channel;
    channel.onmessage = () => {
      active.current?.abort();
      setCases(null);
      setIdentity(null);
      setView("loading");
      setRetry((n) => n + 1);
    };
    return () => {
      channel.close();
      sessionChannel.current = null;
    };
  }, []);
  const handleFailure = useCallback(
    (
      status: number,
      body: { error?: { code?: string; message?: string } } | null,
    ) => {
      setCases(null);
      setMessage(
        body?.error?.message ??
          "The read-only service is temporarily unavailable.",
      );
      if (status === 401) {
        setIdentity(null);
        setView("signed-out");
      } else if (status === 503 && body?.error?.code === "preview_locked") {
        setIdentity(null);
        setView("locked");
      } else setView("error");
    },
    [],
  );
  useEffect(() => {
    const control = new AbortController();
    active.current = control;
    const load = async () => {
      setBusy(true);
      try {
        const params = new URLSearchParams({
          page: String(applied.page),
          pageSize: "20",
          sort: applied.sort,
        });
        if (applied.q) params.set("q", applied.q);
        if (applied.status) params.set("status", applied.status);
        if (applied.priority) params.set("priority", applied.priority);
        const response = await fetch(`/api/phase1/cases?${params}`, {
          cache: "no-store",
          signal: control.signal,
        });
        const body = await responseBody(response);
        if (control.signal.aborted) return;
        if (!response.ok) {
          handleFailure(response.status, body);
          return;
        }
        const parsedIdentity = identitySchema.safeParse(body?.identity);
        const parsedPage = casePageSchema.safeParse(
          body &&
            Object.fromEntries(
              Object.entries(body).filter(([key]) => key !== "identity"),
            ),
        );
        if (!parsedIdentity.success || !parsedPage.success)
          throw new Error("Invalid read contract");
        setIdentity(parsedIdentity.data);
        setCases(parsedPage.data);
        setView("ready");
        setMessage("");
      } catch {
        if (!control.signal.aborted) handleFailure(503, null);
      } finally {
        if (!control.signal.aborted) setBusy(false);
      }
    };
    void load();
    return () => control.abort();
  }, [applied, retry, handleFailure]);
  useEffect(() => {
    if (view !== "ready" || busy) return;
    const refresh = () => {
      if (document.visibilityState === "visible") setRetry((n) => n + 1);
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [view, busy]);
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = event.currentTarget,
      fields = new FormData(form);
    const input = {
      email: String(fields.get("email")),
      password: String(fields.get("password")),
    };
    try {
      const response = await fetch("/api/phase1/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await responseBody(response);
      form.reset();
      if (!response.ok) {
        if (
          response.status === 403 &&
          body?.error?.code === "account_not_enabled"
        ) {
          setIdentity(null);
          setCases(null);
          setMessage(body.error.message);
          setView("signed-out");
        } else handleFailure(response.status, body);
      } else {
        setView("loading");
        setRetry((n) => n + 1);
      }
    } catch {
      handleFailure(503, null);
    } finally {
      input.password = "";
      setBusy(false);
    }
  }
  async function signOut() {
    active.current?.abort();
    setCases(null);
    setIdentity(null);
    setBusy(true);
    try {
      const response = await fetch("/api/phase1/sign-out", { method: "POST" });
      if (!response.ok) {
        handleFailure(response.status, await responseBody(response));
        return;
      }
      setIdentity(null);
      setCases(null);
      setMessage("");
      setView("signed-out");
      sessionChannel.current?.postMessage("signed-out");
      setFilters({ q: "", status: "", priority: "", sort: "received_desc" });
    } catch {
      handleFailure(503, null);
    } finally {
      setBusy(false);
    }
  }
  const submitFilters = (event: FormEvent) => {
    event.preventDefault();
    setApplied({ ...filters, q: filters.q.trim(), page: 1 });
  };
  async function refreshSession() {
    setBusy(true);
    try {
      const response = await fetch("/api/phase1/refresh", { method: "POST" });
      if (!response.ok) {
        handleFailure(response.status, await responseBody(response));
        return;
      }
      setRetry((n) => n + 1);
    } catch {
      handleFailure(503, null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="live-preview">
      <header className="live-preview-topbar">
        <Link href="/dashboard" className="live-preview-brand">
          <Network size={25} />
          <strong>SYNAPSE</strong>
        </Link>
        <span className="badge">
          <LockKeyhole size={14} />
          Authenticated preview · Read only
        </span>
        <Link href="/dashboard" className="btn">
          <ArrowLeft size={15} />
          Demo workspace
        </Link>
        <Link href="/platform" className="btn">Platform workspace</Link>
      </header>
      <section className="live-preview-workspace">
        <LiveReadiness />
        <div className="live-preview-heading">
          <div>
            <p className="eyebrow">SECURE READ-ONLY PREVIEW</p>
            <h1>Case Registry</h1>
            <p>
              Authorized registered cases from Supabase. Case changes are
              unavailable in this preview.
            </p>
          </div>
          {identity && (
            <div className="live-preview-account">
              <strong>{identity.displayName}</strong>
              <span>
                {identity.roleCodes
                  .map((role) => liveRoleLabels[role])
                  .join(" · ") || "No active case role"}
              </span>
              <button className="btn" onClick={signOut} disabled={busy}>
                <LogOut size={15} />
                Sign out
              </button>
              <button className="btn" onClick={refreshSession} disabled={busy}>
                <RefreshCw size={15} />
                Refresh session
              </button>
            </div>
          )}
        </div>
        {view === "loading" && (
          <div className="live-preview-state" role="status">
            <div className="skeleton" />
            <p>Checking authenticated access…</p>
          </div>
        )}
        {view === "locked" && (
          <div className="card live-preview-state">
            <ShieldCheck size={36} />
            <h2>Read-only preview is locked</h2>
            <p>{message}</p>
            <p>Your account workspace remains available.</p>
            <Link href="/dashboard" className="btn primary">
              Open workspace
              <ArrowRight size={15} />
            </Link>
          </div>
        )}
        {view === "signed-out" && (
          <div className="card live-preview-signin">
            <LockKeyhole size={28} />
            <h2>Sign in to your account</h2>
            <p>
              Access requires a provisioned Supabase account and approved case
              permissions.
            </p>
            <ActionForm onSubmit={signIn} className="form-stack">
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  maxLength={254}
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={1024}
                />
              </label>
              <Feedback message={message} tone="error"/>
              <button className="btn primary" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
                <ArrowRight size={16} />
              </button>
            </ActionForm>
          </div>
        )}
        {view === "error" && (
          <div className="card live-preview-state" role="alert">
            <h2>Case access unavailable</h2>
            <p>{message}</p>
            <button
              className="btn"
              onClick={() => setRetry((n) => n + 1)}
              disabled={busy}
            >
              <RefreshCw size={15} />
              Try again
            </button>
          </div>
        )}
        {view === "ready" && cases && (
          <section
            className="card live-registry"
            aria-label="Authorized case registry"
            aria-busy={busy}
          >
            <div className="live-registry-summary">
              <h2>
                {cases.total} authorized {cases.total === 1 ? "case" : "cases"}
              </h2>
              <span className="badge">
                <ShieldCheck size={14} />
                Read access verified
              </span>
            </div>
            <ActionForm className="live-registry-filters" onSubmit={submitFilters}>
              <label className="live-registry-search">
                <span>Search cases</span>
                <span>
                  <Search size={17} />
                  <input
                    value={filters.q}
                    onChange={(e) =>
                      setFilters({ ...filters, q: e.target.value })
                    }
                    placeholder="Case number, subject or institution"
                    maxLength={100}
                  />
                </span>
              </label>
              <label>
                Status
                <select
                  value={filters.status}
                  onChange={(e) =>
                    setFilters({ ...filters, status: e.target.value })
                  }
                >
                  <option value="">All statuses</option>
                  {liveStatuses.map((status) => (
                    <option key={status} value={status}>
                      {liveStatusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select
                  value={filters.priority}
                  onChange={(e) =>
                    setFilters({ ...filters, priority: e.target.value })
                  }
                >
                  <option value="">All priorities</option>
                  {livePriorities.map((priority) => (
                    <option key={priority} value={priority}>
                      {livePriorityLabels[priority]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sort
                <select
                  value={filters.sort}
                  onChange={(e) =>
                    setFilters({ ...filters, sort: e.target.value })
                  }
                >
                  <option value="received_desc">Newest received</option>
                  <option value="received_asc">Oldest received</option>
                  <option value="updated_desc">Recently updated</option>
                </select>
              </label>
              <button type="submit" className="btn primary" disabled={busy}>
                Apply filters
              </button>
            </ActionForm>
            <div
              className="live-registry-table"
              tabIndex={0}
              aria-label="Scrollable case list"
            >
              <table>
                <thead>
                  <tr>
                    <th>Case / institution</th>
                    <th>Lead Bureau</th>
                    <th>Officer</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Received</th>
                    <th>SLA deadline</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.items.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.subject}</strong>
                        <span>
                          #{c.caseNumber} · {c.institution}
                          {c.city ? ` · ${c.city}` : ""}
                        </span>
                      </td>
                      <td>{c.bureau}</td>
                      <td>
                        {c.officerId === identity?.internalUserId ? (
                          identity.displayName
                        ) : c.officerId ? (
                          <span title={c.officerId}>
                            Assigned · {c.officerId.slice(0, 8)}
                          </span>
                        ) : (
                          "Unassigned"
                        )}
                      </td>
                      <td>
                        <span className="badge" title={c.statusCode}>
                          {liveStatusLabels[c.statusCode]}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${c.priorityCode === "URGENT" || c.priorityCode === "HIGH" ? "amber" : ""}`}
                        >
                          {livePriorityLabels[c.priorityCode]}
                        </span>
                      </td>
                      <td>{formatDate(c.receivedAt)}</td>
                      <td>{formatDate(c.dueAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!cases.items.length && (
              <div className="live-registry-empty">
                <Search size={26} />
                <h3>No authorized cases match</h3>
                <p>
                  Try different filters, or ask your designated authority about
                  case access.
                </p>
              </div>
            )}
            <footer className="live-registry-pagination">
              <span>
                {cases.total
                  ? `${Math.min((cases.page - 1) * cases.pageSize + 1, cases.total)}–${Math.min(cases.page * cases.pageSize, cases.total)} of ${cases.total}`
                  : "0 cases"}
              </span>
              <button
                className="btn"
                disabled={busy || cases.page <= 1}
                onClick={() =>
                  setApplied({ ...applied, page: applied.page - 1 })
                }
              >
                <ArrowLeft size={14} />
                Previous
              </button>
              <button
                className="btn"
                disabled={busy || cases.page * cases.pageSize >= cases.total}
                onClick={() =>
                  setApplied({ ...applied, page: applied.page + 1 })
                }
              >
                Next
                <ArrowRight size={14} />
              </button>
            </footer>
          </section>
        )}
        <p className="live-preview-footnote">
          This preview is separate from Demo Mode. No demo role, fictional
          record, or local-storage permission authorizes Supabase access.
        </p>
      </section>
    </main>
  );
}
