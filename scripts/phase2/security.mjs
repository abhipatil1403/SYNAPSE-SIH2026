// Only fixed catalog queries; no user data, passwords, JWTs or database URL in reports.
export async function inspectSecurity(db) {
  const { rows } =
    await db.query(`SELECT p.proname,p.proowner::regrole::text owner,p.prosecdef,p.proconfig,
    r.rolcanlogin,r.rolinherit,r.rolbypassrls,
    has_function_privilege('anon',p.oid,'EXECUTE') anon,
    has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,
    has_function_privilege('service_role',p.oid,'EXECUTE') service_role,
    EXISTS(SELECT FROM pg_class c WHERE c.relowner=p.proowner AND c.relkind='r') owns_tables,
    EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE' AND a.grantee NOT IN (p.proowner,'authenticated'::regrole::oid)) unexpected_execute_grants
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
    WHERE n.nspname='public' AND p.proname IN ('synapse_phase1_me','synapse_phase1_cases') ORDER BY p.proname`);
  const {
    rows: [facts],
  } = await db.query(`SELECT
    NOT has_schema_privilege('authenticated','synapse','USAGE') AND NOT has_schema_privilege('anon','synapse','USAGE') private_schema,
    NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='synapse' AND c.relkind='r' AND has_any_column_privilege('synapse_case_reader',c.oid,'SELECT') AND NOT c.relrowsecurity) source_rls,
    NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='synapse' AND c.relkind='r' AND (has_any_column_privilege('synapse_case_reader',c.oid,'INSERT,UPDATE,REFERENCES') OR has_table_privilege('synapse_case_reader',c.oid,'DELETE,TRUNCATE,TRIGGER'))) reader_no_writes,
    NOT EXISTS(SELECT FROM pg_auth_members WHERE member='synapse_case_reader'::regrole AND (inherit_option OR set_option)) reader_no_inherited_roles,
    NOT pg_has_role('authenticated','synapse_case_reader','MEMBER') AND NOT pg_has_role('anon','synapse_case_reader','MEMBER') api_cannot_assume_reader,
    (SELECT read_enabled FROM synapse.phase1_access_config) database_gate`);
  const ownership =
    rows.length === 2 &&
    rows.every(
      (r) =>
        r.owner === "synapse_case_reader" &&
        r.prosecdef &&
        !r.rolcanlogin &&
        !r.rolinherit &&
        !r.rolbypassrls &&
        !r.owns_tables &&
        r.proconfig?.includes("row_security=on") &&
        r.proconfig?.includes('search_path=""'),
    ) &&
    facts.source_rls &&
    facts.reader_no_writes && facts.reader_no_inherited_roles;
  const grants =
    rows.length === 2 &&
    rows.every((r) => !r.anon && r.authenticated && !r.service_role && !r.unexpected_execute_grants) &&
    facts.private_schema && facts.api_cannot_assume_reader;
  return {
    checkedAt: new Date().toISOString(),
    rpc: rows,
    facts,
    checks: [
      {
        id: "rpc_ownership_rls",
        status: ownership ? "pass" : "fail",
        detail: ownership
          ? "Both read RPCs use a restricted NOBYPASSRLS owner and RLS-protected sources."
          : "RPC ownership, configuration or RLS failed verification.",
        source: "Current deployed PostgreSQL catalogs",
      },
      {
        id: "rpc_execution_grants",
        status: grants ? "pass" : "fail",
        detail: grants
          ? "Only signed-in users can invoke read RPCs; private schema remains inaccessible."
          : "An unexpected API grant or schema privilege was observed.",
        source: "Current effective PostgreSQL grants",
      },
    ],
  };
}
