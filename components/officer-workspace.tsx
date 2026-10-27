"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Network, ShieldCheck } from "lucide-react";
import { accountSchema, type OfficerAccount } from "@/lib/auth/policy";
import { casePageSchema, type LiveCase } from "@/lib/live/contracts";
import { RoleAdministration } from "./role-administration";
import { localExpiryValue, reviewedExpiry, approvalExpiry } from "@/lib/auth/administration";
type Reply = { error?: { message?: string }; message?: string; destination?: string };
async function post(action: string, body: unknown = {}): Promise<Reply> {
  const response = await fetch(`/api/auth/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const result = await response.json(); if (!response.ok) { if ([401, 403].includes(response.status)) window.dispatchEvent(new Event("synapse-authority-check")); if (response.status === 401) window.location.replace("/login"); throw Error(result.error?.message ?? "The secure service is unavailable."); } return result;
}
export function OfficerWorkspace({ pending = false }: { pending?: boolean }) {
  const router = useRouter();
  const [account, setAccount] = useState<OfficerAccount | null>(null), [message, setMessage] = useState(""), [rows, setRows] = useState<LiveCase[]>([]), [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1), [total, setTotal] = useState(0);
  const active = useRef<AbortController | null>(null), generation = useRef(0), ending = useRef(false);
  const load = useCallback(async (external?: AbortSignal) => {
    if (ending.current) return;
    active.current?.abort(); const controller = new AbortController(), version = ++generation.current; active.current = controller;
    const signal = external ? AbortSignal.any([controller.signal, external]) : controller.signal;
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store", signal }); const result = await response.json();
      if (signal.aborted || version !== generation.current) return;
      if (!response.ok) { if (response.status === 401) router.replace("/login"); throw Error(result.error?.message ?? "Account verification unavailable."); }
      const resolved = accountSchema.parse(result.account); setAccount(resolved);
      // Authorization changes must reach the server, not a prefetched route redirect.
      if (resolved.status === "PENDING_APPROVAL" && !pending) { setRows([]); window.location.replace("/pending-approval"); return; }
      if (resolved.status === "APPROVED" && pending) { window.location.replace("/dashboard"); return; }
      if (resolved.status === "APPROVED") {
        const cases = await fetch(`/api/auth/cases?page=${page}&pageSize=20`, { cache: "no-store", signal }), body = await cases.json();
        if (signal.aborted || version !== generation.current) return;
        if (cases.ok) { const parsed = casePageSchema.parse(body); setRows(parsed.items); setTotal(parsed.total); setMessage(""); }
        else { setRows([]); setMessage(body.error?.message ?? "Case data is unavailable."); }
      }
    } catch (e) { if (!signal.aborted && version === generation.current) { setRows([]); setAccount(null); setMessage(e instanceof Error ? e.message : "The service is unavailable."); } }
  }, [pending, page, router]);
  useEffect(() => {
    const controller = new AbortController(); queueMicrotask(() => { if (!controller.signal.aborted) void load(controller.signal); });
    const channel = new BroadcastChannel("synapse-officer-session"); channel.onmessage = () => { ending.current = true; ++generation.current; controller.abort(); active.current?.abort(); setRows([]); setAccount(null); router.replace("/login"); router.refresh(); };
    const recheck = () => { if (document.visibilityState === "visible") void load(controller.signal); };
    const timer = setInterval(recheck, 60000); window.addEventListener("focus", recheck);
    return () => { controller.abort(); active.current?.abort(); channel.close(); clearInterval(timer); window.removeEventListener("focus", recheck); };
  }, [load, router]);
  const run = async (action: "logout" | "refresh") => {
    setBusy(true); setRows([]);
    active.current?.abort(); ++generation.current; if (action === "logout") ending.current = true;
    try { const result = await post(action); if (action === "logout") { const channel = new BroadcastChannel("synapse-officer-session"); channel.postMessage("signed-out"); channel.close(); setAccount(null); router.replace("/login"); router.refresh(); }
      else { if (result.destination && ["/dashboard", "/pending-approval"].includes(result.destination) && result.destination !== window.location.pathname) window.location.replace(result.destination); else await load(); }
    } catch (e) { setAccount(null); setMessage(e instanceof Error ? e.message : "Unable to complete session operation."); } finally { setBusy(false); }
  };
  const requiresApproval = account ? account.status === "PENDING_APPROVAL" : pending;
  return <main className="officer-surface"><header><Link className="auth-brand" href="/dashboard"><Network size={28} /><strong>SYNAPSE<span>Secure officer workspace</span></strong></Link><div><button className="btn" onClick={() => void run("refresh")} disabled={busy}>Refresh session</button><button className="btn" onClick={() => void run("logout")} disabled={busy}>Sign out</button></div></header>
    <section className="card"><p className="eyebrow"><ShieldCheck size={16} /> Verified Supabase identity</p><h1>{requiresApproval ? ({REJECTED:'Application rejected',REVOKED:'Access revoked',SUSPENDED:'Access suspended',APPROVED:'Access requires review',PENDING:'Pending officer approval'}[account?.application?.status??'PENDING']) : `Welcome${account?.displayName ? `, ${account.displayName}` : ""}`}</h1>
      {requiresApproval ? <p>Current application status: {account?.application?.status??'PENDING'}. Your account has no current complaint privileges. An authorized administrator must approve an active Bureau and role. Rejected, suspended, expired or revoked authority cannot access protected records.</p> : <p>{account?.roles.join(" · ") ?? "Verifying current roles…"} · {account?.memberships.length ?? 0} active Bureau memberships</p>}
      {message && <p className="auth-feedback" role="status">{message}</p>}
      {account?.roles.includes("SYSTEM_ADMIN") && <Link className="btn" href="/admin">Administration → User Approvals</Link>}
      {account?.status==='APPROVED'&&<Link className="btn" href="/dashboard">Open workspace</Link>}
    </section>
    {!requiresApproval && <section className="card"><h2>Authorized case registry</h2><p>Live workflows remain gated. Every available row is read from Supabase under your current Bureau permissions.</p><div className="platform-table"><table><thead><tr><th>Case</th><th>Institution</th><th>Status</th><th>Bureau</th></tr></thead><tbody>{rows.map((c) => <tr key={c.id}><td>#{c.caseNumber} · {c.subject}</td><td>{c.institution}</td><td>{c.statusCode}</td><td>{c.bureau}</td></tr>)}</tbody></table></div>{!rows.length && !message && <p>No authorized cases are available.</p>}<div className="card-head"><button className="btn" disabled={page === 1 || busy} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button className="btn" disabled={page * 20 >= total || busy} onClick={() => setPage(page + 1)}>Next</button></div></section>}
    </main>;
}
type Approval = { auth_user_id: string; email: string; display_name: string; status: string; revision: string; canDecide: boolean; requested_at:string;history:{action:string;at:string;actorId:string|null;detail:Record<string,unknown>}[] };
export function OfficerAdministration() {
  const router = useRouter();
  const [access, setAccess] = useState<"loading" | "approved" | "unavailable">("loading");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let generation = 0, active: AbortController | undefined, stopped = false;
    const check = async () => {
      active?.abort(); active = new AbortController(); const signal = active.signal, current = ++generation;
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store", signal }), body = await response.json();
        if (stopped || signal.aborted || current !== generation) return;
        if (response.status === 401) { setAccess("unavailable"); router.replace("/login"); router.refresh(); return; }
        if (!response.ok) throw Error("Current administrator authority could not be verified.");
        const account = accountSchema.parse(body.account);
        if (account.status !== "APPROVED" || !account.roles.includes("SYSTEM_ADMIN")) {
          setAccess("unavailable"); router.replace(account.status === "APPROVED" ? "/dashboard" : "/pending-approval"); router.refresh(); return;
        }
        setAccess("approved"); setMessage("");
      } catch { if (!stopped && !signal.aborted && current === generation) { setAccess("unavailable"); setMessage("Administrator access is unavailable. Private account records have been cleared."); } }
    };
    const refresh = () => { if (document.visibilityState === "visible") void check(); };
    const signedOut = () => { ++generation; active?.abort(); setAccess("unavailable"); router.replace("/login"); router.refresh(); };
    const channels = ["synapse-officer-session", "synapse-auth-session"].map((name) => new BroadcastChannel(name));
    for (const channel of channels) channel.onmessage = signedOut;
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh); window.addEventListener("synapse-authority-check", refresh); document.addEventListener("visibilitychange", refresh);
    queueMicrotask(() => { if (!stopped) void check(); });
    return () => { stopped = true; ++generation; active?.abort(); clearInterval(timer); for (const channel of channels) channel.close(); window.removeEventListener("focus", refresh); window.removeEventListener("synapse-authority-check", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [router]);
  // Unmount every resource/form on denial. Late resource responses belong to
  // discarded component instances and cannot restore private records.
  return access === "approved" ? <OfficerAdministrationContent /> : <main className="officer-surface"><h1>Administrator access</h1><p role="status">{message || "Verifying current administrator authority…"}</p><Link href="/dashboard">Return to officer workspace</Link></main>;
}
function OfficerAdministrationContent() {
  const [decisions,setDecisions]=useState<Record<string,string>>({});
  const [items, setItems] = useState<Approval[]>([]), [bureaus, setBureaus] = useState<{ id: string; name: string }[]>([]), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const response = await fetch("/api/auth/approvals", { cache: "no-store" }); const body = await response.json(); if (!response.ok) { setItems([]); throw Error(body.error?.message ?? "Approval access unavailable."); } setItems(body.requests); setBureaus(body.bureaus); }, []);
  useEffect(() => { let disposed = false; queueMicrotask(() => { if (!disposed) void load().catch((e) => { if (!disposed) setMessage(e.message); }); }); return () => { disposed = true; }; }, [load]);
  return <div className="user-approvals"><h2>User Approvals</h2><p>Independent global System Administrator authority is checked for every decision. No administrator is created automatically.</p>{message && <p role="status">{message}</p>}{items.map((item) => <section className="card" key={item.auth_user_id}><h2>{item.display_name}</h2><p>{item.email} · {item.status}</p><p>Application signup received: {new Date(item.requested_at).toLocaleString('en-IN')}</p><details><summary>Review history</summary>{item.history?.map((h,i)=><p key={i}>{h.action} · {new Date(h.at).toLocaleString('en-IN')} · {String(h.detail.reason??'Audited owner action')}</p>)}{!item.history?.length&&<p>No decisions recorded.</p>}</details><form className="form-stack" onSubmit={async (e) => {
      e.preventDefault(); const fields = new FormData(e.currentTarget); setBusy(true); try {
        const decision = String(fields.get("decision")); const until = decision === "APPROVED" ? approvalExpiry(String(fields.get("until") ?? "")) : undefined; await post("approval", { authId: item.auth_user_id, revision: item.revision, decision, reason: String(fields.get("reason")),
          ...(decision === "APPROVED" ? { bureauId: String(fields.get("bureau")), role: String(fields.get("role")), until } : {}) });
        await load(); setMessage("The account decision was committed and audited.");
      } catch (error) { setMessage(error instanceof Error ? error.message : "Approval failed."); } finally { setBusy(false); }
    }}><label>Decision<select name="decision" aria-label="Decision" onChange={e=>setDecisions(old=>({...old,[item.auth_user_id]:e.target.value}))}>{(item.status === "PENDING" ? ["APPROVED", "REJECTED"] : ["SUSPENDED", "REVOKED"]).map((d) => <option key={d}>{d}</option>)}</select></label>{item.status==='PENDING'&&(decisions[item.auth_user_id]??'APPROVED')==='APPROVED'&&<><label>Bureau<select name="bureau" aria-label="Bureau" defaultValue="" required><option value="" disabled>Select the approved Bureau</option>{bureaus.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>Role<select name="role" aria-label="Role" defaultValue="" required><option value="" disabled>Select the approved role</option>{["CASE_OFFICER", "BUREAU_HEAD", "AUDITOR", "REVIEWER"].map((r) => <option key={r}>{r}</option>)}</select></label><label>Assignment expiry (1 hour to 90 days ahead)<input type="datetime-local" name="until" required/></label></>}<label>Decision reason<textarea name="reason" required minLength={5} maxLength={1000} /></label>{!item.canDecide && <p>Changes to your own account require independent administrator approval.</p>}<button className="btn primary" disabled={busy || !item.canDecide}>Commit reviewed decision</button></form></section>)}{!items.length && <p>No reviewable requests loaded.</p>}<MembershipAdministration /><RoleAdministration /></div>;
}
type Membership = { id: string; userId: string; email: string; bureau: string; bureauId: string; validFrom: string; validUntil: string | null; canManage: boolean };
function MembershipAdministration() {
  const [memberships, setMemberships] = useState<Membership[]>([]), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  async function load() { const response = await fetch("/api/auth/memberships", { cache: "no-store" }), body = await response.json(); if (!response.ok) { setMemberships([]); throw Error(body.error?.message ?? "Membership access unavailable."); } setMemberships(body.memberships); }
  return <section className="card"><h2>Bureau membership reviews</h2><p>New Bureau/role assignments are made through officer approval. Review or revoke existing membership windows here; this never extends a role or changes its code.</p><button className="btn" disabled={busy} onClick={() => { setBusy(true); void load().catch((e) => setMessage(e.message)).finally(() => setBusy(false)); }}>Load current memberships</button>{message && <p role="status">{message}</p>}{memberships.map((m) => <MembershipForm key={m.id + m.validUntil} membership={m} busy={busy} send={async (body) => {
    setBusy(true); try { const result = await post("membership", body); await load(); setMessage((result as Reply & { replayed?: boolean }).replayed ? "Review already recorded; current state refreshed." : "Membership review committed and audited."); return true; }
    catch (error) { setMessage(error instanceof Error ? error.message : "Review failed."); return false; } finally { setBusy(false); }
  }} />)}</section>;
}
function MembershipForm({ membership: m, busy, send }: { membership: Membership; busy: boolean; send: (body: unknown) => Promise<boolean> }) {
  const [revoke, setRevoke] = useState(false), [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const initial = localExpiryValue(m.validUntil);
  return <article><h3>{m.email} · {m.bureau}</h3><p>Current expiry: {m.validUntil ?? "No expiry"}</p><form className="form-stack" onChange={() => setRequestId(crypto.randomUUID())} onSubmit={async (e) => {
    e.preventDefault(); const data = new FormData(e.currentTarget); if (await send({ requestId, membershipId: m.id, expectedUntil: m.validUntil, revoke, reason: String(data.get("reason")), ...(!revoke ? { until: reviewedExpiry(String(data.get("until")), m.validUntil) } : {}) })) setRequestId(crypto.randomUUID());
  }}><label><input type="checkbox" checked={revoke} onChange={(e) => setRevoke(e.target.checked)} /> Revoke membership</label><label>Reviewed expiry (your local time)<input type="datetime-local" step="0.001" name="until" defaultValue={initial} disabled={revoke} required={!revoke} /></label><label>Membership review reason<textarea name="reason" required minLength={5} maxLength={1000} /></label><button className="btn" disabled={busy || !m.canManage}>Commit membership review</button></form></article>;
}
