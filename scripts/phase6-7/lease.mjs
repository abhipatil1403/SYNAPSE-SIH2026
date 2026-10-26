import {readFile} from 'node:fs/promises';
import {loadVault} from '../phase2/vault.mjs';
import {withReadLease} from '../phase2/lease.mjs';
// Preserve the old exact-two guard. Only the separately, explicitly approved,
// verified and bootstrapped configuration administrator may be an extra mapping.
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
 const ids=[...officerIds,admin.authId],links=(await db.query('SELECT auth_user_id FROM synapse.auth_identity_links WHERE revoked_at IS NULL')).rows;
 if(ids.length!==3||new Set(ids).size!==3||links.length!==3||links.some(l=>!ids.includes(l.auth_user_id)))throw Error('UNREVIEWED_IDENTITY_MAPPING');
 const initial=(await db.query('SELECT read_enabled,read_until::text FROM synapse.phase1_access_config WHERE singleton')).rows[0];
 if(initial.read_enabled||initial.read_until)throw Error('REFUSING_ACTIVE_PREVIEW');
 const lease=(await db.query("UPDATE synapse.phase1_access_config SET read_enabled=true,read_until=now()+interval '10 minutes' WHERE singleton AND NOT read_enabled RETURNING read_until::text")).rows[0];if(!lease)throw Error('READ_GATE_CHANGED');
 try{return await work();}finally{const result=await db.query('UPDATE synapse.phase1_access_config SET read_enabled=$1,read_until=$2 WHERE singleton AND read_until=$3',[initial.read_enabled,initial.read_until,lease.read_until]);if(result.rowCount!==1)throw Error('LEASE_CHANGED_OWNER_REVIEW_REQUIRED');}
}
