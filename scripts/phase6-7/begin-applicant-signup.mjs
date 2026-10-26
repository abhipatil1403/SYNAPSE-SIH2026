import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {operatorContext,safeMain} from '../phase2/operator.mjs';
import {saveVault} from '../phase2/vault.mjs';
safeMain(async()=>{
 const plan=JSON.parse(await readFile('.local/phase2/approved-applicant.json','utf8'));
 if(plan.environment!=='DEVELOPMENT_ONLY'||plan.approvedRole!=='CASE_OFFICER'||Date.parse(plan.expiresAt)<=Date.now())throw Error('APPROVED_APPLICANT_REQUIRED');
 const {db,admin}=await operatorContext({authAdmin:true});let browser,evidence;
 try{
  const lookup=await admin.listUsers({page:1,perPage:100});assert.equal(lookup.error,null);assert.ok(lookup.data.users.length<100);
  assert.ok(!lookup.data.users.some(u=>u.email?.toLowerCase()===plan.email.toLowerCase()));
  assert.equal((await db.query('SELECT count(*)::int n FROM synapse.users WHERE lower(email)=lower($1)',[plan.email])).rows[0].n,0);
  const state={email:plan.email,password:randomBytes(36).toString('base64url'),createdAt:new Date().toISOString(),state:'SIGNUP_PENDING',cookies:[]};
  await saveVault('.local/phase2/applicant-onboarding.vault',state);
  const env={...process.env};for(const key of Object.keys(env))if(/SECRET|PASSWORD|TOKEN|DATABASE_URL|PRIVATE_KEY|^SYNAPSE_/i.test(key))delete env[key];
  browser=await chromium.launch({channel:'msedge',headless:true,env});const context=await browser.newContext(),page=await context.newPage();
  await page.goto('http://localhost:3000/signup');await page.getByLabel('Email address',{exact:true}).fill(state.email);await page.getByLabel('Password',{exact:true}).fill(state.password);await page.getByLabel('Confirm password',{exact:true}).fill(state.password);
  await page.getByLabel('Full name',{exact:true}).fill('SYNAPSE Development Officer Applicant');
  const [response]=await Promise.all([page.waitForResponse(r=>r.url()==='http://localhost:3000/api/auth/signup'&&r.request().method()==='POST'),page.getByRole('button',{name:'Request account',exact:true}).click()]);
  state.cookies=(await context.storageState()).cookies;state.state=response.ok()?'AWAITING_EMAIL_CONFIRMATION':'SIGNUP_BLOCKED';await saveVault('.local/phase2/applicant-onboarding.vault',state);
  const users=await admin.listUsers({page:1,perPage:100});assert.equal(users.error,null);assert.ok(users.data.users.length<100);const user=users.data.users.find(u=>u.email?.toLowerCase()===plan.email.toLowerCase());
  if(user){state.authId=user.id;await saveVault('.local/phase2/applicant-onboarding.vault',state);}
  const internal=(await db.query('SELECT count(*)::int n FROM synapse.users WHERE lower(email)=lower($1)',[plan.email])).rows[0].n;
  evidence={checkedAt:new Date().toISOString(),identityWasAbsent:true,httpStatus:response.status(),signup:response.ok()?'PASS':'BLOCKED',providerUserCreated:!!user,emailConfirmed:!!user?.email_confirmed_at,internalUsersCreated:internal,privilegesGranted:false,actualEmailConfirmation:'AWAITING_UNOPENED_MAILBOX_LINK'};
  assert.equal(response.status(),200);assert.ok(user);assert.ok(!user.email_confirmed_at);assert.equal(internal,0);
  assert.equal((await context.request.get('http://localhost:3000/api/auth/session')).status(),401);
  assert.equal((await context.request.get('http://localhost:3000/api/auth/cases')).status(),401);
  console.log('PASS: approved applicant registered through the real application form/provider; email confirmation pending; no internal identity, membership or role granted.');
 }finally{await browser?.close();if(evidence){await mkdir('docs/phase6-7',{recursive:true});await writeFile('docs/phase6-7/applicant-signup-results.json',JSON.stringify(evidence,null,2));}await db.end();}
});
