import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {loadVault} from '../phase2/vault.mjs';
if(!process.argv.includes('--approved-current-account-vault'))throw Error('EXPLICIT_APPROVED_ACCOUNT_TEST_REQUIRED');
const port=3017,origin='http://127.0.0.1:'+port,env={...process.env,...parseEnv(await readFile('.env.local','utf8')),...parseEnv(await readFile('.env.gateway.local','utf8')),SYNAPSE_APP_ORIGIN:origin,SYNAPSE_HOSTED_OPERATIONS_ENABLED:'false',SYNAPSE_GMAIL_ENABLED:'false'};
if(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname!=='xjnukuerzlrxjjqwmgkn.supabase.co')throw Error('PROJECT_MISMATCH');
for(const name of ['SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','DATABASE_URL'])if(env[name])throw Error('OPERATOR_ENV_NOT_ALLOWED');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:'ignore',windowsHide:true}),results=[];
try{
 let ready=false;for(let i=0;i<80;i++){try{await fetch(origin+'/api/integration',{signal:AbortSignal.timeout(1000)});ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}assert.ok(ready,'SERVER_START_FAILED');
 const vault=await loadVault('.local/acceptance/real-users.vault');
 for(const [index,account] of vault.accounts.entries()){
  const cookies=new Map();const header=()=>[...cookies].map(([k,v])=>k+'='+v).join('; ');
  const call=async(path,body,override)=>{const response=await fetch(origin+path,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{Origin:origin,Cookie:override??header(),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});if(override===undefined)for(const cookie of response.headers.getSetCookie()){const first=cookie.split(';')[0],position=first.indexOf('=');cookies.set(first.slice(0,position),first.slice(position+1));}return response;};
  try{
   assert.equal((await call('/api/auth/session')).status,401);
   const login=await call('/api/auth/login',{email:account.email,password:account.password});assert.equal(login.status,200,'REAL_LOGIN_FAILED');const user=await login.json();assert.equal(user.account.status,'APPROVED');assert.ok(header().includes('synapse-auth-session'));
   assert.equal((await call('/api/auth/session')).status,200,'CURRENT_SESSION_FAILED');assert.equal((await call('/api/auth/profile')).status,200,'CURRENT_PROFILE_FAILED');assert.equal((await call('/api/workspace/snapshot')).status,200,'GATED_WORKSPACE_FAILED');
   const admin=user.account.roles.includes('SYSTEM_ADMIN');const readiness=await call('/api/auth/readiness');assert.equal(readiness.status,admin?200:403,'ADMIN_READINESS_BOUNDARY_FAILED');if(admin){const observed=await readiness.json();assert.equal(observed.businessWritesEnabled,false);assert.ok(!observed.checks.some(c=>c.id==='hosted_catalog_check'),'CURRENT_CATALOG_QUERY_FAILED');assert.ok(observed.checks.filter(c=>['direct_case_rpc_closed','restricted_database_login','private_helper_ownership_and_grants','no_owner_role_assumption'].includes(c.id)).every(c=>c.status==='PASS'));}
   assert.equal((await call('/api/auth/refresh',{})).status,200,'CURRENT_REFRESH_FAILED');const stale=header();assert.equal((await call('/api/auth/logout',{})).status,200,'APPLICATION_LOGOUT_FAILED');assert.equal((await call('/api/auth/session',undefined,stale)).status,401,'LOGGED_OUT_COOKIE_REPLAY_ACCEPTED');
   results.push({account:index+1,realLogin:true,profile:true,currentSession:true,readOnlyAccountWorkspace:true,roleReadinessIsolation:true,refresh:true,applicationLogout:true,staleCookieReplayDenied:true});
  }finally{await call('/api/auth/logout',{}).catch(()=>{});}
 }
 const report={checkedAt:new Date().toISOString(),environment:'Local production Next server / real hosted Supabase Auth and restricted TLS gateway',browserAutomation:false,providerMocked:false,complaintWrites:false,onlyFreshTestSessionsLoggedOut:true,releaseChanged:false,results,allPassed:results.length===3};await writeFile('docs/phase16/HTTP_AUTH_RESULTS.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(error){console.error('Sanitized HTTP Auth test failure: '+(String(error.message).match(/^[A-Z_]{3,80}$/)?.[0]??'AUTH_HTTP_TEST_FAILED'));process.exitCode=1;}finally{server.kill();}
