import {test,expect} from '@playwright/test';
import {loadVault} from '../../scripts/phase2/vault.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
test.use({trace:'off',screenshot:'off',video:'off',reducedMotion:'reduce'});
test.skip(process.env.SYNAPSE_HOSTED_BROWSER_APPROVED!=='true','Requires current owner-approved real credential vault and dedicated hosted-account test runner.');
test('actual Supabase account workspace loads, admin/profile work and case data stays locked',async({browser})=>{
 const vault=await loadVault('.local/acceptance/real-users.vault');expect(vault.environment).toBe('DEVELOPMENT_REAL_AUTH');const results=[];
 const origin=process.env.SYNAPSE_TEST_ORIGIN!;
 for(const [slot,account] of vault.accounts.entries()){
  const context=await browser.newContext({baseURL:origin,reducedMotion:'reduce'}),page=await context.newPage();
  try{
   await page.goto('/login');try{await page.getByLabel('Email address',{exact:true}).fill(account.email);await page.getByLabel('Password',{exact:true}).fill(account.password);}catch{throw Error('Secure login form unavailable; credential values withheld.');}
   const [login]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/auth/login')),page.getByRole('button',{name:'Sign In',exact:true}).click()]);
   if(!login.ok())await page.locator('input[type=password]').fill('');expect(login.status(),'Real approved login must succeed; credential values withheld').toBe(200);
   await page.waitForURL('**/dashboard');await expect(page.locator('.app-shell')).toBeVisible();await expect(page.getByRole('heading',{name:'Complaint access awaiting review'})).toBeVisible();
   const r=await context.request.get('/api/workspace/snapshot');expect(r.status()).toBe(200);const s=await r.json();expect(s.workspace.mode).toBe('ACCOUNT_ONLY');expect(s.cases).toEqual([]);expect(s.me.id).toBeTruthy();expect(s.directory).toHaveLength(1);
   await page.goto('/settings');await expect(page.getByRole('heading',{name:'Profile & account security'})).toBeVisible();await expect(page.getByLabel('Display name',{exact:true})).toBeVisible();
   if(s.me.roles.includes('SYSTEM_ADMIN')){await page.goto('/admin');await expect(page.getByRole('heading',{name:'User Approvals'})).toBeVisible();}
   else{expect((await context.request.get('/api/auth/approvals')).status()).toBe(403);}
   expect((await context.request.post('/api/workspace/commands',{headers:{Origin:origin},data:{idempotencyKey:crypto.randomUUID(),command:{type:'category.create',name:'Should never commit'}}})).status()).toBe(503);
   expect((await context.request.get('/api/workspace/cases/'+crypto.randomUUID())).status()).toBe(404);
   await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   const before=await context.storageState();expect((await context.request.post('/api/auth/logout',{headers:{Origin:origin},data:{}})).status()).toBe(200);
   const replay=await browser.newContext({baseURL:origin,storageState:before});try{expect((await replay.request.get('/api/workspace/snapshot')).status()).toBe(401);}finally{await replay.close();}
   results.push({slot,snapshotHttp:200,mode:'ACCOUNT_ONLY',roles:s.me.roles,profileRendered:true,adminBoundaryVerified:true,writesDenied:true,logoutReplayDenied:true});
  }finally{await page.locator('input[type=password]').evaluateAll(inputs=>inputs.forEach(i=>{(i as HTMLInputElement).value='';})).catch(()=>{});await context.request.post('/api/auth/logout',{headers:{Origin:origin},data:{}}).catch(()=>{});await context.close();}
 }
 await mkdir('docs/phase11',{recursive:true});await writeFile('docs/phase11/BROWSER_EVIDENCE.json',JSON.stringify({checkedAt:new Date().toISOString(),source:'Actual hosted Supabase Auth/private account workspace in production Next.js at loopback test origin; no local operational database, seeded business data or mocked API. Not deployed HTTPS acceptance.',results,actualIssuedJwt:true,providerMocked:false,caseReadLeaseEnabled:false,businessWritesEnabled:false,manualAcceptance:'AWAITING USER MANUAL TESTING'},null,2)+'\n');
});
