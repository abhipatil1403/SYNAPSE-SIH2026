import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {loadVault,saveVault} from '../phase2/vault.mjs';
import {safeMain} from '../phase2/operator.mjs';
safeMain(async()=>{
 const admin=await loadVault('.local/phase2/admin-onboarding.vault'),reset=await loadVault('.local/phase2/admin-reset.vault');
 if(reset.email!==admin.email||reset.state!=='AWAITING_EMAIL_LINK')throw Error('APPROVED_RECOVERY_STATE_REQUIRED');
 if((await stat('.local/phase2/admin-reset-link.txt')).mtimeMs+1000<Date.parse(reset.createdAt))throw Error('SAVED_LINK_PREDATES_CURRENT_REQUEST');
 const link=new URL((await readFile('.local/phase2/admin-reset-link.txt','utf8')).trim().replaceAll('&amp;','&'));
 if(link.origin!=='https://xjnukuerzlrxjjqwmgkn.supabase.co'||link.pathname!=='/auth/v1/verify'||link.searchParams.get('type')!=='recovery')throw Error('UNAPPROVED_RECOVERY_LINK');
 const redirect=new URL(link.searchParams.get('redirect_to')??'');if(redirect.origin!=='http://localhost:3000'||redirect.pathname!=='/auth/callback')throw Error('UNAPPROVED_RECOVERY_REDIRECT');
 const env={...process.env};for(const key of Object.keys(env))if(/SECRET|PASSWORD|TOKEN|DATABASE_URL|PRIVATE_KEY|^SYNAPSE_/i.test(key))delete env[key];
 let browser;const checks=[];const origin='http://localhost:3000';let stage='initial_login',diagnostic=null;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true,env});
  const previous=await browser.newContext();const signed=await previous.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email:admin.email,password:admin.password}});assert.equal(signed.status(),200);
  const context=await browser.newContext();await context.addCookies(reset.cookies);
  let destination=link;stage='provider_and_callback';
  for(let i=0;i<6;i++){
   if(!['https://xjnukuerzlrxjjqwmgkn.supabase.co',origin].includes(destination.origin))throw Error('UNAPPROVED_CALLBACK_DESTINATION');
   const response=await context.request.get(destination.href,{maxRedirects:0});
   const snapshot=await context.storageState();reset.resumeCookies=snapshot.cookies;await saveVault('.local/phase2/admin-reset.vault',reset);
   diagnostic=response.headers()['x-synapse-auth-error']??diagnostic;
   if([301,302,303,307,308].includes(response.status())){const next=new URL(response.headers().location,destination);destination=next;if(next.origin===origin&&next.pathname==='/reset-password')break;}
   else throw Error('REAL_RECOVERY_REDIRECT_REJECTED');
  }
  assert.equal(destination.origin+destination.pathname,origin+'/reset-password');
  stage='password_form';const page=await context.newPage();await page.goto(destination.href);await page.getByLabel('Password',{exact:true}).fill(reset.newPassword);await page.getByLabel('Confirm password',{exact:true}).fill(reset.newPassword);
  await Promise.all([page.waitForURL(origin+'/login',{timeout:45000}),page.getByRole('button',{name:'Update password',exact:true}).click()]);
  stage='session_and_password_replay';const old=await previous.request.get(origin+'/api/auth/session');assert.equal(old.status(),401);
  const bad=await context.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email:admin.email,password:admin.password}});assert.equal(bad.status(),401);
  const good=await context.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email:admin.email,password:reset.newPassword}});assert.equal(good.status(),200);
  assert.deepEqual((await good.json()).account.roles,['SYSTEM_ADMIN']);
  admin.password=reset.newPassword;await saveVault('.local/phase2/admin-onboarding.vault',admin);reset.state='COMPLETED';await saveVault('.local/phase2/admin-reset.vault',reset);
  assert.equal((await context.request.post(origin+'/api/auth/logout',{headers:{Origin:origin},data:{}})).status(),200);
  checks.push({id:'real_email_password_reset',status:'PASS',detail:'Actual mailbox recovery link, original PKCE cookies, application callback, real password update, global session invalidation, old-password denial and new-password login all passed. No credentials or link printed.'});
  console.log('PASS: real email recovery and password change completed; old session/password rejected and new password login verified. Private vault updated.');
 }finally{await browser?.close();await mkdir('docs/phase6-7',{recursive:true});await writeFile('docs/phase6-7/admin-reset-results.json',JSON.stringify({checkedAt:new Date().toISOString(),status:checks.length?'PASS':'FAIL',stage,diagnostic,checks},null,2));}
});
