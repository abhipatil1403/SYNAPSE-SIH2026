import {readFile,copyFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {operatorContext,safeMain} from '../phase2/operator.mjs';
const file='20261027075125_phase10_self_profile.sql';
safeMain(async()=>{
 if(!process.argv.includes('--apply-reviewed'))throw Error('EXPLICIT_REVIEWED_APPLY_REQUIRED');
 const sql=await readFile('supabase/candidates/'+file,'utf8'),hash=createHash('sha256').update(sql).digest('hex'),test=JSON.parse(await readFile('docs/phase2/local-database-results.json','utf8'));
 if(test.profileSha256!==hash||!test.results.some(r=>r.startsWith('LOCAL PROFILE:'))||Date.now()-Date.parse(test.checkedAt)>3600000)throw Error('FRESH_EXACT_PROFILE_AUTHORIZATION_EVIDENCE_REQUIRED');
 const {db}=await operatorContext();try{await db.query('BEGIN');try{
  const gate=(await db.query('SELECT read_enabled,read_until FROM synapse.phase1_access_config FOR UPDATE')).rows[0];if(gate.read_enabled||gate.read_until)throw Error('HOSTED_READ_GATE_MUST_REMAIN_CLOSED');
  const prior=(await db.query("SELECT statements FROM supabase_migrations.schema_migrations WHERE version=$1",[file.slice(0,14)])).rows[0];
  if(prior){if(prior.statements.join('').replaceAll('\r\n','\n').trim()!==sql.replaceAll('\r\n','\n').trim())throw Error('MIGRATION_HISTORY_DRIFT');}
  else{await db.query(sql);await db.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)',[file.slice(0,14),file.slice(15,-4),[sql.trim()]]);}
  const unsafe=(await db.query("SELECT has_function_privilege('anon','synapse_gateway.profile(jsonb,jsonb)','EXECUTE') OR has_function_privilege('authenticated','synapse_gateway.profile(jsonb,jsonb)','EXECUTE') OR has_function_privilege('service_role','synapse_gateway.profile(jsonb,jsonb)','EXECUTE') OR has_schema_privilege('synapse_web_login','synapse','USAGE') unsafe")).rows[0].unsafe;if(unsafe)throw Error('UNSAFE_PROFILE_PERMISSION');
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}
 await copyFile('supabase/candidates/'+file,'supabase/migrations/'+file);await mkdir('docs/phase10',{recursive:true});await writeFile('docs/phase10/PROFILE_MIGRATION_REVIEW.json',JSON.stringify({migration:file,sha256:hash,localAuthorizationPassed:true,hostedApplied:true,scope:'Self display-name only, audited private gateway; no managed Auth or complaint writes',readGateEnabled:false,checkedAt:new Date().toISOString()},null,2));console.log('PASS reviewed self-profile migration applied; browser execution closed, hosted business writes and read activation remain off.');
 }finally{await db.end();}
});
