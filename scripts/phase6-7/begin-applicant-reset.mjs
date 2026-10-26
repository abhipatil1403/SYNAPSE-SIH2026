import assert from 'node:assert/strict';
import {request} from '@playwright/test';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {loadVault,saveVault} from '../phase2/vault.mjs';
import {safeMain} from '../phase2/operator.mjs';
import {applicantOrigin as origin} from './mail-link.mjs';
safeMain(async()=>{
 const applicant=await loadVault('.local/phase2/applicant-onboarding.vault');
 if(!['VERIFIED_PENDING','APPROVED','ROLE_REVOKED'].includes(applicant.state))throw Error('VERIFIED_APPLICANT_REQUIRED');
 let prior;try{prior=await loadVault('.local/phase2/applicant-reset.vault');}catch{}
 if(prior?.state==='AWAITING_EMAIL_LINK'&&!process.argv.includes('--replace-outstanding-request'))throw Error('OUTSTANDING_ORIGINAL_PKCE_SESSION_PRESERVED');
 const context=await request.newContext();
 try{
  const state={email:applicant.email,newPassword:randomBytes(36).toString('base64url'),createdAt:new Date().toISOString(),state:'REQUESTING',cookies:[]};await saveVault('.local/phase2/applicant-reset.vault',state);
  const response=await context.post(origin+'/api/auth/forgot-password',{headers:{Origin:origin},data:{email:state.email}});
  state.cookies=(await context.storageState()).cookies;state.state=response.ok()?'AWAITING_EMAIL_LINK':'BLOCKED';await saveVault('.local/phase2/applicant-reset.vault',state);
  const body=await response.json();const code=/^[a-z_]+$/.test(body.error?.code??'')?body.error.code:null;
  await mkdir('docs/phase6-7',{recursive:true});await writeFile('docs/phase6-7/applicant-reset-request-results.json',JSON.stringify({checkedAt:new Date().toISOString(),httpStatus:response.status(),errorCode:code,request:response.ok()?'PASS':'BLOCKED',actualDelivery:'AWAITING_REAL_MAILBOX_LINK',passwordChanged:false},null,2));
  assert.equal(response.status(),200);console.log('PASS: real applicant password-reset request accepted; waiting for actual mailbox link with original encrypted PKCE session.');
 }finally{await context.dispose();}
});
