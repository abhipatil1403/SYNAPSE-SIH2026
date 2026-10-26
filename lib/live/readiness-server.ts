import "server-only";
import { readFile } from "node:fs/promises";
import { evaluateReadiness, type ReadinessCheck } from "./readiness";
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
