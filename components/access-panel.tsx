"use client";
import { useState, type FormEvent } from "react";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { canDiscover, canView } from "@/lib/domain";
import type { AccessScope } from "@/lib/types";
import { useDemo } from "./provider";
import { Badge, Button, Card, Modal, date } from "./ui";
export function AccessPanel() {
  const { state, actor, run } = useDemo();
  const [request, setRequest] = useState<string | null>(null);
  const [decision, setDecision] = useState<{
    id: string;
    approve: boolean;
  } | null>(null);
  const discovered = state.cases.filter((c) => canDiscover(actor, c, state));
  const requests = state.accessRequests.filter(
    (r) => actor.role === "Supervisor" || r.requesterId === actor.id,
  );
  if (
    !discovered.length &&
    !requests.length &&
    !["Case Officer", "Bureau Head", "Auditor"].includes(actor.role)
  )
    return null;
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    let ok = false;
    if (request)
      ok = run(
        {
          type: "request-access",
          caseId: request,
          scope: f.get("scope") as AccessScope,
          purpose: String(f.get("purpose")),
          days: Number(f.get("days")),
        },
        "Scoped access request recorded",
      );
    if (decision)
      ok = run(
        {
          type: "decide-access",
          requestId: decision.id,
          approve: decision.approve,
          reason: String(f.get("purpose")),
        },
        "Access decision recorded with scope and expiry",
      );
    if (ok) {
      setRequest(null);
      setDecision(null);
    }
  }
  return (
    <Card
      title="Scoped Access & Discovery"
      action={
        <Badge tone="green">
          <ShieldCheck size={11} />
          Purpose · Scope · Expiry
        </Badge>
      }
      className="access-panel"
    >
      <p className="description">
        Discovery shows a sanitized case reference. DETAILS access does not
        include DOCUMENTS or coordination actions. A Supervisor reviews each
        scope separately.
      </p>
      {discovered.map((c) => (
        <div key={c.id} className="coord-case">
          <div>
            <h3>{c.id}</h3>
            <p>
              {c.bureau} Bureau · Related institutional context · Details
              restricted
            </p>
          </div>
          <Button onClick={() => setRequest(c.id)}>Request Access</Button>
        </div>
      ))}
      {state.cases
        .filter(
          (c) =>
            canView(actor, c) &&
            c.bureau !== actor.bureau &&
            actor.role !== "Supervisor",
        )
        .map((c) => (
          <div className="coord-case" key={c.id}>
            <div>
              <Link href={`/complaints/${c.id}`}>
                <h3>
                  {c.id}{" "}
                  <ArrowUpRight size={11} style={{ display: "inline" }} />
                </h3>
              </Link>
              <p>
                Existing scoped details · Request additional scope separately
              </p>
            </div>
            <Button onClick={() => setRequest(c.id)}>Request Scope</Button>
          </div>
        ))}
      {requests.map((r) => (
        <div className="transfer-item" key={r.id}>
          <div className="card-head">
            <strong>
              {r.caseId} · {r.scope}
            </strong>
            <Badge>{r.state}</Badge>
          </div>
          <p>
            {r.requesterName} · Expires {date(r.expiresAt)}
            <br />
            Purpose: {r.purpose}
          </p>
          {r.reviewer && (
            <p>
              {r.reviewer}: {r.decisionReason}
            </p>
          )}
          {actor.role === "Supervisor" && r.state === "Requested" && (
            <div className="finding-actions">
              <Button
                kind="primary"
                onClick={() => setDecision({ id: r.id, approve: true })}
              >
                Approve Scope
              </Button>
              <Button onClick={() => setDecision({ id: r.id, approve: false })}>
                Reject Scope
              </Button>
            </div>
          )}
        </div>
      ))}
      {!discovered.length && !requests.length && (
        <p className="fine-print">
          No related discovery references or access requests in your scope.
        </p>
      )}
      {(request || decision) && (
        <Modal
          title={
            request ? "Request a scoped case grant" : "Review access request"
          }
          onClose={() => {
            setRequest(null);
            setDecision(null);
          }}
        >
          <form className="form-stack" onSubmit={submit}>
            {request && (
              <>
                <label>
                  Access scope
                  <select name="scope">
                    <option>DETAILS</option>
                    <option>DOCUMENTS</option>
                    <option>COORDINATE</option>
                  </select>
                </label>
                <label>
                  Duration in days
                  <input
                    name="days"
                    type="number"
                    min={1}
                    max={30}
                    defaultValue={7}
                    required
                  />
                </label>
              </>
            )}
            <label>
              {request ? "Purpose and justification" : "Decision reason"}
              <textarea name="purpose" required minLength={3} />
            </label>
            <div className="dialog-actions">
              <Button
                onClick={() => {
                  setRequest(null);
                  setDecision(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" kind="primary">
                {request ? "Submit Request" : "Record Decision"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
}
