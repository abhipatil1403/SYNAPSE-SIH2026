import {readFile} from 'node:fs/promises';
import {loadVault} from '../phase2/vault.mjs';
import {withReadLease} from '../phase2/lease.mjs';
// Preserve the old exact-two guard. Only the separately, explicitly approved,
// verified configuration administrator and explicitly approved applicant may be
// extra mappings. No generic email/domain/role allowlist is accepted.
export async function withDevelopmentReadLease(db,officerIds,work){
 let plan,admin;
 try{plan=JSON.parse(await readFile('.local/phase2/approved-admin.json','utf8'));admin=await loadVault('.local/phase2/admin-onboarding.vault');}catch{return withReadLease(db,officerIds,work);}
 if(admin.state!=='BOOTSTRAPPED')return withReadLease(db,officerIds,work);
 if(plan.email!==admin.email||plan.approvedRole!=='SYSTEM_ADMIN'||plan.environment!=='DEVELOPMENT_ONLY'||Date.parse(plan.expiresAt)<=Date.now()||officerIds.includes(admin.authId))throw Error('APPROVED_THIRD_MAPPING_INVALID');
 const config=(await db.query(`SELECT u.user_id FROM synapse.auth_identity_links l JOIN synapse.users u ON u.user_id=l.internal_user_id
  JOIN synapse.user_role_assignments a ON a.user_id=u.user_id JOIN synapse.roles r USING(role_id)
  WHERE l.auth_user_id=$1 AND l.revoked_at IS NULL AND u.account_status='ACTIVE' AND NOT u.is_global_admin
  AND r.role_code='SYSTEM_ADMIN' AND r.is_active AND a.scope_type='GLOBAL' AND a.valid_from<=now() AND a.valid_until=$2 AND a.valid_until>now()`,[admin.authId,plan.expiresAt])).rows;
 if(config.length!==1)throw Error('APPROVED_DEVELOPMENT_ADMIN_SCOPE_DRIFT');
 const excess=(await db.query(`SELECT EXISTS(SELECT FROM synapse.user_bureau_memberships WHERE user_id=$1 AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now())) OR EXISTS(
 SELECT FROM synapse.user_role_assignments a JOIN synapse.roles r USING(role_id) WHERE a.user_id=$1 AND r.role_code<>'SYSTEM_ADMIN' AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now())) excess`,[config[0].user_id])).rows[0].excess;
 if(excess)throw Error('DEVELOPMENT_ADMIN_MUST_REMAIN_CONFIGURATION_ONLY');
 const confirmed=(await db.query('SELECT email_confirmed_at IS NOT NULL verified FROM auth.users WHERE id=$1',[admin.authId])).rows[0];if(!confirmed?.verified)throw Error('ADMIN_EMAIL_NOT_VERIFIED');
 const ids=[...officerIds,admin.authId];
 let applicantPlan,applicant;
 try{applicantPlan=JSON.parse(await readFile('.local/phase2/approved-applicant.json','utf8'));applicant=await loadVault('.local/phase2/applicant-onboarding.vault');}catch(error){if(error.code!=='ENOENT')throw error;}
 if(applicant&&['APPROVED','ROLE_REVOKED'].includes(applicant.state)){
  if(applicantPlan.environment!=='DEVELOPMENT_ONLY'||applicantPlan.approvedRole!=='CASE_OFFICER'||applicantPlan.email!==applicant.email||Date.parse(applicantPlan.expiresAt)<=Date.now()||ids.includes(applicant.authId))throw Error('APPROVED_APPLICANT_PLAN_INVALID');
  const approved=(await db.query(`SELECT u.user_id,au.email_confirmed_at IS NOT NULL confirmed FROM synapse.auth_identity_links l JOIN synapse.users u ON u.user_id=l.internal_user_id
   JOIN auth.users au ON au.id=l.auth_user_id WHERE l.auth_user_id=$1 AND l.internal_user_id=$2 AND l.revoked_at IS NULL AND u.account_status='ACTIVE' AND NOT u.is_global_admin
   AND lower(u.email)=lower($3) AND lower(au.email)=lower($3)`,[applicant.authId,applicant.internalId,applicantPlan.email])).rows;
  if(approved.length!==1||!approved[0].confirmed)throw Error('APPLICANT_MAPPING_DRIFT');
  const assignments=(await db.query('SELECT a.scope_type,a.bureau_id,a.valid_until::text,a.valid_until<=clock_timestamp() expired,r.role_code FROM synapse.user_role_assignments a JOIN synapse.roles r USING(role_id) WHERE a.user_id=$1',[applicant.internalId])).rows;
  const memberships=(await db.query('SELECT bureau_id,valid_until::text FROM synapse.user_bureau_memberships WHERE user_id=$1',[applicant.internalId])).rows;
  if(assignments.length!==1||assignments[0].role_code!=='CASE_OFFICER'||assignments[0].scope_type!=='BUREAU'||assignments[0].bureau_id!==applicantPlan.bureauId||memberships.length!==1||memberships[0].bureau_id!==applicantPlan.bureauId||Date.parse(memberships[0].valid_until)!==Date.parse(applicantPlan.expiresAt))throw Error('APPLICANT_SCOPE_DRIFT');
  if(applicant.state==='APPROVED'?Date.parse(assignments[0].valid_until)!==Date.parse(applicantPlan.expiresAt):assignments[0].valid_until!==applicant.revokedRoleUntil||!assignments[0].expired)throw Error('APPLICANT_ROLE_STATE_DRIFT');
  const audit=(await db.query("SELECT 1 FROM synapse_gateway.account_audit WHERE auth_user_id=$1 AND actor_user_id=$2 AND action='APPROVED'",[applicant.authId,admin.internalId])).rowCount;
  if(audit!==1)throw Error('INDEPENDENT_APPLICANT_APPROVAL_REQUIRED');ids.push(applicant.authId);
 }
 const links=(await db.query('SELECT auth_user_id FROM synapse.auth_identity_links WHERE revoked_at IS NULL')).rows;
 if(![3,4].includes(ids.length)||new Set(ids).size!==ids.length||links.length!==ids.length||links.some(l=>!ids.includes(l.auth_user_id)))throw Error('UNREVIEWED_IDENTITY_MAPPING');
 const initial=(await db.query('SELECT read_enabled,read_until::text FROM synapse.phase1_access_config WHERE singleton')).rows[0];
 if(initial.read_enabled||initial.read_until)throw Error('REFUSING_ACTIVE_PREVIEW');
 const lease=(await db.query("UPDATE synapse.phase1_access_config SET read_enabled=true,read_until=now()+interval '10 minutes' WHERE singleton AND NOT read_enabled RETURNING read_until::text")).rows[0];if(!lease)throw Error('READ_GATE_CHANGED');
 try{return await work();}finally{const result=await db.query('UPDATE synapse.phase1_access_config SET read_enabled=$1,read_until=$2 WHERE singleton AND read_until=$3',[initial.read_enabled,initial.read_until,lease.read_until]);if(result.rowCount!==1)throw Error('LEASE_CHANGED_OWNER_REVIEW_REQUIRED');}
}
