import pg from "pg";
import assert from "node:assert/strict";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import {inspectSecurity} from './phase2/security.mjs';

// Catalog row ordering depends on the database's OS/locale collation. Compare
// these unordered collections by stable identities, retaining every original
// row field and all semantically ordered arrays (notably table columns).
function orderRows(rows, keys) {
  return [...rows].sort((left, right) => {
    for (const key of keys) {
      if (left[key] < right[key]) return -1;
      if (left[key] > right[key]) return 1;
    }
    return 0;
  });
}

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
const sla = process.argv.includes("--sla");
const platform = process.argv.includes("--platform") || sla;
const operations=process.argv.includes("--operations");
const auth = process.argv.includes("--auth")||operations;
const phase2 = process.argv.includes("--phase2") || platform || auth;
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
  for (const [collection, keys] of [
    ["policies", ["schemaname", "tablename", "policyname"]],
    ["constraints", ["table", "name"]],
    ["indexes", ["name"]],
    ["triggers", ["table", "name"]],
    ["views", ["name"]],
    ["sequences", ["name"]],
    ["grants", ["kind", "object", "grantee", "privilege"]],
  ]) {
    assert.deepEqual(
      orderRows(captured[collection], keys),
      orderRows(baseline[collection], keys),
      `Baseline ${collection}: exact definitions independent of catalog collation`,
    );
  }
  assert.deepEqual(
    Object.keys(captured.reference_data).sort(),
    Object.keys(baseline.reference_data).sort(),
    "Baseline reference collections",
  );
  for (const [collection, keys] of [
    ["roles", ["role_id"]],
    ["permissions", ["permission_id"]],
    ["role_permissions", ["role_id", "permission_id"]],
    ["case_statuses", ["status_code"]],
    ["case_relationship_types", ["relationship_type"]],
  ]) {
    assert.deepEqual(
      orderRows(captured.reference_data[collection], keys),
      orderRows(baseline.reference_data[collection], keys),
      `Baseline reference data: ${collection}`,
    );
  }
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
    // Historical authorization suites run against their own migration boundary;
    // the gateway correction and its inverse direct-RPC assertions run afterward.
    .filter((f) => f.endsWith(".sql") && !f.includes("phase6_") && !f.includes("phase9_") && !f.includes("phase10_") && !f.includes("phase11_") && !f.includes("phase14_") && !f.includes("phase15_") && !f.includes("phase16_") && (phase2 || !f.includes("phase2_")))
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
    if (sla) {
      await db.query("BEGIN");
      try { await db.query(await readFile("supabase/candidates/20261026163237_phase7_scoped_sla_worker.sql", "utf8")); await db.query("COMMIT"); }
      catch (error) { await db.query("ROLLBACK"); throw error; }
      const { verifySlaWorker } = await import("./phase6-7/local-sla.ts");
      results.push(...await verifySlaWorker(db));
    }
  }
  if (auth) {
    await db.query("BEGIN");
    try {
      await db.query(await readFile("supabase/candidates/20261026155044_phase6_server_auth_gateway.sql", "utf8"));
      await db.query(await readFile("supabase/candidates/20261026161408_phase6_approval_authority_lock.sql", "utf8"));
      await db.query(await readFile("supabase/candidates/20261026165409_phase6_officer_bureau_scope.sql", "utf8"));
      await db.query(await readFile("supabase/candidates/20261026170514_phase6_approval_input_guard.sql", "utf8"));
      await db.query(await readFile("supabase/candidates/20261026173434_phase6_admin_memberships.sql", "utf8"));
      await db.query(await readFile("supabase/candidates/20261026191333_phase6_admin_role_assignments.sql", "utf8"));
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; }
    await db.query(await readFile("supabase/candidates/20261026215821_phase9_password_approval_lifecycle.sql", "utf8"));
    await db.query('BEGIN');try{await db.query(await readFile('supabase/candidates/20261027075125_phase10_self_profile.sql','utf8'));await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}
    const {verifySelfProfile}=await import('./phase10/local-profile.ts');results.push(...await verifySelfProfile(db));
    const { verifyAuthGateway } = await import("./phase6-7/local-auth.ts");
    results.push(...await verifyAuthGateway(db));
    await db.query('BEGIN');try{await db.query(await readFile('supabase/candidates/20261027124140_phase11_readonly_workspace.sql','utf8'));await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}
    const {verifyReadonlyWorkspace}=await import('./phase11/local-workspace.ts');results.push(...await verifyReadonlyWorkspace(db));
  }
  if(operations){
    const migration=(await readdir('supabase/candidates')).find(n=>n.endsWith('_phase14_canonical_operations.sql'));
    await db.query('BEGIN');try{await db.query(await readFile('supabase/candidates/'+migration,'utf8'));await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}
    const gmail=(await readdir('supabase/candidates')).find(n=>n.endsWith('_phase15_hosted_gmail_oauth.sql'));
    await db.query('BEGIN');try{await db.query(await readFile('supabase/candidates/'+gmail,'utf8'));await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}
    await db.query('BEGIN');try{await db.query(await readFile('supabase/candidates/20261027185138_phase15_active_intake_bureau.sql','utf8'));await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}
    await db.query('BEGIN');try{await db.query(await readFile('supabase/candidates/20261027193348_phase16_processing_and_discovery.sql','utf8'));await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}
    await db.query('BEGIN');try{await db.query(await readFile('supabase/candidates/20261027194500_phase16_private_attachment_scanning.sql','utf8'));await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}
    await db.query('BEGIN');try{await db.query(await readFile('supabase/candidates/20261027200002_phase16_hosted_deadline_notifications.sql','utf8'));await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}
    const {verifyCanonicalOperations}=await import('./phase14/test-canonical.ts');results.push(...await verifyCanonicalOperations(db,parsed.toString()));
  }
  await mkdir(platform ? "docs/phase3-5" : phase2 ? "docs/phase2" : "docs/phase1", { recursive: true });
  const report = {
    checkedAt: new Date().toISOString(),
    realDevelopmentProviderChecks:operations&&process.argv.includes('--real-providers'),
    operationsSha256:operations?createHash('sha256').update(await readFile('supabase/candidates/20261027171357_phase14_canonical_operations.sql','utf8')).digest('hex'):null,
    gmailSha256:operations?createHash('sha256').update(await readFile('supabase/candidates/20261027174828_phase15_hosted_gmail_oauth.sql','utf8')).digest('hex'):null,
    gmailAuthoritySha256:operations?createHash('sha256').update(await readFile('supabase/candidates/20261027185138_phase15_active_intake_bureau.sql','utf8')).digest('hex'):null,
    processingSha256:operations?createHash('sha256').update(await readFile('supabase/candidates/20261027193348_phase16_processing_and_discovery.sql','utf8')).digest('hex'):null,
    scannerSha256:operations?createHash('sha256').update(await readFile('supabase/candidates/20261027194500_phase16_private_attachment_scanning.sql','utf8')).digest('hex'):null,
    deadlineSha256:operations?createHash('sha256').update(await readFile('supabase/candidates/20261027200002_phase16_hosted_deadline_notifications.sql','utf8')).digest('hex'):null,
    profileSha256:auth?createHash("sha256").update(await readFile("supabase/candidates/20261027075125_phase10_self_profile.sql","utf8")).digest("hex"):null,
    workspaceSha256:auth?createHash("sha256").update(await readFile("supabase/candidates/20261027124140_phase11_readonly_workspace.sql","utf8")).digest("hex"):null,
    authLifecycleSha256:auth?createHash("sha256").update(await readFile("supabase/candidates/20261026215821_phase9_password_approval_lifecycle.sql","utf8")).digest("hex"):null,
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
    operations ? "docs/phase14/local-database-results.json" : platform ? "docs/phase3-5/local-database-results.json" : phase2
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
  if (auth) await admin.query("DROP ROLE IF EXISTS synapse_web_gateway,synapse_account_manager");
  if(operations)await admin.query("DROP ROLE IF EXISTS synapse_operations_test_login,synapse_operations_runtime,synapse_gmail_test_login,synapse_gmail_manager,synapse_discovery_reader,synapse_deadline_test_login,synapse_deadline_notifier");
  if (sla) await admin.query("DROP ROLE IF EXISTS synapse_sla_worker");
  await admin.end();
}
