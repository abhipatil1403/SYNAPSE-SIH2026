import {privateProfileSchema} from '../lib/auth/profile';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {passwordSignUp} from '../lib/auth/password-signup';
import {signupSchema,accountSchema,accountDestination} from '../lib/auth/policy';
import {validateOwnerPlan} from '../scripts/phase9/bootstrap-transaction.mjs';

test('SIMULATED real SDK password signup omits PKCE/callback and accepts an immediate session',async()=>{
 const id='50000000-0000-4000-8000-000000000001';
 const token=['contract',Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'not-a-real-signature'].join('.');
 const result=await passwordSignUp({url:'https://contract.supabase.co',key:'contract-publishable'},signupSchema.parse({email:'applicant@example.invalid',password:'contract-only-long-password'}),async(input,init)=>{
  const url=new URL(String(input));assert.equal(url.pathname,'/auth/v1/signup');assert.equal(url.searchParams.has('redirect_to'),false);const body=JSON.parse(String(init?.body));assert.equal(body.email,'applicant@example.invalid');assert.ok(!body.code_challenge);assert.equal(body.data.role,undefined);
  return Response.json({access_token:token,refresh_token:'contract-only-refresh',expires_in:3600,token_type:'bearer',user:{id,aud:'authenticated',email:'applicant@example.invalid',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}});
 });
 assert.equal(result.error,null);assert.ok(result.data.session);assert.equal(result.data.user?.id,id);
});

test('approval status preserves rejected/revoked review while all unapproved identities stay on pending route',()=>{
 for(const status of ['PENDING','REJECTED','SUSPENDED','REVOKED'] as const){const account=accountSchema.parse({status:'PENDING_APPROVAL',roles:[],memberships:[],application:{status,requestedAt:new Date().toISOString(),decidedAt:null}});assert.equal(accountDestination(account),'/pending-approval');}
 assert.equal(signupSchema.safeParse({email:'applicant@example.invalid',password:'contract-only-long-password',role:'SYSTEM_ADMIN'}).success,false);
});

test('owner bootstrap plan rejects absent UUID, nondevelopment scope and invalid/unbounded expiry',()=>{
 const plan={environment:'DEVELOPMENT_ONLY',approvedRole:'SYSTEM_ADMIN',scope:'GLOBAL',authId:'50000000-0000-4000-8000-000000000001',email:'operator@example.invalid',expiresAt:new Date(Date.now()+86400000).toISOString(),reason:'Explicit owner development approval'};validateOwnerPlan(plan);
 for(const change of [{authId:'first-user'},{environment:'PRODUCTION'},{expiresAt:'not-a-date'},{expiresAt:new Date(Date.now()+100*86400000).toISOString()},{approvedRole:'CASE_OFFICER'}])assert.throws(()=>validateOwnerPlan({...plan,...change}));
});

test('private SQL pending shape may omit its absent decision timestamp without implying approval',()=>{
 const account=accountSchema.parse({status:'PENDING_APPROVAL',roles:[],memberships:[],application:{status:'PENDING',requestedAt:new Date().toISOString()}});assert.equal(accountDestination(account),'/pending-approval');assert.equal(account.application?.decidedAt,undefined);
});

test('private SQL nullable scope/expiry fields normalize to canonical null without fabricating identity or role',()=>{
 const id='50000000-0000-4000-8000-000000000001',at='2026-10-26T00:00:00Z';
 const admin=privateProfileSchema.parse({id,authId:id,name:'Configuration administrator',active:true,memberships:[],roles:[{code:'SYSTEM_ADMIN',from:at}]});
 assert.equal(admin.roles[0].bureauId,null);assert.equal(admin.roles[0].until,null);
 const officer=privateProfileSchema.parse({id,authId:id,name:'Officer',active:true,memberships:[{bureauId:id,from:at}],roles:[{code:'CASE_OFFICER',bureauId:id,from:at}]});assert.equal(officer.memberships[0].until,null);
 assert.equal(privateProfileSchema.safeParse({id,authId:id,name:'Invalid',active:true,memberships:[],roles:[{bureauId:id,from:at}]}).success,false);
});
