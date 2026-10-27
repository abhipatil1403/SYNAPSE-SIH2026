import "server-only";
import { readFile } from "node:fs/promises";
import { evaluateReadiness, type ReadinessCheck } from "./readiness";
import { authReadiness } from "../auth/gateway";
export async function currentReadiness() {
  const checkedAt = new Date();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let projectRef = "unconfigured";
  const checks: ReadinessCheck[] = [
    {
      id: "global_mode_locked",
      status:
        !process.env.NEXT_PUBLIC_APP_MODE ||
        process.env.NEXT_PUBLIC_APP_MODE === "demo"
          ? "pass"
          : "fail",
      detail: "Global Live Mode is not activated by the preview.",
      source: "Current server environment",
    },
    {
      id: "server_read_gate",
      status:
        process.env.SYNAPSE_PHASE1_READ_ENABLED === "true" ? "fail" : "pass",
      detail:
        "The delivered server preview gate should remain off pending approval.",
      source: "Current server environment",
    },
  ];
  if (url && key?.startsWith("sb_publishable_")) {
    try {
      const origin = new URL(url);
      projectRef = origin.hostname.split(".")[0];
      if (
        origin.protocol !== "https:" &&
        !["127.0.0.1", "localhost"].includes(origin.hostname)
      )
        throw Error("invalid");
      const response = await fetch(new URL("/auth/v1/health", origin), {
        headers: { apikey: key },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      checks.push({
        id: "auth_provider_health",
        status: response.status === 200 ? "pass" : "fail",
        detail: `Auth health returned HTTP ${response.status}.`,
        source: "Current publishable-key health probe",
      });
      await response.body?.cancel();
    } catch {
      checks.push({
        id: "auth_provider_health",
        status: "blocked",
        detail: "Auth provider could not be verified.",
        source: "Current network probe",
      });
    }
  } else
    checks.push({
      id: "auth_provider_health",
      status: "blocked",
      detail: "Publishable project configuration is unavailable.",
      source: "Current server environment",
    });
  const receipts: unknown[] = [];
  if (process.env.SYNAPSE_GATEWAY_DATABASE_URL) {
    try {
      const gateway = await authReadiness();
      const closed = gateway.checks.some((c) => c.id === "direct_rpc_closed" && c.status === "PASS");
      const executed = ["hosted-auth", "web-auth"].every((id) => gateway.checks.some((c) => c.id === id && c.status === "PASS"));
      checks.push({ id: "rpc_execution_grants", status: closed ? "pass" : "fail", detail: "Direct browser read execution is revoked; the restricted server gateway is required.", source: "Current hosted catalog" },
        { id: "external_logout_session_invalidation", status: closed && executed ? "pass" : "blocked", detail: closed && executed ? "The application-owned gateway passed real provider-only logout and replay tests; browser JWTs cannot invoke protected direct reads." : "Current catalog and fresh issued-JWT/HTTP evidence are both required.", source: "Current catalog plus timestamped Phase 6–7 executed evidence" },
        { id: "rpc_0029_review", status: "blocked", detail: "The application-owned gateway correction still needs independent release review. Historical failure is preserved in the Phase 2 report.", source: "No independent activation approval recorded" });
    } catch { /* Existing evidence remains conservative if current verification fails. */ }
  }
  for (const file of [
    "hosted-readiness.json",
    "session-readiness.json",
    "review-readiness.json",
    "http-session-results.json",
    "expiry-readiness.json",
    "negative-readiness.json",
  ]) {
    try {
      receipts.push(JSON.parse(await readFile(`docs/phase2/${file}`, "utf8")));
    } catch {
      /* Missing evidence remains blocked, never green. */
    }
  }
  return evaluateReadiness(projectRef, checks, receipts, checkedAt);
}
