import pg from "pg";
import { readFile } from "node:fs/promises";
// Dedicated process only. Never run with .env.operator.local or a service key.
if(process.env.SYNAPSE_SLA_ENABLED!=="true") { console.error("SLA worker is disabled; reviewed configuration and security approval are required."); process.exitCode=2; }
else {
 let client;
 try {
  if(process.env.DATABASE_URL||process.env.SUPABASE_SECRET_KEY)throw Error('OPERATOR_ENV_FORBIDDEN');
  const url=new URL(process.env.SYNAPSE_SLA_DATABASE_URL);
  if(!url.username.startsWith('synapse_sla_login')||url.search||url.protocol!=='postgresql:'||!(/^(db\.xjnukuerzlrxjjqwmgkn\.supabase\.co|aws-[a-z0-9-]+\.pooler\.supabase\.com)$/.test(url.hostname)))throw Error('WORKER_CONFIG_INVALID');
  client=new pg.Client({connectionString:url.toString(),ssl:{ca:await readFile(process.env.SYNAPSE_SLA_CA_FILE,'utf8'),rejectUnauthorized:true,servername:url.hostname},statement_timeout:10000});
  await client.connect();
  const role=(await client.query("SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=current_user")).rows[0];
  if(!role||role.rolsuper||role.rolbypassrls||role.rolcreaterole||role.rolcreatedb)throw Error('WORKER_ROLE_UNSAFE');
  await client.query('SET ROLE synapse_sla_worker');
  let failures=0;
  do {
   try {const result=(await client.query('SELECT synapse_jobs.process_sla() delivered')).rows[0];console.log(JSON.stringify({at:new Date().toISOString(),delivered:result.delivered}));failures=0;}
   catch { failures++;console.error('SLA batch rolled back; durable receipts prevent duplicate retry delivery.');if(process.argv.includes('--once'))throw Error('WORKER_BATCH_FAILED'); }
   if(!process.argv.includes('--once'))await new Promise(r=>setTimeout(r,Math.min(300000,60000*2**failures)));
  }while(!process.argv.includes('--once'));
 }catch{console.error('SLA worker could not complete; no credentials or case data were logged.');process.exitCode=1;}
 finally{await client?.end();}
}
