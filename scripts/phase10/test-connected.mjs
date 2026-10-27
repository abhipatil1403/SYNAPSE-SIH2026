// Actual hosted Auth + original production UI + a disposable PostgreSQL database.
// No business rows are seeded. Every business record is created through the UI.
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import pg from 'pg';
import {operatorContext,safeMain} from '../phase2/operator.mjs';
safeMain(async()=>{
 await access('.next/BUILD_ID');
 let occupied=false;try{await fetch('http://localhost:3002/login',{signal:AbortSignal.timeout(1000)});occupied=true;}catch{}
 if(occupied)throw Error('DEDICATED_BROWSER_PORT_ALREADY_IN_USE');
 const root=new URL(process.env.SYNAPSE_TEST_DATABASE_URL??'postgresql://postgres@127.0.0.1:55432/postgres');
 if(!['127.0.0.1','localhost'].includes(root.hostname))throw Error('DISPOSABLE_LOOPBACK_REQUIRED');
 const name='synapse_workbench_'+randomBytes(6).toString('hex'),environment=randomUUID(),password=randomBytes(36).toString('base64url'),admin=new pg.Client({connectionString:root.href});
 let db,web,created=false,stage='test_database';await admin.connect();
 try{
  if((await admin.query("SELECT 1 FROM pg_roles WHERE rolname='synapse_workbench_login'")).rowCount)throw Error('DEDICATED_TEST_CLUSTER_BUSY');
  await admin.query('CREATE DATABASE '+name);created=true;root.pathname='/'+name;db=new pg.Client({connectionString:root.href});await db.connect();
  const sql=await readFile('supabase/candidates/20261026200946_phase8_isolated_workbench.sql','utf8'),fix=await readFile('supabase/candidates/20261026202545_phase8_workbench_owner_schema_usage.sql','utf8'),indexes=await readFile('supabase/candidates/20261026210139_phase8_workbench_worker_indexes.sql','utf8');
  await db.query('BEGIN');await db.query("SELECT set_config('synapse.workbench.install','isolated-development-approved',true)");await db.query(sql);await db.query(fix);await db.query(indexes);
  await db.query('INSERT INTO workbench.meta(environment_id,mode,schema_hash) VALUES($1,\'ISOLATED_DEVELOPMENT\',$2)',[environment,createHash('sha256').update(sql+fix+indexes).digest('hex')]);
  await db.query(`CREATE ROLE synapse_workbench_login LOGIN NOINHERIT NOBYPASSRLS PASSWORD '${password}'`);await db.query('GRANT synapse_workbench_runtime TO synapse_workbench_login WITH INHERIT FALSE,SET TRUE');await db.query('COMMIT');
  stage='reference_metadata';const hosted=await operatorContext();try{
   // Active reference metadata only; account authority is resolved online for
   // every real request, and no Auth user/password/role is provisioned here.
   for(const [table,query] of [['bureaus','SELECT bureau_id id,bureau_name name FROM synapse.bureaus WHERE is_active'],['categories','SELECT category_id id,category_name name FROM synapse.case_categories WHERE is_active']])for(const row of (await hosted.db.query(query)).rows)await db.query(`INSERT INTO workbench.${table} VALUES($1,$2,$3)`,[row.id,environment,row]);
  }finally{await hosted.db.end();}
  const env={...process.env};for(const key of Object.keys(env))if(/^(SYNAPSE_|SUPABASE_SECRET_KEY$|SUPABASE_SERVICE_ROLE_KEY$|DATABASE_URL$|HF_TOKEN$|HUGGING_FACE_HUB_TOKEN$|NEXT_PUBLIC_)/i.test(key))delete env[key];
  Object.assign(env,parseEnv(await readFile('.env.gateway.local','utf8')),{NEXT_PUBLIC_SUPABASE_URL:process.env.NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,SYNAPSE_APP_ORIGIN:'http://localhost:3002',SYNAPSE_PHASE1_READ_ENABLED:'false',SYNAPSE_WORKBENCH_ENABLED:'true',SYNAPSE_WORKBENCH_ID:environment});
  root.username='synapse_workbench_login';root.password=password;env.SYNAPSE_WORKBENCH_DATABASE_URL=root.href;
  stage='start_restricted_web';web=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3002'],{env,stdio:'ignore',windowsHide:true});
  let ready=false;for(let n=0;n<90;n++){try{ready=(await fetch('http://localhost:3002/login',{signal:AbortSignal.timeout(1000)})).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,500));}if(!ready)throw Error('BROWSER_RUNTIME_UNAVAILABLE');
  stage='real_browser_tests';const tests=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test','connected.spec.ts'],{env:{...env,PLAYWRIGHT_NO_COPY_PROMPT:'1',SYNAPSE_EXTERNAL_TEST_SERVER:'true',SYNAPSE_REAL_BROWSER_APPROVED:'true',SYNAPSE_TEST_ORIGIN:'http://localhost:3002'},stdio:'inherit',windowsHide:true});
  const code=await new Promise(r=>tests.on('exit',r));
  const facts={checkedAt:new Date().toISOString(),source:'Actual hosted Supabase Auth, production original dashboard, disposable PostgreSQL; no seeded business records or mocked APIs',browserExitCode:code,counts:{}};
  for(const table of ['institutions','drafts','cases','tasks','sla','events','evidence','activity','receipts'])facts.counts[table]=(await db.query(`SELECT count(*)::int n FROM workbench.${table}`)).rows[0].n;
  facts.cancelledEvents=(await db.query("SELECT count(*)::int n FROM workbench.events WHERE body ? 'cancelledAt'")).rows[0].n;
  facts.disposedCases=(await db.query("SELECT count(*)::int n FROM workbench.cases WHERE body->>'status'='DISPOSED'")).rows[0].n;
  facts.reportAudits=(await db.query("SELECT count(*)::int n FROM workbench.activity WHERE body->>'type'='report.export'")).rows[0].n;
  await mkdir('docs/phase10',{recursive:true});await writeFile('docs/phase10/CONNECTED_DATABASE_EVIDENCE.json',JSON.stringify(facts,null,2)+'\n');console.log(JSON.stringify(facts));if(code)process.exitCode=1;
 }catch(error){console.error(JSON.stringify({testRunnerStage:stage,sqlState:/^[A-Z0-9]{5}$/.test(error.code??'')?error.code:null}));throw error;}finally{
  if(web){const closed=new Promise(r=>web.once('exit',r));if(process.platform==='win32'&&web.pid){try{execFileSync('taskkill.exe',['/PID',String(web.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});}catch{web.kill();}}else web.kill();await Promise.race([closed,new Promise(r=>setTimeout(r,4000))]);}
  await db?.end();if(created){await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',[name]);await admin.query('DROP DATABASE '+name);for(const role of ['synapse_workbench_login','synapse_workbench_runtime','synapse_workbench_owner'])await admin.query('DROP ROLE IF EXISTS '+role);}await admin.end();
 }
});
