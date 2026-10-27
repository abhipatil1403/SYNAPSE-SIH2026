import { createServerClient } from "@supabase/ssr";
import { randomBytes } from "node:crypto";
import { readFile,writeFile,mkdir } from "node:fs/promises";
import { operatorContext,safeMain } from "../phase2/operator.mjs";
import { loadVault,saveVault } from "../phase2/vault.mjs";
// Explicit approved third identity only; no email-confirm bypass or admin role.
safeMain(async()=>{
 const approval=JSON.parse(await readFile('.local/phase2/approved-admin.json','utf8'));
 if(approval.approvedRole!=='SYSTEM_ADMIN'||approval.environment!=='DEVELOPMENT_ONLY'||Date.parse(approval.expiresAt)<=Date.now())throw Error('ADMIN_APPROVAL_INVALID');
 const {db,admin,url,key}=await operatorContext({authAdmin:true});let evidence;
 try{
  const users=await admin.listUsers({page:1,perPage:100});if(users.error||users.data.users.length===100)throw Error('BOUNDED_IDENTITY_LOOKUP_REQUIRED');
  const existing=users.data.users.find(u=>u.email?.toLowerCase()===approval.email.toLowerCase());
  if(existing)throw Error('EXISTING_IDENTITY_REQUIRES_REVIEW_NO_RECREATE');
  const state={password:randomBytes(36).toString('base64url'),email:approval.email,cookies:[],state:'SIGNUP_PENDING'};
  await saveVault('.local/phase2/admin-onboarding.vault',state);
  const cookies=new Map();
  const client=createServerClient(url,key,{cookieOptions:{name:'synapse-auth-session',path:'/',httpOnly:true,sameSite:'lax'},cookies:{getAll:()=>[...cookies.values()],setAll:values=>values.forEach(c=>cookies.set(c.name,c))}});
  const result=await client.auth.signUp({email:state.email,password:state.password,options:{emailRedirectTo:'http://localhost:3000/auth/callback',data:{display_name:'SYNAPSE Development Administrator'}}});
  state.cookies=[...cookies.values()];state.authId=result.data.user?.id??null;state.state=result.error?'SIGNUP_BLOCKED':'AWAITING_EMAIL_CONFIRMATION';await saveVault('.local/phase2/admin-onboarding.vault',state);
  const code=result.error?.code??null;
  const count=(await db.query('SELECT count(*)::int n FROM synapse.users WHERE lower(email)=lower($1)',[approval.email])).rows[0].n;
  evidence={checkedAt:new Date().toISOString(),identityWasAbsent:true,signup:result.error?'BLOCKED':'PASS',providerStatus:result.error?.status??200,providerCode:code,emailConfirmed:!!result.data.user?.email_confirmed_at,internalUserCreated:count>0,adminGranted:false,verification:'PENDING_ACTUAL_EMAIL_LINK'};
  if(result.data.session)throw Error('UNEXPECTED_AUTOCONFIRMED_SESSION_REQUIRES_REVIEW');
  console.log(JSON.stringify(evidence));
 }finally{if(evidence){await mkdir('docs/phase6-7',{recursive:true});await writeFile('docs/phase6-7/admin-signup-results.json',JSON.stringify(evidence,null,2));}await db.end();}
});
