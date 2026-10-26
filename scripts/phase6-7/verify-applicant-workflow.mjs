import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {operatorContext,safeMain} from '../phase2/operator.mjs';
import {loadVault,saveVault} from '../phase2/vault.mjs';
import {withDevelopmentReadLease} from './lease.mjs';
import {privateBrowserEnv} from './mail-link.mjs';
safeMain(async()=>{
 if(!process.argv.includes('--controlled-read-and-revoke-applicant'))throw Error('EXPLICIT_BOUNDED_APPLICANT_TEST_REQUIRED');
 const applicant=await loadVault('.local/phase2/applicant-onboarding.vault'),officers=await loadVault('.local/phase2/phase2-approved-officers.vault'),administrator=await loadVault('.local/phase2/admin-onboarding.vault');
 const plan=JSON.parse(await readFile('.local/phase2/approved-applicant.json','utf8'));
 const resume=process.argv.includes('--resume-audited-revocation');
 if(applicant.state!==(resume?'ROLE_REVOKED':'APPROVED')||applicant.email!==plan.email||plan.approvedRole!=='CASE_OFFICER')throw Error('INDEPENDENTLY_APPROVED_APPLICANT_REQUIRED');
 const {db,url,key}=await operatorContext();const origin='http://127.0.0.1:3001';let browser,child;const contexts=[],checks=[];
 const pass=(id,detail)=>{checks.push({id,status:'PASS',detail});console.log('PASS '+id);};
 if(resume){const previous=JSON.parse(await readFile('docs/phase6-7/applicant-workflow-results.json','utf8'));assert.ok(['authorized_applicant_role_revocation','real_logins'].includes(previous.stage));assert.equal(previous.originalOfficersPreserved,true);checks.push(...previous.checks.filter(c=>c.status==='PASS'));
  const audit=(await db.query("SELECT count(*)::int n FROM synapse_gateway.account_audit WHERE actor_user_id=$1 AND action='ROLE_REVIEW' AND detail->'before'->>'userId'=$2 AND (detail->'request'->>'revoke')::boolean",[administrator.internalId,applicant.internalId])).rows[0].n;assert.equal(audit,1);
 }
 const originalIds=officers.accounts.map(a=>a.internalUserId);
 const originalSnapshot=async()=>createHash('sha256').update(JSON.stringify((await db.query(`SELECT
  (SELECT jsonb_agg(to_jsonb(a) ORDER BY user_role_assignment_id) FROM synapse.user_role_assignments a WHERE user_id=ANY($1::uuid[])) roles,
  (SELECT jsonb_agg(to_jsonb(m) ORDER BY membership_id) FROM synapse.user_bureau_memberships m WHERE user_id=ANY($1::uuid[])) memberships`,[originalIds])).rows[0])).digest('hex');
 let stage='preconditions';
 try{
  assert.equal(await originalSnapshot(),applicant.originalOfficersDigest);
  try{await fetch(origin,{signal:AbortSignal.timeout(1000)});throw Error('CONTROLLED_PORT_OCCUPIED');}catch(error){if(error.message==='CONTROLLED_PORT_OCCUPIED')throw error;}
  const env={...process.env,SYNAPSE_APP_ORIGIN:origin,SYNAPSE_PHASE1_READ_ENABLED:'true',SYNAPSE_SIGNUP_ENABLED:'false',NEXT_PUBLIC_APP_MODE:'demo'};
  for(const name of ['DATABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_DB_CA_FILE'])delete env[name];
  child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3001'],{env,stdio:'ignore',windowsHide:true});
  let ready=false;for(let i=0;i<60;i++){try{ready=(await fetch(origin+'/login',{signal:AbortSignal.timeout(1000)})).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,250));}assert.ok(ready);
  browser=await chromium.launch({channel:'msedge',headless:true,env:privateBrowserEnv()});
  for(let i=0;i<4;i++)contexts.push(await browser.newContext());
  const accounts=[applicant,...officers.accounts,administrator],pages=[];
  stage='real_logins';for(let i=0;i<accounts.length;i++){const page=await contexts[i].newPage();pages.push(page);if(resume&&i===0){await contexts[0].addCookies(applicant.cookies.map(cookie=>({...cookie,domain:'127.0.0.1'})));await page.goto(origin+'/officer/dashboard');await page.waitForURL(origin+'/pending-approval');continue;}await page.goto(origin+'/login');await page.getByLabel('Email address',{exact:true}).fill(accounts[i].email);await page.getByLabel('Password',{exact:true}).fill(accounts[i].password);
   await Promise.all([page.waitForURL(origin+'/officer/dashboard',{timeout:45000}),page.getByRole('button',{name:'Sign In',exact:true}).click()]);}
  const account=(await (await contexts[0].request.get(origin+'/api/auth/session')).json()).account;assert.equal(account.status,resume?'PENDING_APPROVAL':'APPROVED');assert.deepEqual(account.roles,resume?[]:['CASE_OFFICER']);assert.deepEqual(account.memberships,[plan.bureauId]);
  if(!resume)pass('applicant_real_login_and_dashboard','Actual approved applicant password login reaches the protected officer dashboard with exactly one Case Officer role and the approved development Bureau.');
  stage='bounded_read_isolation';await withDevelopmentReadLease(db,officers.accounts.map(a=>a.authUserId),async()=>{
   const read=async(index)=>{const response=await contexts[index].request.get(origin+'/api/auth/cases');assert.equal(response.status(),200);return response.json();};
   const first=await read(1),second=await read(2);if(!resume){const newOfficer=await read(0);
   assert.ok(first.items.some(c=>c.id===officers.fixtures.cases.find(c=>c.slot==='A').id));assert.ok(!first.items.some(c=>c.id===officers.fixtures.cases.find(c=>c.slot==='B').id));
   assert.ok(second.items.some(c=>c.id===officers.fixtures.cases.find(c=>c.slot==='B').id));assert.ok(!second.items.some(c=>c.id===officers.fixtures.cases.find(c=>c.slot==='A').id));
   assert.equal(newOfficer.total,0);assert.deepEqual(newOfficer.items,[]);
   for(const row of [...first.items,...second.items]){const response=await contexts[0].request.get(origin+'/api/auth/cases?q='+encodeURIComponent(row.caseNumber));assert.equal(response.status(),200);assert.equal((await response.json()).total,0);}
   pass('applicant_case_scope_and_two_bureaus','Original officers still read only their own authorized case. The new unassigned Case Officer sees a truthful empty registry and no same-Bureau or cross-Bureau case metadata; no case assignment was fabricated.');
   for(const action of ['approvals','memberships','roles'])assert.equal((await contexts[0].request.get(origin+'/api/auth/'+action)).status(),403);
   assert.equal((await contexts[0].request.post(origin+'/api/auth/approval',{headers:{Origin:origin},data:{authId:applicant.authId,revision:'2',decision:'APPROVED',bureauId:plan.bureauId,role:'CASE_OFFICER',until:plan.expiresAt,reason:'Negative applicant self-approval test'}})).status(),403);
   assert.equal((await contexts[0].request.post(origin+'/api/phase1/platform/commands',{headers:{Origin:origin},data:{type:'case.create'}})).status(),503);
   for(const rpc of ['synapse_phase1_me','synapse_phase1_cases']){const response=await fetch(url+'/rest/v1/rpc/'+rpc,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+applicant.expiryProbe.token,'Content-Type':'application/json'},body:'{}'});assert.ok([401,403].includes(response.status));assert.equal((await response.json()).code,'42501');}
   assert.equal((await contexts[0].request.post(origin+'/api/auth/refresh',{headers:{Origin:origin},data:{}})).status(),200);
   pass('applicant_role_restrictions_direct_rpc_refresh','Actual applicant cannot approve accounts/manage roles or memberships, invoke direct protected RPCs, or enable platform writes; real HTTP session refresh succeeds.');
   }
   if(!resume){
   stage='authorized_applicant_role_revocation';await pages[3].goto(origin+'/officer-admin');await pages[3].getByRole('button',{name:'Load current roles',exact:true}).click();
   const section=pages[3].locator('section').filter({has:pages[3].getByRole('heading',{name:'Bureau role assignments',exact:true})});const article=section.locator('article').filter({hasText:applicant.email});await article.waitFor();
   await article.getByLabel('Revoke role',{exact:true}).check();await article.getByLabel('Role review reason',{exact:true}).fill('Explicit approved fourth-applicant hosted revocation test; preserve both existing officers');
   const [revocation]=await Promise.all([pages[3].waitForResponse(r=>r.url()===origin+'/api/auth/role'&&r.request().method()==='POST'),article.getByRole('button',{name:'Commit role review',exact:true}).click()]);assert.equal(revocation.status(),200);
   const revoked=(await db.query('SELECT valid_until::text,valid_until<=clock_timestamp() expired FROM synapse.user_role_assignments WHERE user_id=$1',[applicant.internalId])).rows;assert.equal(revoked.length,1);assert.ok(revoked[0].expired);
   applicant.state='ROLE_REVOKED';applicant.revokedRoleUntil=revoked[0].valid_until;await saveVault('.local/phase2/applicant-onboarding.vault',applicant);
   }
   await pages[0].evaluate(()=>window.dispatchEvent(new Event('focus')));await pages[0].waitForURL(origin+'/pending-approval',{timeout:45000});
   assert.equal((await contexts[0].request.get(origin+'/api/auth/cases')).status(),403);assert.deepEqual((await (await contexts[0].request.get(origin+'/api/auth/session')).json()).account.roles,[]);
   assert.equal((await read(1)).total,first.total);assert.equal((await read(2)).total,second.total);assert.equal(await originalSnapshot(),applicant.originalOfficersDigest);
   pass('applicant_real_role_revocation','Existing authorized administrator revoked only the applicant Case Officer role through the actual UI/API. A real unexpired session issued before revocation resolves to Pending Approval and loses case access; original officers retain exact roles/memberships and reads.');
   stage='logout_replay';const cookies=await contexts[0].cookies();assert.equal((await contexts[0].request.post(origin+'/api/auth/logout',{headers:{Origin:origin},data:{}})).status(),200);
   await contexts[0].addCookies(cookies);assert.equal((await contexts[0].request.get(origin+'/api/auth/session')).status(),401);
   pass('applicant_logout_cookie_replay','Actual applicant logout succeeds and replay of the previously valid HTTP session cookies is rejected.');
  });
 }catch(error){checks.push({id:'applicant_workflow_run',status:'FAIL',detail:'An actual hosted assertion failed; no later success inferred.'});throw error;}
 finally{
  for(const context of contexts)try{await context.request.post(origin+'/api/auth/logout',{headers:{Origin:origin},data:{}});}catch{}
  await browser?.close();if(child){child.kill();await new Promise(resolve=>{if(child.exitCode!==null)resolve();else{child.once('exit',resolve);setTimeout(resolve,5000);}});}
  const gate=(await db.query('SELECT read_enabled,read_until FROM synapse.phase1_access_config')).rows[0];await mkdir('docs/phase6-7',{recursive:true});await writeFile('docs/phase6-7/applicant-workflow-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,stage,finalGate:gate,originalOfficersPreserved:await originalSnapshot()===applicant.originalOfficersDigest},null,2));await db.end();
 }
});
