import {request} from '@playwright/test';
import {randomBytes} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {loadVault,saveVault} from '../phase2/vault.mjs';
import {safeMain} from '../phase2/operator.mjs';
safeMain(async()=>{
 const admin=await loadVault('.local/phase2/admin-onboarding.vault');if(admin.state!=='BOOTSTRAPPED')throw Error('VERIFIED_ADMIN_REQUIRED');
 const context=await request.newContext({baseURL:'http://localhost:3000'});
 try{
  const state={email:admin.email,newPassword:randomBytes(36).toString('base64url'),createdAt:new Date().toISOString(),cookies:[],state:'REQUESTING'};
  await saveVault('.local/phase2/admin-reset.vault',state);
  const response=await context.post('/api/auth/forgot-password',{headers:{Origin:'http://localhost:3000'},data:{email:admin.email}});
  const storage=await context.storageState();state.cookies=storage.cookies;state.state=response.ok()?'AWAITING_EMAIL_LINK':'BLOCKED';await saveVault('.local/phase2/admin-reset.vault',state);
  await mkdir('docs/phase6-7',{recursive:true});await writeFile('docs/phase6-7/admin-reset-request-results.json',JSON.stringify({checkedAt:new Date().toISOString(),status:response.ok()?'PASS':'BLOCKED',httpStatus:response.status(),passwordChanged:false,completeFlow:'AWAITING_REAL_EMAIL_LINK'},null,2));
  console.log(response.ok()?'PASS: real application/provider password-reset request accepted. Original PKCE cookies and planned new password are encrypted locally; waiting for the actual email link.':'BLOCKED: reset provider request was not accepted. No password changed.');
 }finally{await context.dispose();}
});
