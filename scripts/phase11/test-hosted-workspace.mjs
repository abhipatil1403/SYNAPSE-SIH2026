import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createClient} from '@supabase/supabase-js';
import pg from 'pg';
import {safeMain} from '../phase2/operator.mjs';
import {loadVault} from '../phase2/vault.mjs';
const require=createRequire(import.meta.url),{validatedClaims}=require('../../lib/auth/policy.ts'),{snapshotSchema}=require('../../lib/platform/contracts.ts'),{gatewayCa}=require('../../lib/auth/gateway-ca.ts');
safeMain(async()=>{
 const vault=await loadVault('.local/acceptance/real-users.vault');assert.equal(vault.environment,'DEVELOPMENT_REAL_AUTH');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,connection=process.env.SYNAPSE_GATEWAY_DATABASE_URL,u=new URL(connection);
 assert.equal(url,'https://xjnukuerzlrxjjqwmgkn.supabase.co');assert.ok(decodeURIComponent(u.username).startsWith('synapse_web_login'));assert.equal(u.search,'');
 const db=new pg.Client({connectionString:connection,ssl:{ca:gatewayCa(),rejectUnauthorized:true,servername:u.hostname},connectionTimeoutMillis:10000}),clients=[],checks=[];
 const note=id=>checks.push({id,status:'PASS'});
 const call=async(claims)=>{await db.query('BEGIN');try{await db.query('SET LOCAL ROLE synapse_web_gateway');const result=snapshotSchema.parse((await db.query('SELECT synapse_gateway.workspace($1) result',[claims])).rows[0].result);await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK');throw e;}};
 await db.connect();
 try{
  for(const [slot,account] of vault.accounts.entries()){
   const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(client);
   const login=await client.auth.signInWithPassword(account);assert.ok(!login.error&&login.data.session);
   const verified=await client.auth.getUser();assert.ok(!verified.error&&verified.data.user);
   const claims=validatedClaims(login.data.session.access_token,verified.data.user,url),s=await call(claims);
   assert.equal(s.workspace.mode,'ACCOUNT_ONLY');assert.equal(s.cases.length,0);assert.equal(s.directory.length,1);assert.ok(s.me.id);assert.equal(s.me.roles.includes('SYSTEM_ADMIN'),slot===2);note('actual_issued_jwt_runtime_account_workspace_'+slot);
   for(const name of ['synapse_phase1_me','synapse_phase1_cases'])assert.ok((await client.rpc(name)).error);note('direct_case_rpcs_remain_closed_'+slot);
   await assert.rejects(call({...claims,exp:1}),{code:'28000'});await assert.rejects(call({...claims,sub:randomUUID()}),{code:'42501'});note('expired_sql_claim_tuple_and_unmapped_subject_denied_'+slot);
   const revoked=await client.rpc('synapse_phase2_revoke_session');assert.equal(revoked.error,null);await assert.rejects(call(claims),{code:'28000'});note('same_actual_session_denied_after_self_revocation_'+slot);
   assert.equal((await client.auth.signOut({scope:'local'})).error,null);
  }
  await mkdir('docs/phase11',{recursive:true});await writeFile('docs/phase11/HOSTED_DATABASE_EVIDENCE.json',JSON.stringify({checkedAt:new Date().toISOString(),source:'Actual online-verified Supabase-issued JWTs, real restricted web-runtime database login, deployed private workspace function. No synthetic business records or temporary authority changes were committed.',checks,actualIssuedJwt:true,publicRpcExposed:false,businessFixturesCommitted:false,activationCommitted:false,businessWritesEnabled:false,caseIsolation:'Positive case/SLA isolation verified in disposable SQL tests only. Hosted case fixtures/lease test blocked by the intentional operator-to-gateway SET ROLE boundary (42501) and inactive read lease; no grant was changed to bypass it.',naturalJwtExpiry:'NOT RETESTED: altered exp tuple above is a SQL validation test, not an actually expired issued-JWT soak',manualAcceptance:'AWAITING USER MANUAL TESTING'},null,2)+'\n');
  console.log('PASS '+checks.length+' actual hosted runtime/account/security checks. Case lease remains closed; positive hosted case activation was not performed.');
 }finally{for(const client of clients)await client.auth.signOut({scope:'local'}).catch(()=>{});await db.end();}
});
