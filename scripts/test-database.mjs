import pg from "pg";
import assert from "node:assert/strict";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import {inspectSecurity} from './phase2/security.mjs';

const root =
  process.env.SYNAPSE_TEST_DATABASE_URL ??
  "postgresql://postgres@127.0.0.1:55432/postgres";
const parsed = new URL(root);
if (!["127.0.0.1", "localhost"].includes(parsed.hostname))
  throw new Error(
    "Destructive disposable-database harness only accepts loopback servers.",
  );
const name = "synapse_test_" + randomUUID().replaceAll("-", "");
const admin = new pg.Client({ connectionString: root });
await admin.connect();
assert.equal(
  (
    await admin.query(
      "SELECT count(*)::int n FROM pg_roles WHERE rolname='synapse_case_reader'",
    )
  ).rows[0].n,
  0,
  "Use a dedicated test cluster without an existing Phase 1 reader role",
);
await admin.query(`CREATE DATABASE ${name}`);
parsed.pathname = "/" + name;
const db = new pg.Client({ connectionString: parsed.toString() });
const results = [];
const platform = process.argv.includes("--platform");
const phase2 = process.argv.includes("--phase2") || platform;
try {
  await db.connect();
  await db.query(`
    DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$;
    DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF; END $$;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
    $$;
  `);
} catch (e) {
  // Report the original setup failure; cleanup still occurs below.
  await db.end();
  await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
  await admin.query("DROP ROLE IF EXISTS synapse_case_reader");
  await admin.end();
  throw e;
}

try {
  await db.query(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated;
    CREATE SCHEMA extensions;
    CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;`);
  const baseline = JSON.parse(
    await readFile(
      "supabase/baseline/deployed-2026-10-26.catalog.json",
      "utf8",
    ),
  );
  await db.query(
    await readFile("supabase/baseline/deployed-2026-10-26.sql", "utf8"),
  );
  const captured = (
    await db.query(await readFile("scripts/sql/capture-baseline.sql", "utf8"))
  ).rows[0].baseline;
  for (const key of [
    "tables",
    "constraints",
    "indexes",
    "functions",
    "policies",
    "triggers",
    "views",
    "grants",
  ])
    assert.equal(
      captured[key].length,
      baseline[key].length,
      `Baseline ${key} count`,
    );
  for (const f of baseline.functions) {
    const restored = captured.functions.find((x) => x.name === f.name);
    assert.equal(
      restored.definition,
      f.definition,
      `Baseline function ${f.name}`,
    );
  }
  for (const t of baseline.tables)
    assert.deepEqual(
      captured.tables.find((x) => x.name === t.name),
      t,
      `Baseline table ${t.name}`,
    );
  assert.deepEqual(
    captured.policies,
    baseline.policies,
    "Baseline policy definitions",
  );
  assert.deepEqual(
    captured.constraints,
    baseline.constraints,
    "Baseline constraint definitions",
  );
  assert.deepEqual(
    captured.indexes,
    baseline.indexes,
    "Baseline index definitions",
  );
  assert.deepEqual(
    captured.triggers,
    baseline.triggers,
    "Baseline trigger definitions",
  );
  assert.deepEqual(captured.views, baseline.views, "Baseline view definitions");
  assert.deepEqual(
    captured.sequences,
    baseline.sequences,
    "Baseline sequence configuration",
  );
  assert.deepEqual(
    captured.grants,
    baseline.grants,
    "Baseline privilege grants",
  );
  assert.deepEqual(
    captured.reference_data,
    baseline.reference_data,
    "Baseline reference data",
  );
  results.push(
    "Baseline: all tables, constraints, indexes, functions, policies, triggers, view and grants restored; exact table/function/policy/grant/reference comparison passed.",
  );
  await assert.rejects(
    db.query(
      await readFile("supabase/baseline/deployed-2026-10-26.sql", "utf8"),
    ),
    /absent synapse schema/,
  );
  await db.query("ROLLBACK");
  results.push(
    "Baseline refuses replay into an existing schema without resetting it.",
  );
  for (const file of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql") && (phase2 || !f.includes("phase2_")))
    .sort()) {
    await db.query("BEGIN");
    try {
      await db.query(await readFile(`supabase/migrations/${file}`, "utf8"));
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
    results.push(`Applied local migration ${file}`);
  }
  for (const f of baseline.functions)
    assert.equal(
      (
        await db.query(
          "SELECT pg_get_functiondef($1::regprocedure) definition",
          [f.identity],
        )
      ).rows[0].definition,
      f.definition,
      `Legacy definition unchanged: ${f.name}`,
    );
  results.push(
    "All 30 legacy function definitions remain unchanged after correction.",
  );
  const test = await readFile(
    "supabase/tests/phase1-authorization.sql",
    "utf8",
  );
  const sequenceBefore = (
    await db.query(
      "SELECT last_value::text,is_called FROM synapse.cases_case_number_seq",
    )
  ).rows[0];
  const response = await db.query(test);
  const last = Array.isArray(response)
    ? response.findLast((r) => r.fields?.some((f) => f.name === "test"))
    : response;
  results.push(...(last?.rows?.map((r) => r.test) ?? []));
  if (phase2) {
    const review=await inspectSecurity(db);assert.ok(review.checks.every(c=>c.status==='pass'),'Current RPC owner/inheritance/grant inspection must pass locally');
    const p2 = await db.query(
      await readFile("supabase/tests/phase2-authorization.sql", "utf8"),
    );
    const r = p2.findLast((r) => r.fields?.some((f) => f.name === "test"));
    results.push(...r.rows.map((r) => "Phase 2: " + r.test));
  }
  assert.deepEqual(
    (
      await db.query(
        "SELECT last_value::text,is_called FROM synapse.cases_case_number_seq",
      )
    ).rows[0],
    sequenceBefore,
    "Authorization fixtures must not advance the case-number sequence",
  );
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM synapse.users")).rows[0].n,
    0,
    "Authorization fixtures rolled back",
  );
  assert.equal(
    (await db.query("SELECT read_enabled FROM synapse.phase1_access_config"))
      .rows[0].read_enabled,
    false,
    "Database gate still disabled",
  );
  results.push(
    "All fixtures rolled back, database gate remains disabled, and case-number sequence is unchanged.",
  );
  if (platform) {
    // Managed session semantics are simulated only in this disposable database.
    await db.query("CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL,not_after timestamptz,refresh_token text); ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY");
    await db.query("BEGIN");
    try {
      await db.query(await readFile("supabase/candidates/20261026140913_phase3_verified_session_liveness.sql", "utf8"));
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; }
    await db.query(await readFile("supabase/tests/phase3-session-liveness.sql", "utf8"));
    results.push("LOCAL CANDIDATE: provider-session deletion, different-subject session, provider expiry and helper grants pass; no hosted migration applied.");
    const { verifyLocalPlatform } = await import("./phase3-5/local-platform.ts");
    results.push(...await verifyLocalPlatform(db));
  }
  await mkdir(platform ? "docs/phase3-5" : phase2 ? "docs/phase2" : "docs/phase1", { recursive: true });
  const report = {
    checkedAt: new Date().toISOString(),
    postgres: (await db.query("show server_version")).rows[0].server_version,
    environment:
      "disposable loopback database; managed Auth helpers simulated; no real JWT issued",
    authorizationSqlSha256: createHash("sha256").update(test).digest("hex"),
    phase1FunctionHashes: Object.fromEntries(
      (
        await db.query(
          "SELECT p.proname, md5(pg_get_functiondef(p.oid)) AS hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='synapse' AND p.proname LIKE 'phase1_%') OR (n.nspname='public' AND p.proname LIKE 'synapse_phase1_%')",
        )
      ).rows.map((r) => [r.proname, r.hash]),
    ),
    results,
  };
  await writeFile(
    platform ? "docs/phase3-5/local-database-results.json" : phase2
      ? "docs/phase2/local-database-results.json"
      : "docs/phase1/local-database-results.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await db.end();
  // Only a fresh UUID-named database created by this invocation can be removed.
  if (!/^synapse_test_[a-f0-9]{32}$/.test(name))
    throw new Error("Unexpected disposable DB name");
  await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
  await admin.query("DROP ROLE IF EXISTS synapse_case_reader");
  if (phase2) await admin.query("DROP ROLE IF EXISTS synapse_session_revoker");
  if (platform) await admin.query("DROP ROLE IF EXISTS synapse_session_validator");
  await admin.end();
}
