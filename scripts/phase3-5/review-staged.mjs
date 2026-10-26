import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadVault } from "../phase2/vault.mjs";

// Operator-only pre-commit check. Prints aggregate results, never a matched value.
try {
  const files = execFileSync("git", ["diff", "--cached", "--name-only", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
  const prohibited = files.filter((f) =>
    /(^|\/)(\.env(?:\.|$))/.test(f) && ![".env.example", ".env.operator.example"].includes(f) ||
    /\.(crt|cer|pem|key|pfx|vault|log)$/i.test(f) ||
    /^docs\/(screenshots\/|phase[12]\/.*\.json$|phase(?:3-5|6-7)\/.*(?:results|evidence)\.json$)/.test(f) || f.startsWith(".local/"));
  if (prohibited.length) throw Error("SENSITIVE_PATH_STAGED");
  const vault = await loadVault(".local/phase2/phase2-approved-officers.vault");
  let gateway = {};
  try { gateway = await loadVault(".local/phase2/auth-gateway.vault"); } catch { /* Optional before gateway provisioning. */ }
  let admin = {}, reset = {};
  try { admin = await loadVault(".local/phase2/admin-onboarding.vault"); } catch { /* Optional before approved signup. */ }
  try { reset = await loadVault(".local/phase2/admin-reset.vault"); } catch { /* Optional before real recovery. */ }
  const privateValues = [process.env.SUPABASE_SECRET_KEY, process.env.DATABASE_URL, process.env.SYNAPSE_GATEWAY_DATABASE_URL,
    gateway.password, gateway.connectionString, gateway.rateSecret, admin.password, admin.email, reset.newPassword,
    ...(admin.cookies ?? []).map(c=>c.value),...(reset.cookies ?? []).map(c=>c.value),...(reset.resumeCookies ?? []).map(c=>c.value),vault.expiryProbe?.token,
    ...vault.accounts.flatMap((a) => [a.password, a.email])].filter(Boolean);
  let matches = 0;
  for (const file of files) {
    const bytes = execFileSync("git", ["show", ":" + file], { maxBuffer: 30 * 1024 * 1024 });
    if (privateValues.some((value) => bytes.includes(Buffer.from(value)))) matches++;
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=]{16,}/.test(bytes.toString("utf8"))) matches++;
  }
  if (matches) throw Error("PRIVATE_VALUE_STAGED");
  const manifest = JSON.parse(await readFile("supabase/baseline/deployed-2026-10-26.manifest.json", "utf8"));
  for (const [file, expected] of [["supabase/baseline/deployed-2026-10-26.sql", manifest.sqlSha256], ["supabase/baseline/deployed-2026-10-26.catalog.json", manifest.catalogSha256]]) {
    const bytes = execFileSync("git", ["show", ":" + file], { maxBuffer: 30 * 1024 * 1024 });
    if (createHash("sha256").update(bytes).digest("hex") !== expected) throw Error("STAGED_BASELINE_HASH_MISMATCH");
  }
  console.log(`PASS: ${files.length} staged paths reviewed; zero configured secrets/passwords/approved emails/private keys; exact baseline hashes preserved.`);
} catch (error) {
  const code = /^[A-Z_]+$/.test(error.message ?? "") ? error.message : "REVIEW_UNAVAILABLE";
  console.error(`Staged review failed: ${code}. No matched value, credentials or diff were printed.`); process.exitCode = 1;
}
