import { test } from "node:test";
import assert from "node:assert/strict";
import { databaseTlsOptions } from "../scripts/phase2/database-tls.mjs";

const ref = "xjnukuerzlrxjjqwmgkn";
test("operator TLS pins the approved project and cannot be weakened by URL options", async () => {
  for (const url of [
    "postgres://postgres:dummy@db.other.supabase.co/postgres",
    "postgres://postgres:dummy@aws-0-test.pooler.supabase.com/postgres",
    `postgres://postgres:dummy@db.${ref}.supabase.co/other`,
    ...["sslmode=disable", "sslmode=require", "sslrootcert=other", "uselibpqcompat=true"].map(
      (query) => `postgres://postgres:dummy@db.${ref}.supabase.co/postgres?${query}`),
  ]) await assert.rejects(databaseTlsOptions(url, ref));
});
test("operator TLS keeps certificate and hostname checks enabled and rejects a missing explicit CA", async () => {
  const url = `postgres://postgres:dummy@db.${ref}.supabase.co/postgres`;
  await assert.rejects(databaseTlsOptions(url, ref, ".local/nonexistent-phase2-ca.crt"));
  const options = await databaseTlsOptions(url, ref);
  assert.equal(options.ssl.rejectUnauthorized, true);
  assert.equal(options.ssl.servername, `db.${ref}.supabase.co`);
});
