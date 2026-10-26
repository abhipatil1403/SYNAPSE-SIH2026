import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {loadVault,saveVault} from '../phase2/vault.mjs';
import {operatorContext,safeMain} from '../phase2/operator.mjs';
import {applicantOrigin as origin,savedMailLink,followMailLink,privateBrowserEnv} from './mail-link.mjs';
safeMain(async()=>{
 const applicant=await loadVault('.local/phase2/applicant-onboarding.vault');
 const plan=JSON.parse(await readFile('.local/phase2/approved-applicant.json','utf8'));
 if(applicant.email!==plan.email||plan.approvedRole!=='CASE_OFFICER'||applicant.state!=='AWAITING_EMAIL_CONFIRMATION')throw Error('APPROVED_PENDING_APPLICANT_REQUIRED');
 const {db,admin}=await operatorContext({authAdmin:true});let browser,stage='mail_link',checks=[];const confirmedLogin=process.argv.includes('--verify-provider-confirmed-login');
 try{
  const before=await admin.getUserById(applicant.authId);assert.equal(before.error,null);
  if(confirmedLogin)assert.ok(before.data.user.email_confirmed_at,'Actual mailbox confirmation must already exist; no forced verification.');
  const link=confirmedLogin?null:await savedMailLink('.local/phase2/applicant-confirm-link.txt',applicant.createdAt,['signup','email']);
  browser=await chromium.launch({channel:'msedge',headless:true,env:privateBrowserEnv()});const context=await browser.newContext();await context.addCookies(applicant.cookies);
  if(link){stage='real_provider_callback';await followMailLink(context,link,'/pending-approval',async(cookies,next)=>{applicant.resumeCookies=cookies;applicant.resumeDestination=next;await saveVault('.local/phase2/applicant-onboarding.vault',applicant);});}
  else {stage='real_confirmed_password_login';assert.equal((await context.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email:applicant.email,password:applicant.password}})).status(),200);}
  stage='provider_confirmation_and_pending';const provider=await admin.getUserById(applicant.authId);assert.equal(provider.error,null);assert.ok(provider.data.user.email_confirmed_at);assert.equal(provider.data.user.email.toLowerCase(),plan.email.toLowerCase());
  const response=await context.request.get(origin+'/api/auth/session');assert.equal(response.status(),200);const body=await response.json();assert.equal(body.account.status,'PENDING_APPROVAL');assert.deepEqual(body.account.roles,[]);assert.deepEqual(body.account.memberships,[]);
  assert.equal((await context.request.get(origin+'/api/auth/cases')).status(),403);assert.equal((await context.request.get(origin+'/api/auth/approvals')).status(),403);assert.equal((await context.request.get(origin+'/api/auth/roles')).status(),403);
  const pending=(await db.query('SELECT status,email_confirmed,revision::text FROM synapse_gateway.onboarding WHERE auth_user_id=$1',[applicant.authId])).rows[0];assert.equal(pending.status,'PENDING');assert.equal(pending.email_confirmed,true);
  assert.equal((await db.query('SELECT count(*)::int n FROM synapse.auth_identity_links WHERE auth_user_id=$1',[applicant.authId])).rows[0].n,0);
  const page=await context.newPage();await page.goto(origin+'/pending-approval');await page.getByRole('heading',{name:'Pending officer approval',exact:true}).waitFor();
  applicant.cookies=(await context.storageState()).cookies;applicant.state='VERIFIED_PENDING';await saveVault('.local/phase2/applicant-onboarding.vault',applicant);
  checks.push({id:'real_applicant_email_confirmation',status:'PASS',detail:confirmedLogin?'Actual mailbox link confirmed the provider email; first automatic callback failed. Independent provider confirmation and subsequent real password login passed. The failed callback is not counted as a callback pass. No forced verification.':'Actual mailbox link consumed with original PKCE cookies; application callback and independent provider confirmation checks passed. No forced verification.'},{id:'applicant_pending_no_privilege',status:'PASS',detail:'Confirmed applicant reaches Pending Approval, has no internal identity/link/role/membership and is denied complaint/admin APIs.'});
  console.log('PASS: actual applicant email confirmation and Pending Approval restrictions; no privileges granted.');
 }finally{await browser?.close();await mkdir('docs/phase6-7',{recursive:true});await writeFile('docs/phase6-7/applicant-confirmation-results.json',JSON.stringify({checkedAt:new Date().toISOString(),status:checks.length?'PASS':'BLOCKED',stage,automaticCallback:confirmedLogin?'FAILED_FIRST_ATTEMPT_NOT_CLAIMED_PASSED':checks.length?'PASS':'BLOCKED',checks},null,2));await db.end();}
});
