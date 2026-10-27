import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {operatorContext,safeMain} from '../phase2/operator.mjs';
const file='20261027124140_phase11_readonly_workspace.sql';
safeMain(async()=>{
 if(!process.argv.includes('--apply-reviewed'))throw Error('EXACT_REVIEWED_APPLY_REQUIRED');
 const sql=await readFile('supabase/candidates/'+file,'utf8'),committed=await readFile('supabase/migrations/'+file,'utf8'),sha256=createHash('sha256').update(sql).digest('hex'),local=JSON.parse(await readFile('docs/phase2/local-database-results.json','utf8'));
 assert.equal(committed,sql);assert.equal(local.workspaceSha256,sha256);assert.ok(Date.now()-Date.parse(local.checkedAt)<3600000&&local.results.some(r=>r.startsWith('LOCAL WORKSPACE:')));
 const {db}=await operatorContext();
 const legacy=async()=>JSON.stringify((await db.query("SELECT p.proname,md5(pg_get_functiondef(p.oid)) hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='synapse' ORDER BY p.oid")).rows);
 const counts=async()=>JSON.stringify((await db.query('SELECT (SELECT count(*) FROM synapse.cases)::text cases,(SELECT count(*) FROM synapse.documents)::text documents,(SELECT count(*) FROM synapse.case_work_items)::text tasks')).rows[0]);
 try{
  await db.query("BEGIN; SET LOCAL lock_timeout='5s'");
  try{
   await db.query("SELECT pg_advisory_xact_lock(hashtext('synapse-phase11-readonly-review'))");
   const gate=(await db.query('SELECT read_enabled,read_until FROM synapse.phase1_access_config FOR UPDATE')).rows[0];assert.equal(gate.read_enabled,false);assert.equal(gate.read_until,null);
   const priorLegacy=await legacy(),priorCounts=await counts(),prior=(await db.query('SELECT statements FROM supabase_migrations.schema_migrations WHERE version=$1',[file.slice(0,14)])).rows[0];
   if(prior)assert.equal(prior.statements.join('').replaceAll('\r\n','\n').trim(),sql.replaceAll('\r\n','\n').trim());
   else{await db.query(sql);await db.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)',[file.slice(0,14),file.slice(15,-4),[sql.trim()]]);}
   const f=(await db.query("SELECT pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service,has_function_privilege('synapse_web_gateway',p.oid,'EXECUTE') gateway FROM pg_proc p WHERE p.oid='synapse_gateway.workspace(jsonb)'::regprocedure")).rows[0];
   assert.equal(f.owner,'synapse_case_reader');assert.ok(f.prosecdef&&f.proconfig.includes('search_path=""')&&f.proconfig.includes('row_security=on')&&!f.anon&&!f.authenticated&&!f.service&&f.gateway);
   const safe=(await db.query("SELECT NOT r.rolsuper AND NOT r.rolcanlogin AND NOT r.rolbypassrls AND NOT r.rolinherit AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid AND relkind='r') owner_safe,NOT has_schema_privilege('synapse_web_login','synapse','USAGE') restricted_login,NOT has_any_column_privilege('synapse_case_reader','synapse.documents','SELECT') no_documents,NOT has_any_column_privilege('synapse_case_reader','synapse.cases','INSERT,UPDATE') no_writes FROM pg_roles r WHERE rolname='synapse_case_reader'")).rows[0];assert.ok(Object.values(safe).every(v=>v===true));
   assert.equal(await legacy(),priorLegacy);assert.equal(await counts(),priorCounts);assert.deepEqual((await db.query('SELECT read_enabled,read_until FROM synapse.phase1_access_config')).rows[0],gate);
   await db.query('COMMIT');
   await mkdir('docs/phase11',{recursive:true});await writeFile('docs/phase11/MIGRATION_REVIEW.json',JSON.stringify({checkedAt:new Date().toISOString(),migration:file,sha256,localAuthorizationPassed:true,hostedApplied:true,function:f,checks:safe,legacyFunctionsUnchanged:true,businessCountsUnchanged:true,gateEnabled:false,businessWritesEnabled:false,scope:'Private account-only fallback plus expiring read-only case/institution/case-SLA projection; no managed Auth, public RPC grant or activation change'},null,2)+'\n');
   console.log('PASS reviewed private read-only workspace migration applied. Original functions/business counts unchanged; case read lease remains OFF and no complaint write permission was added.');
  }catch(e){await db.query('ROLLBACK');throw e;}
 }finally{await db.end();}
});
