import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {readRetirementAuthority,retireTransaction} from './retire-transaction.mjs';
import {operatorContext,safeMain} from '../phase2/operator.mjs';
import {loadVault,saveVault} from '../phase2/vault.mjs';
// Owner-controlled DEVELOPMENT retirement only. This script NEVER deletes an
// Auth user or application user. Inactive historical IDs/case history survive.
safeMain(async()=>{
 const {db,admin}=await operatorContext({authAdmin:true});
 const authority=id=>readRetirementAuthority(db,id);
 try{
  await mkdir('.local/phase9',{recursive:true});
  if(process.argv.includes('--snapshot-approved-officers')){
   const existing=await loadVault('.local/phase2/phase2-approved-officers.vault'),snapshots=[];
   if(process.argv.includes('--include-approved-applicant')){const applicant=await loadVault('.local/phase2/applicant-onboarding.vault'),approved=JSON.parse(await readFile('.local/phase2/approved-applicant.json','utf8'));if(approved.environment!=='DEVELOPMENT_ONLY'||approved.approvedRole!=='CASE_OFFICER'||applicant.email!==approved.email||!applicant.authId||!applicant.internalId)throw Error('EXPLICIT_APPROVED_APPLICANT_SNAPSHOT_REQUIRED');existing.accounts.push({authUserId:applicant.authId,internalUserId:applicant.internalId,email:applicant.email});}
   for(const officer of existing.accounts){const provider=await admin.getUserById(officer.authUserId),link=(await db.query('SELECT internal_user_id FROM synapse.auth_identity_links WHERE auth_user_id=$1 AND revoked_at IS NULL',[officer.authUserId])).rows[0];if(provider.error||provider.data.user.email.toLowerCase()!==officer.email.toLowerCase()||link?.internal_user_id!==officer.internalUserId)throw Error('APPROVED_OFFICER_SNAPSHOT_DRIFT');snapshots.push({authId:officer.authUserId,internalId:officer.internalUserId,email:officer.email,authority:await authority(officer.internalUserId)});}
   await saveVault('.local/phase9/officer-retirement.vault',{environment:'DEVELOPMENT_ONLY',snapshots,at:new Date().toISOString()});
   try{await writeFile('.local/phase9/officer-retirement-plan.json',JSON.stringify({environment:'DEVELOPMENT_ONLY',reason:'Owner retirement after manually deleting approved development Auth identities',targets:snapshots.map(({authId,internalId})=>({authId,internalId}))},null,2),{flag:process.argv.includes('--refresh-template')?'w':'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}
   console.log('PASS approved officer retirement snapshots encrypted and private owner plan prepared. No user, role, membership or session changed.');return;
  }
  const plan=JSON.parse(await readFile('.local/phase9/officer-retirement-plan.json','utf8')),snapshot=await loadVault('.local/phase9/officer-retirement.vault');if(plan.environment!=='DEVELOPMENT_ONLY'||!plan.reason||plan.reason.length<5||!plan.targets?.length||plan.targets.length>3)throw Error('EXPLICIT_DEVELOPMENT_RETIREMENT_PLAN_REQUIRED');
  const targets=[];for(const target of plan.targets){const saved=snapshot.snapshots.find(s=>s.authId===target.authId&&s.internalId===target.internalId);if(!saved)throw Error('TARGET_NOT_IN_APPROVED_SNAPSHOT');const provider=await admin.getUserById(saved.authId);if(!provider.error||provider.error.status!==404)throw Error('OWNER_MUST_DELETE_AUTH_IDENTITY_FIRST');targets.push(saved);}
  await retireTransaction(db,plan,targets,process.argv.includes('--apply'));
 }finally{await db.end();}
});
