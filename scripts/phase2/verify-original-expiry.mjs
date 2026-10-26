import { createHash, createPublicKey, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import { approvedPlan, projectRef, safeMain, writeReport } from "./operator.mjs";
import { loadVault } from "./vault.mjs";

// This runner never logs in, refreshes, overwrites the probe or changes a read gate.
safeMain(async () => {
  const checkedAt = new Date().toISOString();
  const checks = [];
  const report = { version: 1, projectRef, checkedAt, source: "Original DPAPI expiry probe; raw HTTP with no refresh-capable client", checks };
  try {
    const { plan } = await approvedPlan();
    const vault = await loadVault(`.local/phase2/${plan.runId}.vault`);
    const probe = vault.expiryProbe;
    if (!probe?.token) throw Error("ORIGINAL_TOKEN_UNAVAILABLE");
    const parts = probe.token.split(".");
    if (parts.length !== 3) throw Error("ORIGINAL_TOKEN_MALFORMED");
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const url = `https://${projectRef}.supabase.co`;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (process.env.NEXT_PUBLIC_SUPABASE_URL !== url || !key?.startsWith("sb_publishable_")) throw Error("PROJECT_CONFIGURATION_MISMATCH");
    if (!Number.isSafeInteger(claims.exp) || claims.exp !== probe.expiresAt || claims.iss !== url + "/auth/v1")
      throw Error("ORIGINAL_CLAIM_MISMATCH");
    report.fingerprintSha256 = createHash("sha256").update(probe.token).digest("hex");
    const manifest = JSON.parse(await readFile("docs/phase2/expiry-probe-manifest.json", "utf8"));
    if (manifest.projectRef !== projectRef || manifest.exp !== claims.exp || manifest.fingerprintSha256 !== report.fingerprintSha256)
      throw Error("ORIGINAL_TOKEN_SUBSTITUTED");
    report.originalFingerprintMatched = true;
    report.exp = claims.exp;
    report.expiresAt = new Date(claims.exp * 1000).toISOString();
    report.issuedAt = new Date(claims.iat * 1000).toISOString();
    const algorithms = { ES256: ["sha256", "EC"], RS256: ["RSA-SHA256", "RSA"], EdDSA: [null, "OKP"] };
    const algorithm = algorithms[header.alg];
    if (!algorithm) throw Error("PUBLIC_SIGNATURE_VERIFICATION_UNAVAILABLE");
    const jwksResponse = await fetch(url + "/auth/v1/.well-known/jwks.json", { headers: { apikey: key }, signal: AbortSignal.timeout(15000) });
    if (!jwksResponse.ok) throw Error("JWKS_UNAVAILABLE");
    const jwks = await jwksResponse.json();
    const jwk = jwks.keys.find((k) => k.kid === header.kid && k.kty === algorithm[1] && (!k.alg || k.alg === header.alg));
    if (!jwk) throw Error("ORIGINAL_SIGNING_KEY_UNAVAILABLE");
    if (!verify(algorithm[0], Buffer.from(parts[0] + "." + parts[1]), { key: createPublicKey({ key: jwk, format: "jwk" }), dsaEncoding: "ieee-p1363" }, Buffer.from(parts[2], "base64url")))
      throw Error("ORIGINAL_SIGNATURE_INVALID");
    report.signatureVerified = true;
    report.expiredAtCheck = claims.exp * 1000 <= Date.now();
    if (!report.expiredAtCheck) {
      checks.push({ id: "expired_jwt_rejected", status: "blocked", detail: `Original signed token is available and signature-valid, but does not expire until ${report.expiresAt}. No replacement or refresh was used.`, source: "Original signed token exp and current UTC clock" });
    } else {
      const response = await fetch(url + "/rest/v1/rpc/synapse_phase1_cases", { method: "POST", headers: { apikey: key, Authorization: `Bearer ${probe.token}`, "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(15000) });
      const body = await response.json();
      report.httpStatus = response.status;
      report.gatewayDate = response.headers.get("date");
      report.gatewayCode = typeof body.code === "string" && /^[A-Z0-9_]+$/.test(body.code) ? body.code : null;
      const rejectedForExpiry = response.status === 401 && /expir/i.test(body.message ?? "") && body.code !== "28000";
      checks.push({ id: "expired_jwt_rejected", status: rejectedForExpiry ? "pass" : "fail", detail: rejectedForExpiry ? "The exact original signature-valid JWT was rejected by the gateway explicitly for expiry (HTTP 401). No login, refresh, substitution or read lease was used." : "The original token did not receive the expected explicit gateway expiry rejection; no expiry pass is inferred.", source: "Exact original JWT, raw hosted HTTP operation" });
    }
  } catch (error) {
    const reason = /^[A-Z_]+$/.test(error.message ?? "") ? error.message : "PROBE_CHECK_UNAVAILABLE";
    report.unavailableReason = reason;
    checks.push({ id: "expired_jwt_rejected", status: "blocked", detail: `NOT VERIFIED: ${reason}. Recover the original encrypted probe and rerun; do not substitute a new token.`, source: "Original-token prerequisite inspection" });
  }
  await writeReport("original-expiry-results.json", report);
  // Readiness consumes only sanitized evidence, never the token-bearing vault.
  await writeReport("expiry-readiness.json", { version: 1, projectRef, checkedAt, checks });
  for (const check of checks) console.log(`${check.status.toUpperCase()}: ${check.id} — ${check.detail}`);
  if (checks.some((c) => c.status !== "pass")) process.exitCode = 2;
});
