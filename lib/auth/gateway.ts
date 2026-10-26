import "server-only";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Phase1Error } from "../live/service";

let pool: Pool | undefined;
function database() {
  if (pool) return pool;
  const connection = process.env.SYNAPSE_GATEWAY_DATABASE_URL, caFile = process.env.SYNAPSE_GATEWAY_CA_FILE;
  if (!connection || !caFile) throw new Phase1Error(503, "gateway_unavailable", "Officer access is awaiting secure gateway configuration.");
  const url = new URL(connection);
  if (url.protocol !== "postgresql:" || url.search || !url.username.startsWith("synapse_web_login") ||
    !/^(?:db\.xjnukuerzlrxjjqwmgkn\.supabase\.co|aws-[a-z0-9-]+\.pooler\.supabase\.com)$/.test(url.hostname))
    throw new Phase1Error(503, "gateway_unavailable", "The officer gateway configuration could not be verified.");
  pool = new Pool({ connectionString: connection, ssl: { ca: readFileSync(caFile, "utf8"), rejectUnauthorized: true, servername: url.hostname },
    max: 5, idleTimeoutMillis: 10000, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  pool.on("error", () => { /* No URL/provider/user material is written to logs. */ });
  return pool;
}
export async function gateway(operation: "read" | "account" | "limit" | "memberships" | "roles", claims: unknown, action: string, input: unknown = {}) {
  const connection = await database().connect();
  try {
    await connection.query("BEGIN");
    await connection.query("SET LOCAL ROLE synapse_web_gateway");
    const result = operation === "limit"
      ? await connection.query("SELECT synapse_gateway.limit_attempt($1,$2,$3) result", [action, (input as { limit: number }).limit, 900])
      : await connection.query(operation === "read" ? "SELECT synapse_gateway.read($1,$2,$3) result" : operation === "memberships" ? "SELECT synapse_gateway.memberships($1,$2,$3) result" : operation === "roles" ? "SELECT synapse_gateway.roles($1,$2,$3) result" : "SELECT synapse_gateway.account($1,$2,$3) result", [JSON.stringify(claims), action, JSON.stringify(input)]);
    await connection.query("COMMIT"); return result.rows[0].result as unknown;
  } catch (error) {
    await connection.query("ROLLBACK");
    const code = (error as { code?: string }).code;
    if (["22023", "22007", "22P02"].includes(code ?? "")) throw new Phase1Error(400, "invalid_input", "Check the required fields and approved expiry limits.");
    throw new Phase1Error(code === "42501" ? 403 : code === "28000" ? 401 : ["40001", "23505"].includes(code ?? "") ? 409 : 503,
      code === "40001" ? "stale_account" : "authorization_unavailable", code === "42501" ? "Current authorization or a valid recovery link is required." : "The authorized operation could not be completed. Reload and try again.");
  } finally { connection.release(); }
}
export async function throttle(request: Request, action: string, email = "") {
  const secret = process.env.SYNAPSE_AUTH_RATE_SECRET;
  if (!secret || secret.length < 32) throw new Phase1Error(503, "throttle_unavailable", "Authentication protection is not configured.");
  // Accept proxy metadata only behind an explicitly configured trusted ingress.
  const address = process.env.SYNAPSE_TRUST_PROXY === "true" ? request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown" : "shared-ingress";
  for (const [kind, value, limit] of [["address", address, 60], ["account", email.toLowerCase(), action === "login" ? 12 : 5]] as const) {
    const key = createHmac("sha256", secret).update(`${action}:${kind}:${value}`).digest("hex");
    if (await gateway("limit", {}, key, { limit }) !== true) throw new Phase1Error(429, "rate_limited", "Too many attempts. Try again later.");
  }
}
export async function authReadiness() {
  const connection = await database().connect();
  try {
    const result = (await connection.query(`SELECT
      NOT has_function_privilege('authenticated','public.synapse_phase1_me()','EXECUTE') AND
      NOT has_function_privilege('authenticated','public.synapse_phase1_cases(text,text,text,integer,integer,text)','EXECUTE') direct_rpc_closed,
      NOT has_schema_privilege(current_user,'synapse','USAGE') restricted_login,
      NOT pg_has_role(current_user,'synapse_case_reader','MEMBER') AND NOT pg_has_role(current_user,'synapse_account_manager','MEMBER') no_owner_assumption`)).rows[0];
    const checks = Object.entries(result).map(([id, value]) => ({ id, status: value === true ? "PASS" : "FAIL", source: "Current hosted database catalog" }));
    for (const [file, id] of [["hosted-auth-results.json", "hosted-auth"], ["web-auth-results.json", "web-auth"], ["admin-reset-results.json", "email_delivery_and_recovery"], ["admin-roles-results.json", "admin_role_management"]]) {
      try {
        const evidence = JSON.parse(await readFile(`docs/phase6-7/${file}`, "utf8"));
        const fresh = Date.now() - Date.parse(evidence.checkedAt) < 3600000 && Date.parse(evidence.checkedAt) <= Date.now();
        checks.push({ id, status: fresh && evidence.checks?.length > 0 && evidence.checks.every((c: { status: string }) => c.status === "PASS") ? "PASS" : "BLOCKED", source: `Recorded executed test evidence · ${evidence.checkedAt}` });
      } catch { checks.push({ id, status: "BLOCKED", source: "No current executed evidence is installed on this server" }); }
    }
    checks.push({ id: "production_email_policy", status: "BLOCKED", source: "Production SMTP, redirect, abuse-protection and delivery policy review still required" },
      { id: "https_deployment", status: "BLOCKED", source: "Trusted HTTPS Secure-cookie test still required" },
      { id: "independent_release_approval", status: "BLOCKED", source: "No independent activation approval recorded" });
    return { checkedAt: new Date().toISOString(), checks, safeToActivateLive: false, businessWritesEnabled: false };
  } finally { connection.release(); }
}
