"use client";
import {useFeedbackState} from "./feedback";
import {ActionForm} from "./feedback";
import {Spinner,Feedback} from "./feedback";
import { useState } from "react";
import { bureauRoleSchema, roleAssignmentsSchema, localExpiryValue, reviewedExpiry, type RoleAssignment } from "@/lib/auth/administration";

export function RoleAdministration() {
  const [assignments, setAssignments] = useState<RoleAssignment[]>([]), [truncated, setTruncated] = useState(false);
  const [message, setMessage] = useFeedbackState(""), [busy, setBusy] = useState(false);
  async function load() {
    const response = await fetch("/api/auth/roles", { cache: "no-store" }), body = await response.json();
    if (!response.ok) { setAssignments([]); if ([401, 403].includes(response.status)) window.dispatchEvent(new Event("synapse-authority-check")); throw Error(body.error?.message ?? "Role access is unavailable."); }
    const result = roleAssignmentsSchema.parse(body); setAssignments(result.assignments); setTruncated(result.truncated);
  }
  return <section className="card"><h2>Bureau role assignments</h2><p>Review or revoke current Bureau roles. A role window must fit an approved membership. Global administrator roles require a separate operator review.</p>
    <button className="btn" disabled={busy} onClick={() => { setBusy(true); void load().catch((error) => setMessage(error.message)).finally(() => setBusy(false)); }}>{busy&&<Spinner/>}{busy?"Loading roles…":"Load current roles"}</button>
    <Feedback message={message}/>{truncated && <p role="status">Showing the first 100 current assignments. Use the operator review procedure for assignments beyond this list.</p>}
    {assignments.map((assignment) => <RoleForm key={assignment.id + assignment.validUntil} assignment={assignment} busy={busy} send={async (body) => {
      setBusy(true); try {
        const response = await fetch("/api/auth/role", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" }), result = await response.json();
        if (!response.ok) { if ([401, 403].includes(response.status)) window.dispatchEvent(new Event("synapse-authority-check")); throw Error(result.error?.message ?? "The role review failed."); }
        await load(); setMessage(result.replayed ? "Review already recorded; current assignments refreshed." : "Role review committed and audited."); return true;
      } catch (error) { setMessage(error instanceof Error ? error.message : "The role review failed."); return false; } finally { setBusy(false); }
    }} />)}
  </section>;
}
function RoleForm({ assignment: a, busy, send }: { assignment: RoleAssignment; busy: boolean; send: (body: unknown) => Promise<boolean> }) {
  const [revoke, setRevoke] = useState(false), [requestId, setRequestId] = useState(() => crypto.randomUUID());
  return <article><h3>{a.email} · {a.bureau}</h3><p>Current role: {a.role} · Expiry: {a.validUntil ?? "No expiry"}</p>
    <ActionForm className="form-stack" onChange={() => setRequestId(crypto.randomUUID())} onSubmit={async (event) => {
      event.preventDefault(); const fields = new FormData(event.currentTarget);
      if (await send({ requestId, assignmentId: a.id, expectedRole: a.role, expectedUntil: a.validUntil, revoke, reason: String(fields.get("reason")),
        ...(!revoke ? { role: String(fields.get("role")), until: reviewedExpiry(String(fields.get("until")), a.validUntil) } : {}) })) setRequestId(crypto.randomUUID());
    }}><label><input type="checkbox" checked={revoke} onChange={(event) => setRevoke(event.target.checked)} /> Revoke role</label>
      <label>Reviewed Bureau role<select name="role" defaultValue={a.role} disabled={revoke}>{bureauRoleSchema.options.map((role) => <option key={role}>{role}</option>)}</select></label>
      <label>Role expiry (your local time)<input type="datetime-local" step="0.001" name="until" defaultValue={localExpiryValue(a.validUntil)} required={!revoke} disabled={revoke} /></label>
      <label>Role review reason<textarea name="reason" required minLength={5} maxLength={1000} /></label>
      {!a.canManage && <p>Your own assignments require independent review.</p>}<button className="btn" disabled={busy || !a.canManage}>Commit role review</button>
    </ActionForm></article>;
}
