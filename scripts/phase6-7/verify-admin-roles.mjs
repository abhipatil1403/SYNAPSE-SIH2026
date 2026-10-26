import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {operatorContext,safeMain} from '../phase2/operator.mjs';
import {loadVault} from '../phase2/vault.mjs';

// Actual issued-JWT/HTTP/browser evidence. Never replaces either officer's role.
safeMain(async()=>{
 const admin=await loadVault('.local/phase2/admin-onboarding.vault'),officers=await loadVault('.local/phase2/phase2-approved-officers.vault');
 const {db}=await operatorContext(),origin='http://localhost:3000',checks=[];
 const pass=(id,detail)=>{checks.push({id,status:'PASS',detail});console.log('PASS '+id);};
 const env={...process.env};for(const key of Object.keys(env))if(/SECRET|PASSWORD|TOKEN|DATABASE_URL|PRIVATE_KEY|^SYNAPSE_/i.test(key))delete env[key];
 const ids=[admin.internalId,...officers.accounts.map(a=>a.internalUserId)];
 const snapshot=async()=>createHash('sha256').update(JSON.stringify((await db.query('SELECT to_jsonb(a) row FROM synapse.user_role_assignments a WHERE user_id=ANY($1::uuid[]) ORDER BY user_role_assignment_id',[ids])).rows)).digest('hex');
 let browser,adminContext;const officerContexts=[];let original,role;
 try{
  const gate=(await db.query('SELECT read_enabled,read_until FROM synapse.phase1_access_config')).rows[0];assert.equal(gate.read_enabled,false);assert.equal(gate.read_until,null);
  original=await snapshot();role=(await db.query("SELECT user_role_assignment_id,valid_until::text FROM synapse.user_role_assignments a JOIN synapse.roles r USING(role_id) WHERE a.user_id=$1 AND a.scope_type='GLOBAL' AND r.role_code='SYSTEM_ADMIN' AND a.valid_until>now()",[admin.internalId])).rows[0];assert.ok(role);
  browser=await chromium.launch({channel:'msedge',headless:true,env});adminContext=await browser.newContext();
  assert.equal((await adminContext.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email:admin.email,password:admin.password}})).status(),200);
  const listing=await adminContext.request.get(origin+'/api/auth/roles');assert.equal(listing.status(),200);const assignments=(await listing.json()).assignments;
  for(const officer of officers.accounts)assert.equal(assignments.find(a=>a.userId===officer.internalUserId)?.role,'CASE_OFFICER');
  const assignment=assignments.find(a=>a.userId===officers.accounts[0].internalUserId);assert.ok(assignment?.validUntil);
  const review={requestId:randomUUID(),assignmentId:assignment.id,expectedRole:assignment.role,expectedUntil:assignment.validUntil,role:assignment.role,until:assignment.validUntil,revoke:false,reason:'Approved development unchanged-role review; retain exact original access'};
  const post=data=>adminContext.request.post(origin+'/api/auth/role',{headers:{Origin:origin},data});
  const saved=await post(review);assert.equal(saved.status(),200);assert.equal((await saved.json()).assignmentId,assignment.id);
  const replay=await post(review);assert.equal(replay.status(),200);assert.equal((await replay.json()).replayed,true);
  assert.equal((await post({...review,reason:'Conflicting replay must be rejected'})).status(),409);
  assert.equal((await post({...review,requestId:randomUUID(),role:'SYSTEM_ADMIN'})).status(),400);
  assert.equal((await post({...review,requestId:randomUUID(),assignmentId:role.user_role_assignment_id})).status(),403);
  assert.equal(await snapshot(),original);
  pass('hosted_role_review_and_replay','Real administrator reviewed an unchanged CASE_OFFICER assignment; identical replay succeeds, conflicting replay/global/self/elevation attempts fail, and exact role records are unchanged.');
  for(const officer of officers.accounts){const ctx=await browser.newContext();officerContexts.push(ctx);
   assert.equal((await ctx.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email:officer.email,password:officer.password}})).status(),200);
   assert.equal((await ctx.request.get(origin+'/api/auth/roles')).status(),403);
   assert.equal((await ctx.request.post(origin+'/api/auth/role',{headers:{Origin:origin},data:{...review,requestId:randomUUID()}})).status(),403);
  }
  pass('hosted_officers_cannot_manage_roles','Both real approved Case Officer sessions are denied role listing and role decisions.');
  const page=await adminContext.newPage();await page.goto(origin+'/officer-admin');await page.getByRole('button',{name:'Load current roles',exact:true}).click();
  const section=page.locator('section').filter({has:page.getByRole('heading',{name:'Bureau role assignments',exact:true})});
  const form=section.locator('form').first();await form.getByLabel('Role review reason').fill('Actual browser review retains exact current role and expiry');
  const response=await Promise.all([page.waitForResponse(r=>r.url()===origin+'/api/auth/role'&&r.request().method()==='POST'),form.getByRole('button',{name:'Commit role review',exact:true}).click()]);assert.equal(response[0].status(),200);
  await page.getByText('Role review committed and audited.',{exact:true}).waitFor();assert.equal(await snapshot(),original);
  for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  await page.setViewportSize({width:1440,height:1000});
  pass('hosted_role_form_preserves_records','Real administrator browser form committed and audited an unchanged role/expiry; every original approved role record still matches its exact snapshot.');
  try{
   await db.query('UPDATE synapse.user_role_assignments SET valid_until=clock_timestamp() WHERE user_role_assignment_id=$1',[role.user_role_assignment_id]);
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForURL(origin+'/pending-approval',{timeout:45000});
   assert.equal(await page.getByRole('heading',{name:'Bureau role assignments',exact:true}).count(),0);
   assert.equal((await adminContext.request.get(origin+'/api/auth/roles')).status(),403);
  }finally{await db.query('UPDATE synapse.user_role_assignments SET valid_until=$2 WHERE user_role_assignment_id=$1',[role.user_role_assignment_id,role.valid_until]);}
  assert.equal(await snapshot(),original);
  pass('hosted_admin_authority_loss_clears_ui','Temporarily expiring only the development administrator configuration role clears the open administration forms and redirects to Pending Approval; original expiry restored exactly.');
  await page.goto(origin+'/officer-admin');await page.getByRole('button',{name:'Load current roles',exact:true}).click();await page.getByRole('button',{name:'Commit role review',exact:true}).first().waitFor();
  const other=await adminContext.newPage();await other.goto(origin+'/officer/dashboard');await other.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForURL(origin+'/login',{timeout:45000});
  assert.equal(await page.getByRole('heading',{name:'Bureau role assignments',exact:true}).count(),0);
  assert.equal((await adminContext.request.get(origin+'/api/auth/session')).status(),401);
  pass('hosted_admin_cross_tab_logout','Actual other-tab logout broadcasts clear administration records and the previously valid session is denied.');
  assert.equal(await snapshot(),original);
 }catch(error){checks.push({id:'admin_roles_run',status:'FAIL',detail:'An actual hosted role/authority assertion failed; later success not inferred.'});throw error;}
 finally{
  for(const ctx of [...officerContexts,...(adminContext?[adminContext]:[])])try{await ctx.request.post(origin+'/api/auth/logout',{headers:{Origin:origin},data:{}});}catch{}
  await browser?.close();
  const gate=(await db.query('SELECT read_enabled,read_until FROM synapse.phase1_access_config')).rows[0];
  await mkdir('docs/phase6-7',{recursive:true});await writeFile('docs/phase6-7/admin-roles-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,finalGate:gate,originalRoleRecordsPreserved:original?await snapshot()===original:false},null,2));await db.end();
 }
});
