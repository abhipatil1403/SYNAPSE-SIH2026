import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {operatorContext,safeMain} from '../phase2/operator.mjs';
import {loadVault,saveVault} from '../phase2/vault.mjs';
import {applicantOrigin as origin,privateBrowserEnv} from './mail-link.mjs';
import {localExpiryValue} from '../../lib/auth/administration.ts';
safeMain(async()=>{
 const plan=JSON.parse(await readFile('.local/phase2/approved-applicant.json','utf8')),applicant=await loadVault('.local/phase2/applicant-onboarding.vault');
 const administrator=await loadVault('.local/phase2/admin-onboarding.vault'),officers=await loadVault('.local/phase2/phase2-approved-officers.vault');
 if(plan.email!==applicant.email||plan.environment!=='DEVELOPMENT_ONLY'||plan.approvedRole!=='CASE_OFFICER'||applicant.state!=='VERIFIED_PENDING')throw Error('VERIFIED_PENDING_APPLICANT_REQUIRED');
 const {db,admin}=await operatorContext({authAdmin:true});let browser;const checks=[];let original;let stage='verified_pending_preconditions';let approvalHttpStatus=null;
 const ids=officers.accounts.map(a=>a.internalUserId);
 const snapshot=async()=>createHash('sha256').update(JSON.stringify((await db.query(`SELECT
  (SELECT jsonb_agg(to_jsonb(a) ORDER BY user_role_assignment_id) FROM synapse.user_role_assignments a WHERE user_id=ANY($1::uuid[])) roles,
  (SELECT jsonb_agg(to_jsonb(m) ORDER BY membership_id) FROM synapse.user_bureau_memberships m WHERE user_id=ANY($1::uuid[])) memberships`,[ids])).rows[0])).digest('hex');
 try{
  original=await snapshot();const confirmed=await admin.getUserById(applicant.authId);assert.equal(confirmed.error,null);assert.ok(confirmed.data.user.email_confirmed_at);
  assert.equal((await db.query('SELECT count(*)::int n FROM synapse.auth_identity_links WHERE auth_user_id=$1',[applicant.authId])).rows[0].n,0);
  const pending=(await db.query('SELECT status,email_confirmed FROM synapse_gateway.onboarding WHERE auth_user_id=$1',[applicant.authId])).rows[0];assert.equal(pending.status,'PENDING');assert.ok(pending.email_confirmed);
  const gate=(await db.query('SELECT read_enabled,read_until FROM synapse.phase1_access_config')).rows[0];assert.equal(gate.read_enabled,false);assert.equal(gate.read_until,null);
  stage='administrator_login';browser=await chromium.launch({channel:'msedge',headless:true,env:privateBrowserEnv()});const context=await browser.newContext(),page=await context.newPage();
  try{const saved=await loadVault('.local/phase2/applicant-admin-session.vault');await context.addCookies(saved.cookies);}catch{}
  if((await context.request.get(origin+'/api/auth/session')).status()!==200){
   await page.goto(origin+'/login');await page.getByLabel('Email address',{exact:true}).fill(administrator.email);await page.getByLabel('Password',{exact:true}).fill(administrator.password);
   await Promise.all([page.waitForURL(origin+'/officer/dashboard'),page.getByRole('button',{name:'Sign in',exact:true}).click()]);
  }
  assert.deepEqual((await (await context.request.get(origin+'/api/auth/session')).json()).account.roles,['SYSTEM_ADMIN']);
  stage='administrator_review';await page.goto(origin+'/officer-admin');await page.getByRole('heading',{name:'Officer account approvals',exact:true}).waitFor();
  const card=page.locator('main > section.card').filter({hasText:applicant.email});await card.waitFor({state:'visible'});assert.equal(await card.count(),1);
  await card.locator('select[name="decision"]').selectOption('APPROVED');await card.locator('select[name="bureau"]').selectOption(plan.bureauId);await card.locator('select[name="role"]').selectOption('CASE_OFFICER');
  await card.getByLabel('Assignment expiry (required for approval, within 90 days)',{exact:true}).fill(localExpiryValue(plan.expiresAt).slice(0,16));
  await card.getByLabel('Decision reason',{exact:true}).fill('Explicitly approved fourth development applicant; verified real email and recovery; bounded Case Officer in the existing development Approval Bureau');
  stage='independent_approval';const [response]=await Promise.all([page.waitForResponse(r=>r.url()===origin+'/api/auth/approval'&&r.request().method()==='POST'),card.getByRole('button',{name:'Commit reviewed decision',exact:true}).click()]);approvalHttpStatus=response.status();assert.equal(response.status(),200);
  stage='assignment_and_audit_verification';
  const target=(await db.query("SELECT u.user_id,u.account_status,u.is_global_admin FROM synapse.auth_identity_links l JOIN synapse.users u ON u.user_id=l.internal_user_id WHERE l.auth_user_id=$1 AND l.revoked_at IS NULL",[applicant.authId])).rows[0];assert.ok(target);assert.equal(target.account_status,'ACTIVE');assert.equal(target.is_global_admin,false);
  const roles=(await db.query('SELECT r.role_code,a.scope_type,a.bureau_id,a.valid_until::text FROM synapse.user_role_assignments a JOIN synapse.roles r USING(role_id) WHERE a.user_id=$1',[target.user_id])).rows;
  assert.equal(roles.length,1);assert.equal(roles[0].role_code,'CASE_OFFICER');assert.equal(roles[0].scope_type,'BUREAU');assert.equal(roles[0].bureau_id,plan.bureauId);assert.equal(Date.parse(roles[0].valid_until),Date.parse(plan.expiresAt));
  const memberships=(await db.query('SELECT bureau_id,valid_until::text FROM synapse.user_bureau_memberships WHERE user_id=$1',[target.user_id])).rows;assert.equal(memberships.length,1);assert.equal(memberships[0].bureau_id,plan.bureauId);assert.equal(Date.parse(memberships[0].valid_until),Date.parse(plan.expiresAt));
  const audit=(await db.query("SELECT actor_user_id FROM synapse_gateway.account_audit WHERE auth_user_id=$1 AND action='APPROVED'",[applicant.authId])).rows;assert.equal(audit.length,1);assert.equal(audit[0].actor_user_id,administrator.internalId);
  assert.equal(await snapshot(),original);applicant.internalId=target.user_id;applicant.state='APPROVED';applicant.originalOfficersDigest=original;await saveVault('.local/phase2/applicant-onboarding.vault',applicant);
  assert.equal((await context.request.post(origin+'/api/auth/logout',{headers:{Origin:origin},data:{}})).status(),200);
  checks.push({id:'real_independent_admin_approval',status:'PASS',detail:'Existing authorized development administrator approved the verified applicant through the real administration UI/API. One bounded CASE_OFFICER Bureau role and membership were atomically created with actor audit; original officer roles/memberships unchanged.'});console.log('PASS: actual independent administrator approval, Bureau/Case Officer assignment and audit; original two officers unchanged.');
 }finally{await browser?.close();await mkdir('docs/phase6-7',{recursive:true});await writeFile('docs/phase6-7/applicant-approval-results.json',JSON.stringify({checkedAt:new Date().toISOString(),status:checks.length?'PASS':'BLOCKED',stage,approvalHttpStatus,checks,originalOfficersPreserved:original?await snapshot()===original:false},null,2));await db.end();}
});
