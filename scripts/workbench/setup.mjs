import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID,createHash,createHmac,pbkdf2Sync} from 'node:crypto';
import {readFile,writeFile,mkdir,access,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import pg from 'pg';
import {loadVault,saveVault} from '../phase2/vault.mjs';
import {operatorContext,safeMain} from '../phase2/operator.mjs';
const folder=resolve('.local/workbench'),data=resolve(folder,'postgres'),vaultPath=resolve(folder,'operator.vault');
function scram(password){const salt=randomBytes(16),salted=pbkdf2Sync(password,salt,4096,32,'sha256'),client=createHmac('sha256',salted).update('Client Key').digest();return `SCRAM-SHA-256$4096:${salt.toString('base64')}$${createHash('sha256').update(client).digest('base64')}:${createHmac('sha256',salted).update('Server Key').digest('base64')}`;}
const exists=async(path)=>{try{await access(path);return true;}catch{return false;}};
function privateAcl(path){
 const sid=execFileSync('pwsh.exe',['-NoProfile','-NonInteractive','-Command','[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value'],{encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true}).trim();if(!/^S-1-5-21-[0-9-]+$/.test(sid))throw Error('LOCAL_IDENTITY_ACL_REQUIRED');
 // Set only the DACL, avoiding managed SACL/SeSecurityPrivilege requirements.
 execFileSync('icacls.exe',[path,'/inheritance:r','/grant:r','*'+sid+':F'],{stdio:'pipe',windowsHide:true});
 execFileSync('pwsh.exe',['-NoProfile','-NonInteractive','-Command','$ErrorActionPreference="Stop";$target=[Console]::In.ReadToEnd();$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value;$rules=(Get-Acl -LiteralPath $target).GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]);foreach($r in $rules){if($r.AccessControlType -eq "Allow" -and $r.IdentityReference.Value -notin @($sid,"S-1-5-18","S-1-5-32-544")){throw "Unexpected file access"}}'],{input:path,stdio:['pipe','pipe','pipe'],windowsHide:true});
}
safeMain(async()=>{
 let stage='private_cluster';try{
 if(!process.argv.includes('--create-isolated-development'))throw Error('EXPLICIT_ISOLATED_SETUP_REQUIRED');
 await mkdir(folder,{recursive:true});
 let plan;
 try{plan=await loadVault(vaultPath);}catch{if(await exists(vaultPath))throw Error('EXISTING_PRIVATE_PLAN_UNREADABLE');plan={environmentId:randomUUID(),database:'synapse_workbench_'+randomBytes(6).toString('hex'),operatorPassword:randomBytes(36).toString('base64url'),runtimePassword:randomBytes(36).toString('base64url')};await saveVault(vaultPath,plan);}
 if(!/^synapse_workbench_[a-f0-9]{12}$/.test(plan.database))throw Error('UNAPPROVED_LOCAL_DATABASE');
 if(!await exists(resolve(data,'PG_VERSION'))){
  const passwordFile=resolve(folder,'init-password.txt');await writeFile(passwordFile,plan.operatorPassword+'\n');
  try{
   stage='private_password_acl';privateAcl(passwordFile);stage='initialize_cluster';
   // These are option names and a private file path, never a password literal.
   const initArgs=['-D',data,'-U','postgres','--auth-host','scram-sha-256','--auth-local','scram-sha-256','--pwfile',passwordFile,'--encoding','UTF8','--locale','C'];
   execFileSync('initdb.exe',initArgs,{stdio:'pipe',windowsHide:true});
  }finally{await unlink(passwordFile);}
 }
 stage='start_cluster';try{execFileSync('pg_ctl.exe',['-D',data,'status'],{stdio:'pipe',windowsHide:true});}
 catch{execFileSync('pg_ctl.exe',['-D',data,'-l',resolve(folder,'postgres.log'),'-o','-h 127.0.0.1 -p 55433','-w','start'],{stdio:'ignore',windowsHide:true});}
 stage='create_database';const local=new pg.Client({host:'127.0.0.1',port:55433,user:'postgres',password:plan.operatorPassword,database:'postgres'});await local.connect();
 try{if(!(await local.query('SELECT 1 FROM pg_database WHERE datname=$1',[plan.database])).rowCount)await local.query('CREATE DATABASE '+plan.database);}finally{await local.end();}
 const db=new pg.Client({host:'127.0.0.1',port:55433,user:'postgres',password:plan.operatorPassword,database:plan.database});await db.connect();
 let hosted;
 try{
  stage='install_reviewed_schema';const sql=await readFile('supabase/candidates/20261026200946_phase8_isolated_workbench.sql','utf8'),hash=createHash('sha256').update(sql).digest('hex');
  const correction=await readFile('supabase/candidates/20261026202545_phase8_workbench_owner_schema_usage.sql','utf8'),finalHash=createHash('sha256').update(sql+correction).digest('hex');
  const indexes=await readFile('supabase/candidates/20261026210139_phase8_workbench_worker_indexes.sql','utf8'),workerHash=createHash('sha256').update(sql+correction+indexes).digest('hex');
  const installed=(await db.query("SELECT to_regclass('workbench.meta') IS NOT NULL ready")).rows[0].ready;
  if(!installed){
   await db.query('BEGIN');try{await db.query("SELECT set_config('synapse.workbench.install','isolated-development-approved',true)");await db.query(sql);
    await db.query('INSERT INTO workbench.meta(environment_id,mode,schema_hash) VALUES($1,\'ISOLATED_DEVELOPMENT\',$2)',[plan.environmentId,hash]);
    await db.query(`CREATE ROLE synapse_workbench_login LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 10 PASSWORD '${scram(plan.runtimePassword)}'`);
    await db.query('GRANT synapse_workbench_runtime TO synapse_workbench_login WITH INHERIT FALSE,SET TRUE');await db.query('COMMIT');
   }catch(error){await db.query('ROLLBACK');throw error;}
  }else{const meta=(await db.query('SELECT environment_id,schema_hash FROM workbench.meta')).rows; if(meta.length!==1||meta[0].environment_id!==plan.environmentId||![hash,finalHash,workerHash].includes(meta[0].schema_hash))throw Error('EXISTING_ISOLATED_SCHEMA_REQUIRES_FORWARD_REVIEW');}
  if((await db.query('SELECT schema_hash FROM workbench.meta WHERE environment_id=$1',[plan.environmentId])).rows[0].schema_hash===hash){await db.query('BEGIN');try{await db.query(correction);await db.query('UPDATE workbench.meta SET schema_hash=$2 WHERE environment_id=$1',[plan.environmentId,finalHash]);await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}}
  if((await db.query('SELECT schema_hash FROM workbench.meta WHERE environment_id=$1',[plan.environmentId])).rows[0].schema_hash===finalHash){await db.query('BEGIN');try{await db.query(indexes);await db.query('UPDATE workbench.meta SET schema_hash=$2 WHERE environment_id=$1',[plan.environmentId,workerHash]);await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}}
  // Only approved identity/reference metadata is copied; no hosted complaints,
  // evidence, messages, tokens, passwords or privileged runtime credentials.
  stage='import_approved_metadata';hosted=await operatorContext();await hosted.db.query('BEGIN READ ONLY');
  // Refresh existing directory references without depending on passwords or
  // pre-deletion Auth UUID vaults. Fresh/recreated users are imported only by
  // the online trusted gateway when they sign in; no email-based inheritance.
  const identities=(await db.query('SELECT id,body FROM workbench.staff WHERE environment_id=$1',[plan.environmentId])).rows.map(r=>({internalId:r.id,authId:r.body.authId,fallback:r.body}));
  for(const identity of identities){
   stage='read_approved_user_metadata';
   const user=(await hosted.db.query("SELECT u.user_id id,u.display_name name,(u.account_status='ACTIVE' AND l.auth_user_id IS NOT NULL) active,l.auth_user_id FROM synapse.users u LEFT JOIN synapse.auth_identity_links l ON l.internal_user_id=u.user_id AND l.revoked_at IS NULL WHERE u.user_id=$1",[identity.internalId])).rows[0];if(!user)throw Error('IMPORTED_APPLICATION_USER_MISSING');if(!identity.fallback&&(!user.active||user.auth_user_id!==identity.authId))throw Error('APPROVED_IDENTITY_INACTIVE');
   const memberships=(await hosted.db.query('SELECT bureau_id,valid_from,valid_until FROM synapse.user_bureau_memberships WHERE user_id=$1 AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now())',[user.id])).rows.map(r=>({bureauId:r.bureau_id,from:r.valid_from.toISOString(),until:r.valid_until?.toISOString()??null}));
   const roles=(await hosted.db.query('SELECT r.role_code,a.bureau_id,a.valid_from,a.valid_until FROM synapse.user_role_assignments a JOIN synapse.roles r USING(role_id) WHERE a.user_id=$1 AND r.is_active AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now())',[user.id])).rows.map(r=>({code:r.role_code,bureauId:r.bureau_id,from:r.valid_from.toISOString(),until:r.valid_until?.toISOString()??null}));
   stage='write_isolated_staff';const body={id:user.id,authId:user.auth_user_id??identity.authId,name:user.name,active:user.active,memberships:user.active?memberships:[],roles:user.active?roles:[]};await db.query('INSERT INTO workbench.staff VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET body=excluded.body',[user.id,plan.environmentId,body]);
  }
  for(const [table,query] of [['bureaus','SELECT bureau_id id,bureau_name name FROM synapse.bureaus WHERE is_active'],['categories','SELECT category_id id,category_name name FROM synapse.case_categories WHERE is_active']]){
   stage='read_reference_'+table;const rows=(await hosted.db.query(query)).rows;stage='write_isolated_'+table;for(const row of rows)await db.query(`INSERT INTO workbench.${table} VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING`,[row.id,plan.environmentId,row]);
  }
  await hosted.db.query('ROLLBACK');
  stage='write_private_runtime';const runtimeUrl=new URL('postgresql://synapse_workbench_login@127.0.0.1:55433/'+plan.database);runtimeUrl.password=plan.runtimePassword;
  await writeFile('.env.workbench.local',`# Isolated loopback PostgreSQL only; no hosted business writes.\nSYNAPSE_WORKBENCH_ENABLED=true\nSYNAPSE_WORKBENCH_DATABASE_URL=${runtimeUrl.href}\nSYNAPSE_WORKBENCH_ID=${plan.environmentId}\n`);privateAcl('.env.workbench.local');
  console.log('PASS: dedicated isolated PostgreSQL database and restricted runtime created/verified. Approved identity/reference metadata imported; no hosted business record or role changed. Private runtime env written.');
 }finally{await hosted?.db.end();await db.end();}
 }catch(error){console.error(JSON.stringify({stage,sqlState:/^[A-Z0-9]{5}$/.test(error.code??'')?error.code:null,processStatus:error.status??null,permission:/^permission denied for (schema|table|sequence|relation) [a-zA-Z_]+$/.test(error.message??'')?error.message:null}));if(['private_password_acl','initialize_cluster','start_cluster'].includes(stage))console.error(String(error.stderr??'').slice(0,1600));throw error;}
});
