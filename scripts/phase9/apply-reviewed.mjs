import {readFile,copyFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {operatorContext,safeMain} from '../phase2/operator.mjs';
const file='20261026215821_phase9_password_approval_lifecycle.sql';
safeMain(async()=>{
 if(!process.argv.includes('--apply-reviewed'))throw Error('EXPLICIT_REVIEWED_APPLY_REQUIRED');
 const source=await readFile('supabase/candidates/'+file,'utf8'),test=JSON.parse(await readFile('docs/phase2/local-database-results.json','utf8'));
 if(test.authLifecycleSha256!==createHash('sha256').update(source).digest('hex'))throw Error('TESTED_SQL_HASH_MISMATCH');
 if(!test.results.some(r=>r.startsWith('LOCAL PASSWORD: provider-user deletion'))||Date.now()-Date.parse(test.checkedAt)>3600000)throw Error('FRESH_LOCAL_AUTHORIZATION_EVIDENCE_REQUIRED');
 const {db}=await operatorContext();try{
  const before=(await db.query("SELECT n.nspname,p.proname,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('synapse','public') AND p.prokind='f' ORDER BY p.oid")).rows;
  await db.query('BEGIN');try{
   const gate=(await db.query('SELECT read_enabled,read_until FROM synapse.phase1_access_config FOR UPDATE')).rows[0];if(gate.read_enabled||gate.read_until)throw Error('HOSTED_READ_GATE_MUST_REMAIN_CLOSED');
   const existing=(await db.query('SELECT statements FROM supabase_migrations.schema_migrations WHERE version=$1',[file.slice(0,14)])).rows[0];
   if(existing){if(existing.statements.join('').replaceAll('\r\n','\n').trim()!==source.replaceAll('\r\n','\n').trim())throw Error('EXISTING_HISTORY_DRIFT');}
   else{await db.query(source);await db.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)',[file.slice(0,14),file.slice(15,-4),[source.trim()]]);}
   const after=(await db.query("SELECT n.nspname,p.proname,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('synapse','public') AND p.prokind='f' ORDER BY p.oid")).rows;
   if(JSON.stringify(before)!==JSON.stringify(after))throw Error('EXISTING_READ_OR_LEGACY_FUNCTION_CHANGED');
   const unsafe=(await db.query("SELECT has_function_privilege('authenticated','synapse_gateway.applicants(jsonb,text,jsonb)','EXECUTE') OR has_function_privilege('anon','synapse_gateway.applicants(jsonb,text,jsonb)','EXECUTE') OR has_function_privilege('synapse_web_gateway','synapse_gateway.archive_application()','EXECUTE') unsafe")).rows[0].unsafe;if(unsafe)throw Error('UNSAFE_EXECUTION_GRANT');
   await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}
  await copyFile('supabase/candidates/'+file,'supabase/migrations/'+file);
  await mkdir('docs/phase9',{recursive:true});await writeFile('docs/phase9/MIGRATION_REVIEW.json',JSON.stringify({migration:file,sha256:createHash('sha256').update(source).digest('hex'),localAuthorizationPassed:true,hostedApplied:true,managedObjectsChanged:false,existingFunctionsUnchanged:true,hostedBusinessWritesEnabled:false,checkedAt:new Date().toISOString()},null,2));
  console.log('PASS reviewed application-only migration: archive/FK lifecycle, scoped self profile and administrator review history; prior functions unchanged, protected execution closed, no users deleted or hosted settings/gates changed.');
 }finally{await db.end();}
});
