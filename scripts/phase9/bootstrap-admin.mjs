import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {transactBootstrap,validateOwnerPlan} from './bootstrap-transaction.mjs';
import {operatorContext,safeMain} from '../phase2/operator.mjs';
import {loadVault,saveVault} from '../phase2/vault.mjs';
safeMain(async()=>{
 const {db,admin}=await operatorContext({authAdmin:true});try{
  await mkdir('.local/phase9',{recursive:true});
  if(process.argv.includes('--snapshot-approved-admin')){
   const prior=await loadVault('.local/phase2/admin-onboarding.vault'),approval=JSON.parse(await readFile('.local/phase2/approved-admin.json','utf8'));
   const user=(await admin.getUserById(prior.authId)).data.user;if(!user||user.email.toLowerCase()!==approval.email.toLowerCase())throw Error('EXPLICIT_APPROVED_ADMIN_IDENTITY_REQUIRED');
   const link=(await db.query('SELECT internal_user_id FROM synapse.auth_identity_links WHERE auth_user_id=$1 AND revoked_at IS NULL',[prior.authId])).rows[0];if(link?.internal_user_id!==prior.internalId)throw Error('APPROVED_ADMIN_MAPPING_DRIFT');
   const roles=(await db.query("SELECT r.role_code,a.scope_type FROM synapse.user_role_assignments a JOIN synapse.roles r USING(role_id) WHERE a.user_id=$1 AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now())",[prior.internalId])).rows;
   if(roles.length!==1||roles[0].role_code!=='SYSTEM_ADMIN'||roles[0].scope_type!=='GLOBAL'||(await db.query('SELECT 1 FROM synapse.user_bureau_memberships WHERE user_id=$1',[prior.internalId])).rowCount)throw Error('CONFIGURATION_ONLY_ADMIN_SNAPSHOT_REQUIRED');
   await saveVault('.local/phase9/admin-retirement.vault',{authId:prior.authId,internalId:prior.internalId,email:user.email,snapshotAt:new Date().toISOString(),configurationOnly:true});
   const plan={environment:'DEVELOPMENT_ONLY',approvedRole:'SYSTEM_ADMIN',scope:'GLOBAL',authId:'REPLACE_WITH_NEW_AUTH_USER_UUID',email:user.email,expiresAt:approval.expiresAt,reason:'Explicit owner-approved recreation of the development configuration administrator',rebind:{previousAuthId:prior.authId,internalUserId:prior.internalId}};
   try{await writeFile('.local/phase9/bootstrap-plan.json',JSON.stringify(plan,null,2),{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}
   console.log('PASS read-only approved-admin snapshot saved encrypted; private bootstrap template preserved/created. No user, session, membership or role changed/deleted.');return;
  }
  const plan=JSON.parse(await readFile('.local/phase9/bootstrap-plan.json','utf8'));
  validateOwnerPlan(plan);
  const provider=await admin.getUserById(plan.authId);if(provider.error||!provider.data.user||provider.data.user.email.toLowerCase()!==plan.email.toLowerCase())throw Error('PLANNED_PROVIDER_IDENTITY_MISMATCH');
  let prior;if(plan.rebind){prior=await loadVault('.local/phase9/admin-retirement.vault');if(!prior.configurationOnly||prior.authId!==plan.rebind.previousAuthId||prior.internalId!==plan.rebind.internalUserId||prior.email.toLowerCase()!==plan.email.toLowerCase()||prior.authId===plan.authId)throw Error('EXPLICIT_REBIND_SNAPSHOT_MISMATCH');const old=await admin.getUserById(prior.authId);if(!old.error||old.error.status!==404)throw Error('PREVIOUS_AUTH_IDENTITY_MUST_BE_OWNER_DELETED');}
  await transactBootstrap(db,plan,prior,provider.data.user.email,process.argv.includes('--apply'));
 }finally{await db.end();}
});
