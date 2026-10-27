import { readFile,writeFile,mkdir } from "node:fs/promises";
import { randomUUID,createHash } from "node:crypto";
import { operatorContext,safeMain } from "../phase2/operator.mjs";
import { loadVault,saveVault } from "../phase2/vault.mjs";
// Explicit initial DEVELOPMENT administrator only. Provider email confirmation
// and a real application's pending request are prerequisites, not bypassed here.
safeMain(async()=>{
 const plan=JSON.parse(await readFile('.local/phase2/approved-admin.json','utf8'));
 const vault=await loadVault('.local/phase2/admin-onboarding.vault');
 if(plan.email!==vault.email||plan.approvedRole!=='SYSTEM_ADMIN'||plan.scope!=='GLOBAL'||plan.environment!=='DEVELOPMENT_ONLY'||Date.parse(plan.expiresAt)<=Date.now()||Date.parse(plan.expiresAt)>Date.now()+90*86400000)throw Error('EXPLICIT_ADMIN_APPROVAL_INVALID');
 const {db,admin}=await operatorContext({authAdmin:true});
 let evidence={checkedAt:new Date().toISOString(),status:'BLOCKED',emailVerified:false,adminGranted:false,officersUnchanged:true};
 try{
  if(!vault.authId)throw Error('SUCCESSFUL_SIGNUP_REQUIRED');
  const provider=await admin.getUserById(vault.authId);
  if(provider.error||provider.data.user.email?.toLowerCase()!==plan.email.toLowerCase())throw Error('APPROVED_AUTH_UUID_MISMATCH');
  if(!provider.data.user.email_confirmed_at){console.log('BLOCKED: Supabase has not confirmed the approved email. No account or role was created.');return;}
  evidence.emailVerified=true;
  const pending=(await db.query("SELECT auth_user_id,status,email_confirmed FROM synapse_gateway.onboarding WHERE auth_user_id=$1",[vault.authId])).rows[0];
  if(!pending){console.log('BLOCKED: email is verified; first complete real application login to record Pending Approval. No role created.');return;}
  if(!process.argv.includes('--bootstrap-verified-admin')){console.log('PASS: verified email and pending request; explicit --bootstrap-verified-admin is required for the authorized initial role.');return;}
  const officers=await loadVault('.local/phase2/phase2-approved-officers.vault');
  if(officers.accounts.some(a=>a.authUserId===vault.authId))throw Error('EXISTING_OFFICER_ELEVATION_FORBIDDEN');
  const officerIds=officers.accounts.map(a=>a.internalUserId);
  const snapshot=async()=>(await db.query("SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY user_role_assignment_id),'[]'::jsonb) data FROM synapse.user_role_assignments a WHERE user_id=ANY($1::uuid[])",[officerIds])).rows[0].data;
  const original=JSON.stringify(await snapshot());
  await db.query('BEGIN');
  try{
   const gate=(await db.query('SELECT read_enabled,read_until FROM synapse.phase1_access_config FOR UPDATE')).rows[0];
   if(gate.read_enabled||gate.read_until)throw Error('READ_GATES_MUST_BE_CLOSED');
   const existing=(await db.query("SELECT l.internal_user_id FROM synapse.auth_identity_links l JOIN synapse.user_role_assignments a ON a.user_id=l.internal_user_id JOIN synapse.roles r USING(role_id) WHERE l.auth_user_id=$1 AND l.revoked_at IS NULL AND r.role_code='SYSTEM_ADMIN' AND a.scope_type='GLOBAL' AND a.valid_until=$2",[vault.authId,plan.expiresAt])).rows;
   if(existing.length===1){vault.internalId=existing[0].internal_user_id;vault.state='BOOTSTRAPPED';await db.query('ROLLBACK');await saveVault('.local/phase2/admin-onboarding.vault',vault);evidence.status='PASS_ALREADY_PROVISIONED';evidence.adminGranted=true;return;}
   if((await db.query("SELECT 1 FROM synapse.user_role_assignments a JOIN synapse.roles r USING(role_id) WHERE r.role_code='SYSTEM_ADMIN' AND a.scope_type='GLOBAL' AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now())")).rowCount)throw Error('EXISTING_ADMIN_MUST_USE_NORMAL_WORKFLOW');
   const target=(await db.query("SELECT * FROM synapse_gateway.onboarding WHERE auth_user_id=$1 FOR UPDATE",[vault.authId])).rows[0];
   if(target.status!=='PENDING'||!target.email_confirmed||target.email.toLowerCase()!==plan.email.toLowerCase())throw Error('VERIFIED_PENDING_ACCOUNT_REQUIRED');
   if((await db.query('SELECT 1 FROM synapse.users WHERE lower(email)=lower($1)',[plan.email])).rowCount)throw Error('EXISTING_IDENTITY_RECONCILIATION_REQUIRED');
   const role=(await db.query("SELECT role_id FROM synapse.roles WHERE role_code='SYSTEM_ADMIN' AND is_active")).rows[0];if(!role)throw Error('DEPLOYED_ADMIN_ROLE_UNAVAILABLE');
   const internalId=randomUUID();
   await db.query("INSERT INTO synapse.users(user_id,email,display_name,account_status,is_global_admin) VALUES($1,$2,'SYNAPSE Development Administrator','ACTIVE',false)",[internalId,plan.email]);
   await db.query('INSERT INTO synapse.auth_identity_links(auth_user_id,internal_user_id) VALUES($1,$2)',[vault.authId,internalId]);
   await db.query("INSERT INTO synapse.user_role_assignments(user_id,role_id,scope_type,valid_until) VALUES($1,$2,'GLOBAL',$3)",[internalId,role.role_id,plan.expiresAt]);
   const digest=createHash('sha256').update(JSON.stringify(plan)).digest('hex');
   await db.query("UPDATE synapse_gateway.onboarding SET status='APPROVED',revision=revision+1,decided_at=now(),reason='Explicit authorized operator development-admin bootstrap after provider email verification' WHERE auth_user_id=$1",[vault.authId]);
   await db.query("INSERT INTO synapse_gateway.account_audit(auth_user_id,actor_user_id,action,detail) VALUES($1,NULL,'DEVELOPMENT_ADMIN_BOOTSTRAP',$2)",[vault.authId,{approvalDigest:digest,role:'SYSTEM_ADMIN',scope:'GLOBAL',expiresAt:plan.expiresAt,emailConfirmedAt:provider.data.user.email_confirmed_at,source:'Explicit operator/bootstrap authorization; no automatic signup elevation',complaintAccessGranted:false}]);
   if(JSON.stringify(await snapshot())!==original)throw Error('OFFICER_ROLES_CHANGED');
   await db.query('COMMIT');vault.internalId=internalId;vault.state='BOOTSTRAPPED';await saveVault('.local/phase2/admin-onboarding.vault',vault);
   evidence.status='PASS';evidence.adminGranted=true;
   console.log('PASS: verified development administrator provisioned with expiring configuration-only role and audit. No officer role, Bureau membership or complaint access was added.');
  }catch(e){await db.query('ROLLBACK');throw e;}
 }finally{await mkdir('docs/phase6-7',{recursive:true});await writeFile('docs/phase6-7/admin-bootstrap-results.json',JSON.stringify(evidence,null,2));await db.end();}
});
