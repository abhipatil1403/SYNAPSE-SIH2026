import assert from 'node:assert/strict';
import {request} from '@playwright/test';
import {loadVault} from '../phase2/vault.mjs';
import {safeMain} from '../phase2/operator.mjs';
const origin='http://localhost:3000';
safeMain(async()=>{
 const officers=await loadVault('.local/phase2/phase2-approved-officers.vault'),admin=await loadVault('.local/phase2/admin-onboarding.vault');
 const anonymous=await request.newContext();try{assert.equal((await anonymous.get(origin+'/api/phase1/platform/snapshot')).status(),401);assert.equal((await anonymous.get(origin+'/api/workbench/status')).status(),401);}finally{await anonymous.dispose();}
 console.log('PASS actual HTTP: unauthenticated isolated APIs denied.');
 for(const [index,account] of [...officers.accounts,admin].entries()){
  const ctx=await request.newContext();let stage="login";try{
   const login=await ctx.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email:account.email,password:account.password}});assert.equal(login.status(),200);assert.equal((await login.json()).account.status,'APPROVED');
   stage='snapshot';const response=await ctx.get(origin+'/api/phase1/platform/snapshot');assert.equal(response.status(),200);assert.match(response.headers()['x-synapse-data-source'],/ISOLATED POSTGRES/);const data=await response.json();
   assert.equal(data.me.id,index<2?account.internalUserId:account.internalId);assert.ok(!('staff' in data)&&!('grants' in data)&&!('receipts' in data));
   // The owner manual environment starts empty. This test does not manufacture
   // positive case rows or disturb subsequent owner-created test records.
   if(index===2)assert.equal(data.cases.length,0,'Configuration administrator has no case privileges.');
   stage='status';assert.equal((await ctx.get(origin+'/api/workbench/status')).status(),200);
   stage='approvals';const approvals=await ctx.get(origin+'/api/auth/approvals');if(index<2)assert.equal(approvals.status(),403);else{assert.equal(approvals.status(),200);const listing=await approvals.json();assert.ok(listing.requests.every(item=>typeof item.requested_at==='string'&&Array.isArray(item.history)));
    stage='duplicate';const duplicate=await ctx.post(origin+'/api/auth/signup',{headers:{Origin:origin},data:{email:account.email,password:account.password}});assert.equal(duplicate.status(),409,'Existing-account password signup must be rejected without replacing identity or authority.');
   }
   const missing='30000000-0000-4000-8000-999999999999';assert.equal((await ctx.get(origin+'/api/workbench/attachments/'+missing+'?id='+missing)).status(),404);
   assert.equal((await ctx.post(origin+'/api/workbench/config',{headers:{Origin:'https://untrusted.example.invalid'},data:{}})).status(),403);
   assert.equal((await ctx.post(origin+'/api/auth/logout',{headers:{Origin:origin},data:{}})).status(),200);assert.equal((await ctx.get(origin+'/api/phase1/platform/snapshot')).status(),401);
   console.log('PASS actual HTTP: approved '+(index<2?'officer '+(index+1):'configuration administrator')+' hosted login/current identity, isolated projection, document denial, CSRF and logout.');
  }catch(error){console.error(JSON.stringify({test:"isolated_http",slot:index,stage,actual:typeof error.actual==="number"?error.actual:null,expected:typeof error.expected==="number"?error.expected:null}));throw error;}finally{await ctx.dispose();}
 }
 const applicant=await loadVault('.local/phase2/applicant-onboarding.vault'),pending=await request.newContext();try{
  const response=await pending.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email:applicant.email,password:applicant.password}});assert.equal(response.status(),200);assert.equal((await response.json()).account.status,'PENDING_APPROVAL');
  assert.equal((await pending.get(origin+'/api/phase1/platform/snapshot')).status(),403);assert.equal((await pending.get(origin+'/api/workbench/status')).status(),403);
  const page=await pending.get(origin+'/platform/dashboard',{maxRedirects:0});assert.equal(page.status(),307);assert.ok(page.headers().location.endsWith('/pending-approval'));
  assert.equal((await pending.post(origin+'/api/auth/logout',{headers:{Origin:origin},data:{}})).status(),200);console.log('PASS actual HTTP: recovered role-revoked applicant remains Pending Approval and denied isolated data.');
 }finally{await pending.dispose();}
 console.log('PASS no business records or hosted roles written; owner manual acceptance remains pending.');
});
