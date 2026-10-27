"use client";
import {Spinner,Feedback} from "./feedback";
import { useState } from "react";
import { readinessCheckSchema } from "@/lib/live/readiness";
export function LiveReadiness() {
  const [checks, setChecks] = useState<
    { id: string; status: string; detail: string }[] | null
  >(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function check() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/phase1/readiness", { cache: "no-store" });
      const body = await r.json();
      const parsed = readinessCheckSchema.array().safeParse(body.checks);
      if (!r.ok || !parsed.success) throw Error();
      setChecks(parsed.data);
    } catch {
      setError("Current readiness could not be verified.");
      setChecks(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="live-readiness">
      <summary>Live-readiness checklist</summary>
      <p>
        Current checks and fresh verification evidence. Missing or stale
        evidence blocks activation.
      </p>
      <button className="btn" onClick={check} disabled={busy}>
        {busy&&<Spinner/>}{busy ? "Checking…" : "Run readiness checks"}
      </button>
      <Feedback message={error}/>
      {checks && (
        <ul>
          {checks.map((c) => (
            <li key={c.id}>
              <strong>
                {c.status.toUpperCase()} · {c.id.replaceAll("_", " ")}
              </strong>
              <span>{c.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
