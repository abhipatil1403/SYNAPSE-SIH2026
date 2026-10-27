import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
import {loadVault} from '../phase2/vault.mjs';
import {safeMain} from '../phase2/operator.mjs';
safeMain(async()=>{
 const admin=await loadVault('.local/phase2/admin-onboarding.vault'),officers=await loadVault('.local/phase2/phase2-approved-officers.vault');
 const origin='http://localhost:3000',pending=process.argv.includes('--expect-pending');
 const env={...process.env};for(const key of Object.keys(env))if(/SECRET|PASSWORD|TOKEN|DATABASE_URL|PRIVATE_KEY|^SYNAPSE_/i.test(key))delete env[key];
 let browser;const checks=[];
 try{
  browser=await chromium.launch({channel:'msedge',headless:true,env});const context=await browser.newContext(),page=await context.newPage();
  await page.goto(origin+'/login');await page.getByLabel('Email address',{exact:true}).fill(admin.email);await page.getByLabel('Password',{exact:true}).fill(admin.password);
  await Promise.all([page.waitForURL(origin+(pending?'/pending-approval':'/officer/dashboard'),{timeout:45000}),page.getByRole('button',{name:'Sign In',exact:true}).click()]);
  const response=await context.request.get(origin+'/api/auth/session');assert.equal(response.status(),200);const body=await response.json();assert.equal(body.account.status,pending?'PENDING_APPROVAL':'APPROVED');
  if(pending){
   assert.deepEqual(body.account.roles,[]);assert.equal((await context.request.get(origin+'/api/auth/cases')).status(),403);
   assert.equal((await context.request.get(origin+'/api/auth/approvals')).status(),403);
   const fake={authId:admin.authId,revision:'1',decision:'APPROVED',bureauId:officers.accounts[0].bureauId,role:'SYSTEM_ADMIN',until:new Date(Date.now()+86400000).toISOString(),reason:'Negative self-elevation test'};
   assert.equal((await context.request.post(origin+'/api/auth/approval',{headers:{Origin:origin},data:fake})).status(),400);
   fake.role='CASE_OFFICER';assert.equal((await context.request.post(origin+'/api/auth/approval',{headers:{Origin:origin},data:fake})).status(),403);
   checks.push({id:'verified_pending_no_privilege',status:'PASS',detail:'Actual verified third-account login creates Pending Approval and denies cases/admin/self-assignment. No role granted during signup.'});
  }else{
   assert.deepEqual(body.account.roles,['SYSTEM_ADMIN']);assert.deepEqual(body.account.memberships,[]);
   assert.equal((await context.request.get(origin+'/api/auth/approvals')).status(),200);await page.goto(origin+'/officer-admin');await page.getByRole('heading',{name:'User Approvals',exact:true}).waitFor();
   checks.push({id:'verified_admin_configuration',status:'PASS',detail:'Actual administrator login has the expiring SYSTEM_ADMIN configuration role, no Bureau membership and no automatic case role; administrator page/API opens.'});
   const listed=await context.request.get(origin+'/api/auth/memberships');assert.equal(listed.status(),200);
   const members=(await listed.json()).memberships;
   const member=members.find(m=>m.userId===officers.accounts[0].internalUserId);assert.ok(member?.canManage&&member.validUntil);
   const review={requestId:randomUUID(),membershipId:member.id,expectedUntil:member.validUntil,until:member.validUntil,revoke:false,reason:'Approved development verification: review existing expiry without changing access or role'};
   const post=()=>context.request.post(origin+'/api/auth/membership',{headers:{Origin:origin},data:review});
   const saved=await post();assert.equal(saved.status(),200);assert.equal((await saved.json()).replayed,false);
   const replay=await post();assert.equal(replay.status(),200);assert.equal((await replay.json()).replayed,true);
   assert.equal((await context.request.post(origin+'/api/auth/membership',{headers:{Origin:origin},data:{...review,reason:'Conflicting replay must be rejected'}})).status(),409);
   const after=(await (await context.request.get(origin+'/api/auth/memberships')).json()).memberships.find(m=>m.id===member.id);
   assert.equal(after.validUntil,member.validUntil);
   await page.getByRole('button',{name:'Load current memberships',exact:true}).click();await page.getByRole('button',{name:'Commit membership review',exact:true}).first().waitFor();
   checks.push({id:'verified_admin_membership_review',status:'PASS',detail:'Actual administrator reviewed the existing officer membership expiry unchanged; identical replay succeeded, conflicting replay was rejected, and the real management UI loaded. No officer role or permission window changed.'});
  }
  assert.equal((await context.request.post(origin+'/api/auth/logout',{headers:{Origin:origin},data:{}})).status(),200);
  for(const check of checks)console.log('PASS: '+check.id);
 }finally{await browser?.close();await mkdir('docs/phase6-7',{recursive:true});await writeFile(`docs/phase6-7/admin-${pending?'pending':'login'}-results.json`,JSON.stringify({checkedAt:new Date().toISOString(),checks},null,2));}
});
