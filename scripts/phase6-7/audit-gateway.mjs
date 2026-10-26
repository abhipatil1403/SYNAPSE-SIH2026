import assert from "node:assert/strict";
import { mkdir,writeFile } from "node:fs/promises";
import { operatorContext,safeMain } from "../phase2/operator.mjs";
safeMain(async()=>{
 const {db}=await operatorContext();const checks=[];
 const check=(id,value)=>{assert.ok(value,id);checks.push({id,status:"PASS"});console.log("PASS "+id);};
 try {
  await db.query("BEGIN READ ONLY");
  const functions=(await db.query(`select p.proname,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,
   has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,
   has_function_privilege('service_role',p.oid,'EXECUTE') service_role,has_function_privilege('synapse_web_gateway',p.oid,'EXECUTE') gateway
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='synapse_gateway' order by p.proname`)).rows;
  check('gateway_functions_fixed',functions.length===8&&functions.every(f=>f.prosecdef&&f.proconfig.includes('search_path=""')&&f.proconfig.includes('row_security=on')&&!f.anon&&!f.authenticated&&!f.service_role&&f.gateway===(!['account_locked_impl','archive_application'].includes(f.proname))));
  check('function_owners_restricted',functions.every(f=>f.owner===(f.proname==='read'?'synapse_case_reader':'synapse_account_manager')));
  const roles=(await db.query(`select rolname,rolsuper,rolinherit,rolbypassrls,rolcreaterole,rolcreatedb,rolcanlogin,
    exists(select from pg_class where relowner=r.oid and relkind='r') owns_table from pg_roles r where rolname in('synapse_web_login','synapse_web_gateway','synapse_account_manager','synapse_case_reader')`)).rows;
  check('gateway_roles_no_bypass',roles.length===4&&roles.every(r=>!r.rolsuper&&!r.rolinherit&&!r.rolbypassrls&&!r.rolcreaterole&&!r.rolcreatedb&&!r.owns_table&&r.rolcanlogin===(r.rolname==='synapse_web_login')));
  const facts=(await db.query(`select
   not has_schema_privilege('synapse_web_login','synapse','USAGE') login_no_sources,
   not has_schema_privilege('authenticated','synapse_gateway','USAGE') and not has_schema_privilege('anon','synapse_gateway','USAGE') api_no_gateway,
   not has_function_privilege('authenticated','public.synapse_phase1_cases(text,text,text,integer,integer,text)','EXECUTE') and not has_function_privilege('authenticated','public.synapse_phase1_me()','EXECUTE') direct_reads_revoked,
   not has_any_column_privilege('synapse_account_manager','synapse.cases','SELECT') and not has_any_column_privilege('synapse_account_manager','synapse.documents','SELECT') manager_no_complaints,
   (select bool_and(c.relrowsecurity and c.relforcerowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='synapse_gateway' and c.relkind='r') private_tables_force_rls,
   not pg_has_role('synapse_web_login','synapse_case_reader','MEMBER') and not pg_has_role('synapse_web_login','synapse_account_manager','MEMBER') no_owner_assumption,
   (select read_enabled from synapse.phase1_access_config) read_enabled,(select read_until from synapse.phase1_access_config) read_until,
   (select count(*)::int from synapse.user_role_assignments a join synapse.roles r using(role_id) join synapse.users u using(user_id) where r.role_code='SYSTEM_ADMIN' and a.scope_type='GLOBAL' and u.account_status='ACTIVE' and a.valid_from<=now() and (a.valid_until is null or a.valid_until>now())) active_global_admins`)).rows[0];
  for(const id of ['login_no_sources','api_no_gateway','direct_reads_revoked','manager_no_complaints','private_tables_force_rls','no_owner_assumption'])check(id,facts[id]);
  check('closed_read_gate',facts.read_enabled===false&&facts.read_until===null);
  await db.query('ROLLBACK');
  await mkdir('docs/phase6-7',{recursive:true});await writeFile('docs/phase6-7/gateway-audit-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,functions,roles,facts},null,2));
 }finally{await db.end();}
});
