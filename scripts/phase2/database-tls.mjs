import { readFile } from "node:fs/promises";
import { X509Certificate } from "node:crypto";

// Scope trust to this operator connection; never modify Node's global CA store.
export async function databaseTlsOptions(connectionString, projectRef, caFile) {
  const url = new URL(connectionString);
  const direct = url.hostname === `db.${projectRef}.supabase.co`;
  const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) &&
    decodeURIComponent(url.username) === `postgres.${projectRef}`;
  if (!(["postgres:", "postgresql:"].includes(url.protocol)) ||
      !(direct || pooler) || url.pathname !== "/postgres")
    throw Error("DATABASE_URL must identify the approved project's postgres database.");
  for (const name of ["sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"]) {
    if (url.searchParams.has(name))
      throw Error("DATABASE_URL must omit TLS query overrides; use SUPABASE_DB_CA_FILE for verified TLS.");
  }
  let ca;
  try {
    ca = await readFile(caFile || ".local/phase2/supabase-db-root.crt", "utf8");
  } catch (error) {
    if (caFile || error.code !== "ENOENT") throw error;
  }
  if (ca) {
    const certificate = new X509Certificate(ca);
    const now = Date.now();
    if (!certificate.ca || now < Date.parse(certificate.validFrom) ||
        now >= Date.parse(certificate.validTo))
      throw Error("The supplied database CA must be a currently valid CA certificate.");
  }
  return { connectionString, ssl: { ...(ca ? { ca } : {}), rejectUnauthorized: true, servername: url.hostname } };
}
