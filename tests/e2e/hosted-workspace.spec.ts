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
   await expect(page.locator('[data-testid="account-overview"] .metric')).toHaveCount(4);await expect(page.locator('[data-testid="account-overview"] .metric strong')).toHaveText(['—','—','—','—']);
   const quick=page.locator('.quick-calendar-card'),month=quick.locator('.quick-calendar-toolbar h3'),initialMonth=await month.innerText();
   await quick.getByRole('button',{name:'Next month',exact:true}).click();await expect(month).not.toHaveText(initialMonth);await quick.getByRole('button',{name:'Today',exact:true}).click();await expect(month).toHaveText(initialMonth);
   if(slot===0){await mkdir('.local/phase12',{recursive:true});await page.setViewportSize({width:1536,height:1024});await page.screenshot({path:'.local/phase12/account-overview-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:'.local/phase12/account-overview-mobile.png',fullPage:true});await page.setViewportSize({width:1280,height:900});}
   const intake=await context.request.get('/intake?_rsc=account-route-regression',{headers:{RSC:'1','Next-Router-Prefetch':'1','Next-Url':'/dashboard'}});expect(intake.status()).toBe(200);
   const intakeRoute=page.getByRole('link',{name:'Intake Queue',exact:true});await intakeRoute.click();await page.waitForURL('**/intake');await expect(page.getByRole('heading',{name:'Complaint access awaiting review'})).toBeVisible();await page.goto('/dashboard');
   await page.getByRole('link',{name:'Open Full Calendar',exact:true}).click();await page.waitForURL(/\/calendar\?date=/);await expect(page.getByRole('heading',{name:'Case events unavailable'})).toBeVisible();
   const r=await context.request.get('/api/workspace/snapshot');expect(r.status()).toBe(200);const s=await r.json();expect(s.workspace.mode).toBe('ACCOUNT_ONLY');expect(s.cases).toEqual([]);expect(s.me.id).toBeTruthy();expect(s.directory).toHaveLength(1);
   await page.goto('/settings');await expect(page.getByRole('heading',{name:'Profile & account security'})).toBeVisible();await expect(page.getByLabel('Display name',{exact:true})).toBeVisible();
   if(s.me.roles.includes('SYSTEM_ADMIN')){await page.goto('/admin');await expect(page.getByRole('heading',{name:'User Approvals'})).toBeVisible();}
   else{expect((await context.request.get('/api/auth/approvals')).status()).toBe(403);}
   expect((await context.request.post('/api/workspace/commands',{headers:{Origin:origin},data:{idempotencyKey:crypto.randomUUID(),command:{type:'category.create',name:'Should never commit'}}})).status()).toBe(503);
   expect((await context.request.get('/api/workspace/cases/'+crypto.randomUUID())).status()).toBe(404);
   await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   const before=await context.storageState();expect((await context.request.post('/api/auth/logout',{headers:{Origin:origin},data:{}})).status()).toBe(200);
   const replay=await browser.newContext({baseURL:origin,storageState:before});try{expect((await replay.request.get('/api/workspace/snapshot')).status()).toBe(401);}finally{await replay.close();}
   results.push({slot,snapshotHttp:200,mode:'ACCOUNT_ONLY',roles:s.me.roles,dashboardCardsVisible:true,unavailableMetricsNotZero:true,dateOnlyCalendarWorks:true,intakeRscHttp:200,intakeNavigationWorks:true,profileRendered:true,adminBoundaryVerified:true,writesDenied:true,logoutReplayDenied:true});
  }finally{await page.locator('input[type=password]').evaluateAll(inputs=>inputs.forEach(i=>{(i as HTMLInputElement).value='';})).catch(()=>{});await context.request.post('/api/auth/logout',{headers:{Origin:origin},data:{}}).catch(()=>{});await context.close();}
 }
 await mkdir('docs/phase12',{recursive:true});await writeFile('docs/phase12/BROWSER_EVIDENCE.json',JSON.stringify({checkedAt:new Date().toISOString(),source:'Actual hosted Supabase Auth/private account workspace in production Next.js at loopback test origin; no local operational database, seeded business data or mocked API. Not deployed HTTPS acceptance.',results,actualIssuedJwt:true,providerMocked:false,caseReadLeaseEnabled:false,businessWritesEnabled:false,manualAcceptance:'AWAITING USER MANUAL TESTING'},null,2)+'\n');
});
