import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { operatorContext, safeMain, writeReport, projectRef } from "./operator.mjs";

// Read-only independent catalog capture; no table row payloads or managed secrets.
safeMain(async () => {
  const { db } = await operatorContext();
  try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const functions = (await db.query(`SELECT n.nspname schema,p.proname name,p.oid::regprocedure::text identity,
      pg_get_functiondef(p.oid) definition,p.prosecdef security_definer,p.proowner::regrole::text owner,p.proconfig config,
      has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,
      has_function_privilege('service_role',p.oid,'EXECUTE') service_role,
      has_function_privilege('synapse_case_reader',p.oid,'EXECUTE') reader,
      has_function_privilege('synapse_session_revoker',p.oid,'EXECUTE') revoker
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='synapse'
      OR (n.nspname='public' AND p.proname LIKE 'synapse_%') ORDER BY n.nspname,p.proname`)).rows;
    const policies = (await db.query("SELECT schemaname,tablename,policyname,permissive,roles::text[],cmd,qual,with_check FROM pg_policies WHERE schemaname IN ('synapse','public') ORDER BY schemaname,tablename,policyname")).rows;
    const roles = (await db.query("SELECT rolname,rolsuper,rolcanlogin,rolinherit,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname IN ('synapse_case_reader','synapse_session_revoker','synapse_app','synapse_ingest','anon','authenticated','service_role') ORDER BY rolname")).rows;
    const memberships = (await db.query("SELECT roleid::regrole::text role,member::regrole::text member,grantor::regrole::text grantor,admin_option,inherit_option,set_option FROM pg_auth_members WHERE roleid IN (SELECT oid FROM pg_roles WHERE rolname LIKE 'synapse_%') OR member IN (SELECT oid FROM pg_roles WHERE rolname LIKE 'synapse_%') ORDER BY role,member,grantor")).rows;
    const tables = (await db.query("SELECT n.nspname schema,c.relname name,c.relowner::regrole::text owner,c.relrowsecurity rls,c.relforcerowsecurity force_rls,c.relkind kind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('synapse','public') AND c.relkind IN ('r','v','m','f') ORDER BY n.nspname,c.relname")).rows;
    const schema = (await db.query("SELECT r.rolname role,has_schema_privilege(r.oid,'synapse','USAGE') synapse_usage,has_schema_privilege(r.oid,'auth','USAGE') auth_usage,has_schema_privilege(r.oid,'public','CREATE') public_create FROM pg_roles r WHERE rolname IN ('anon','authenticated','service_role','synapse_case_reader','synapse_session_revoker') ORDER BY role")).rows;
    const functionGrants = (await db.query(`SELECT n.nspname schema,p.proname object,
      CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END grantee,a.privilege_type privilege,a.is_grantable
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE (n.nspname='synapse' OR (n.nspname='public' AND p.proname LIKE 'synapse_%')) AND a.grantee<>p.proowner
      ORDER BY schema,object,grantee,privilege`)).rows;
    const columnGrants = (await db.query(`SELECT c.relname object,a.attname column_name,r.rolname role,
      has_column_privilege(r.oid,c.oid,a.attnum,'SELECT') can_select,has_column_privilege(r.oid,c.oid,a.attnum,'INSERT') can_insert,
      has_column_privilege(r.oid,c.oid,a.attnum,'UPDATE') can_update FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped CROSS JOIN pg_roles r WHERE n.nspname='synapse'
      AND c.relkind IN ('r','v') AND r.rolname IN ('anon','authenticated','synapse_case_reader','synapse_session_revoker')
      AND has_column_privilege(r.oid,c.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES') ORDER BY object,column_name,role`)).rows;
    const advisor0029Equivalent = (await db.query(`SELECT n.nspname schema,p.proname function,pg_get_function_identity_arguments(p.oid) arguments
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prosecdef AND has_function_privilege('authenticated',p.oid,'EXECUTE')
      AND n.nspname='public' ORDER BY function,arguments`)).rows;
    const baseline = JSON.parse(await readFile("supabase/baseline/deployed-2026-10-26.catalog.json", "utf8"));
    const legacy = [];
    for (const fn of baseline.functions) {
      const current = (await db.query("SELECT pg_get_functiondef($1::regprocedure) definition", [fn.identity])).rows[0].definition;
      legacy.push({ identity: fn.identity, unchanged: current === fn.definition, sha256: createHash("sha256").update(current).digest("hex") });
    }
    const gate = (await db.query("SELECT read_enabled,read_until::text FROM synapse.phase1_access_config WHERE singleton")).rows[0];
    await db.query("COMMIT");
    await writeReport("signoff-catalog.json", { version: 1, projectRef, checkedAt: new Date().toISOString(),
      source: "Current authorized operator catalogs over verified TLS; repeatable-read READ ONLY transaction",
      functions, policies, roles, memberships, tables, schema, functionGrants, columnGrants, legacy, gate,
      managedAdvisor: "ADVISOR UNAVAILABLE: connector returned permission denied",
      advisor0029Equivalent, advisorEquivalentScope: "Current public-schema authenticated SECURITY DEFINER catalog predicate; actual private-schema denial is also tested via hosted Data API. This is not a managed-advisor run." });
    console.log(`Captured ${functions.length} functions, ${policies.length} policies, effective grants and ${legacy.length} original function comparisons. Managed advisor remains unavailable.`);
  } finally { await db.query("ROLLBACK").catch(() => {}); await db.end(); }
});
