import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {loadVault,saveVault} from '../phase2/vault.mjs';
import {safeMain} from '../phase2/operator.mjs';
import {applicantOrigin as origin,savedMailLink,followMailLink,privateBrowserEnv} from './mail-link.mjs';
safeMain(async()=>{
 const applicant=await loadVault('.local/phase2/applicant-onboarding.vault'),reset=await loadVault('.local/phase2/applicant-reset.vault');
 if(applicant.email!==reset.email||reset.state!=='AWAITING_EMAIL_LINK')throw Error('APPROVED_APPLICANT_RECOVERY_REQUIRED');
 let browser,stage='mail_link',callbackDiagnostic=null;const checks=[];
 try{
  const link=await savedMailLink('.local/phase2/applicant-reset-link.txt',reset.createdAt,['recovery']);
  browser=await chromium.launch({channel:'msedge',headless:true,env:privateBrowserEnv()});const previous=await browser.newContext();
  assert.equal((await previous.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email:applicant.email,password:applicant.password}})).status(),200);
  const context=await browser.newContext();await context.addCookies(reset.cookies);stage='actual_callback';
  await followMailLink(context,link,'/reset-password',async(cookies,next)=>{reset.resumeCookies=cookies;reset.resumeDestination=next;await saveVault('.local/phase2/applicant-reset.vault',reset);});
  stage='password_change';const page=await context.newPage();await page.goto(origin+'/reset-password');await page.getByLabel('Password',{exact:true}).fill(reset.newPassword);await page.getByLabel('Confirm password',{exact:true}).fill(reset.newPassword);
  const [changed]=await Promise.all([page.waitForResponse(r=>r.url()===origin+'/api/auth/reset-password'&&r.request().method()==='POST'),page.getByRole('button',{name:'Update password',exact:true}).click()]);
  assert.equal(changed.status(),200);
  // Persist the successfully changed credential before any subsequent assertion,
  // so a failed verification never strands this approved development identity.
  const oldPassword=applicant.password;applicant.password=reset.newPassword;await saveVault('.local/phase2/applicant-onboarding.vault',applicant);
  stage='old_session_and_password_rejection';assert.equal((await previous.request.get(origin+'/api/auth/session')).status(),401);
  assert.equal((await context.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email:applicant.email,password:oldPassword}})).status(),401);
  const good=await context.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email:applicant.email,password:applicant.password}});assert.equal(good.status(),200);
  assert.deepEqual((await good.json()).account.roles,applicant.state==='APPROVED'?['CASE_OFFICER']:[]);
  assert.equal((await context.request.post(origin+'/api/auth/logout',{headers:{Origin:origin},data:{}})).status(),200);reset.state='COMPLETED';await saveVault('.local/phase2/applicant-reset.vault',reset);
  checks.push({id:'real_applicant_mailbox_recovery',status:'PASS',detail:'Actual applicant reset email link and original PKCE session completed callback/password change; old password/session denied, new password login and logout verified.'});
  console.log('PASS: actual applicant mailbox recovery, password update, old password/session rejection and new password login.');
 }catch(error){callbackDiagnostic=error.callbackStage?{stage:error.callbackStage,code:error.callbackCode}:null;throw error;}
 finally{await browser?.close();await mkdir('docs/phase6-7',{recursive:true});await writeFile('docs/phase6-7/applicant-reset-results.json',JSON.stringify({checkedAt:new Date().toISOString(),status:checks.length?'PASS':'BLOCKED',stage,callbackDiagnostic,checks},null,2));}
});
