import { readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash, randomBytes, createHmac, pbkdf2Sync } from "node:crypto";
import { operatorContext, safeMain } from "../phase2/operator.mjs";
import { saveVault, loadVault } from "../phase2/vault.mjs";
import { inspectSecurity } from "../phase2/security.mjs";
// Send only a SCRAM verifier in role DDL, never a plaintext runtime password.
function scramVerifier(password) {
  const salt=randomBytes(16), salted=pbkdf2Sync(password,salt,4096,32,"sha256");
  const clientKey=createHmac("sha256",salted).update("Client Key").digest();
  const storedKey=createHash("sha256").update(clientKey).digest("base64");
  const serverKey=createHmac("sha256",salted).update("Server Key").digest("base64");
  return `SCRAM-SHA-256$4096:${salt.toString("base64")}$${storedKey}:${serverKey}`;
}

// Explicit authorized application-schema correction only. Never touches auth.*.
safeMain(async () => {
  if (!process.argv.includes("--apply-reviewed")) throw Error("Select --apply-reviewed after reviewing docs/phase6-7/AUTH_SECURITY_REVIEW.md.");
  const file = "20261026155044_phase6_server_auth_gateway.sql", source = await readFile("supabase/candidates/" + file, "utf8");
  const review = JSON.parse(await readFile("docs/phase6-7/gateway-review.json", "utf8"));
  if (review.sha256 !== createHash("sha256").update(source).digest("hex") || !review.localAuthorizationPassed || review.managedObjectsChanged !== false) throw Error("Reviewed source/test evidence mismatch.");
  const { db } = await operatorContext();
  try {
    const gate = (await db.query("SELECT read_enabled,read_until FROM synapse.phase1_access_config")).rows[0];
    if (gate.read_enabled || gate.read_until) throw Error("Both read gates must remain off before this correction.");
    const existing = (await db.query("SELECT statements FROM supabase_migrations.schema_migrations WHERE version=$1", [file.slice(0,14)])).rows;
    if (existing.length && existing[0].statements.join("").replaceAll("\r\n","\n").trim() !== source.replaceAll("\r\n","\n").trim()) throw Error("Existing history differs; no automatic repair allowed.");
    let privateConfig;
    try { privateConfig = await loadVault(".local/phase2/auth-gateway.vault"); } catch { /* A new login is created only when no prior role exists. */ }
    const roleExists = (await db.query("SELECT 1 FROM pg_roles WHERE rolname='synapse_web_login'")).rowCount;
    if (roleExists && !privateConfig) throw Error("Existing gateway login without its private vault; operator reconciliation required.");
    if (!roleExists) {
      const password = randomBytes(48).toString("base64url"), url = new URL(process.env.DATABASE_URL);
      url.protocol = "postgresql:";
      url.username = url.hostname.startsWith("db.") ? "synapse_web_login" : "synapse_web_login.xjnukuerzlrxjjqwmgkn"; url.password = password;
      privateConfig = { password, connectionString: url.toString(), rateSecret: randomBytes(48).toString("hex") };
      // Crash recovery retains the planned private credential; never printed.
      await saveVault(".local/phase2/auth-gateway.vault", privateConfig);
    }
    const rotate=roleExists&&process.argv.includes("--rotate-runtime-credential");
    if(rotate){const password=randomBytes(48).toString("base64url"),url=new URL(privateConfig.connectionString);url.password=password;
      privateConfig={...privateConfig,password,connectionString:url.toString()};await saveVault(".local/phase2/auth-gateway-next.vault",privateConfig);}
    await db.query("BEGIN");
    try {
      if (!existing.length) {
        const security = await inspectSecurity(db); if (!security.checks.every((c) => c.status === "pass")) throw Error("Existing read-RPC drift requires review.");
        await db.query(source);
        await db.query("INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)", [file.slice(0,14), file.slice(15,-4), [source.trim()]]);
      }
      if (!roleExists) {
        if (!/^[A-Za-z0-9_-]{64}$/.test(privateConfig.password)) throw Error("Unexpected generated credential format.");
        await db.query(`CREATE ROLE synapse_web_login LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 10 PASSWORD '${scramVerifier(privateConfig.password)}'`);
        await db.query("GRANT synapse_web_gateway TO synapse_web_login WITH INHERIT FALSE,SET TRUE");
        await db.query("ALTER ROLE synapse_web_login SET statement_timeout='5s'; ALTER ROLE synapse_web_login SET idle_in_transaction_session_timeout='10s'");
      }
      if(rotate)await db.query(`ALTER ROLE synapse_web_login PASSWORD '${scramVerifier(privateConfig.password)}'`);
      for (const correction of review.corrections ?? []) {
        const sql = await readFile("supabase/candidates/" + correction.file, "utf8");
        if (!correction.localAuthorizationPassed || createHash("sha256").update(sql).digest("hex") !== correction.sha256) throw Error("Correction hash/test review mismatch.");
        const history = (await db.query("SELECT statements FROM supabase_migrations.schema_migrations WHERE version=$1", [correction.file.slice(0,14)])).rows;
        if (history.length) { if (history[0].statements.join("").replaceAll("\r\n","\n").trim() !== sql.replaceAll("\r\n","\n").trim()) throw Error("Correction history drift."); }
        else { await db.query(sql); await db.query("INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)", [correction.file.slice(0,14),correction.file.slice(15,-4),[sql.trim()]]); }
      }
      const security = await inspectSecurity(db); if (!security.checks.every((c) => c.status === "pass")) throw Error("Post-correction read-RPC review failed.");
      const unsafe = (await db.query(`SELECT has_schema_privilege('synapse_web_login','synapse','USAGE') OR pg_has_role('synapse_web_login','synapse_case_reader','MEMBER') OR pg_has_role('synapse_web_login','synapse_account_manager','MEMBER') AS unsafe`)).rows[0].unsafe;
      if (unsafe) throw Error("Gateway login has unexpected source privileges.");
      await db.query("COMMIT");
    } catch (e) { await db.query("ROLLBACK"); throw e; }
    await saveVault(".local/phase2/auth-gateway.vault",privateConfig);
    await writeFile(".env.gateway.local", `# Restricted web runtime only. No operator key. Ignored by Git.\nSYNAPSE_GATEWAY_DATABASE_URL=${privateConfig.connectionString}\nSYNAPSE_GATEWAY_CA_FILE=${resolve(process.env.SUPABASE_DB_CA_FILE || ".local/phase2/supabase-db-root.crt").replaceAll("\\","/")}\nSYNAPSE_AUTH_RATE_SECRET=${privateConfig.rateSecret}\nSYNAPSE_SIGNUP_ENABLED=false\n`, { mode: 0o600 });
    await copyFile("supabase/candidates/" + file, "supabase/migrations/" + file);
    for (const correction of review.corrections ?? []) await copyFile("supabase/candidates/" + correction.file, "supabase/migrations/" + correction.file);
    console.log("PASS: reviewed application gateway migration/history committed; restricted runtime configuration written locally; no protected Auth object, record, membership or read gate changed.");
  } finally { await db.end(); }
});
