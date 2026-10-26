import {createHash} from 'node:crypto';
export async function readRetirementAuthority(db,id){return {roles:(await db.query('SELECT * FROM synapse.user_role_assignments WHERE user_id=$1 ORDER BY user_role_assignment_id',[id])).rows,memberships:(await db.query('SELECT * FROM synapse.user_bureau_memberships WHERE user_id=$1 ORDER BY membership_id',[id])).rows};}

// Operator-only; provider deletion and encrypted snapshot checked by the CLI.
export async function retireTransaction(db,plan,targets,apply=false){
 if(plan.environment!=='DEVELOPMENT_ONLY'||!targets.length||targets.length>3||typeof plan.reason!=='string'||plan.reason.length<5)throw Error('EXPLICIT_DEVELOPMENT_RETIREMENT_PLAN_REQUIRED');
  await db.query('BEGIN');try{
   for(const target of targets){const user=(await db.query('SELECT email,account_status,is_global_admin FROM synapse.users WHERE user_id=$1 FOR UPDATE',[target.internalId])).rows[0],archivedEmail='retired-'+target.internalId+'@synapse.invalid';
    if(user?.email===archivedEmail&&user.account_status==='SUSPENDED')continue;
    if(!user||user.is_global_admin||user.email.toLowerCase()!==target.email.toLowerCase()||(await db.query('SELECT 1 FROM synapse.auth_identity_links WHERE internal_user_id=$1',[target.internalId])).rowCount||JSON.stringify(await readRetirementAuthority(db,target.internalId))!==JSON.stringify(target.authority))throw Error('RETIRED_IDENTITY_OR_AUTHORITY_DRIFT');
    const unexpected=(await db.query("SELECT 1 FROM synapse.user_role_assignments a JOIN synapse.roles r USING(role_id) WHERE a.user_id=$1 AND r.role_code<>'CASE_OFFICER'",[target.internalId])).rowCount;if(unexpected)throw Error('ONLY_APPROVED_DEVELOPMENT_CASE_OFFICERS_ALLOWED');
    await db.query("UPDATE synapse.user_role_assignments SET valid_until=clock_timestamp() WHERE user_id=$1 AND (valid_until IS NULL OR valid_until>now())",[target.internalId]);await db.query("UPDATE synapse.user_bureau_memberships SET valid_until=clock_timestamp() WHERE user_id=$1 AND (valid_until IS NULL OR valid_until>now())",[target.internalId]);
    // A retention label frees the unique contact field; it is not an Auth
    // identity or deliverable address, and can never authorize a new signup.
    await db.query("UPDATE synapse.users SET account_status='SUSPENDED',email=$2 WHERE user_id=$1",[target.internalId,archivedEmail]);
    await db.query("INSERT INTO synapse_gateway.account_audit(auth_user_id,actor_user_id,action,detail) VALUES($1,NULL,'OWNER_DEVELOPMENT_IDENTITY_RETIRED',$2)",[target.authId,{internalUserId:target.internalId,originalEmail:target.email,retentionLabel:archivedEmail,reason:plan.reason,approvalDigest:createHash('sha256').update(JSON.stringify(plan)).digest('hex'),caseHistoryPreserved:true}]);
   }
   if(!apply){await db.query('ROLLBACK');console.log('PASS exact owner retirement prerequisites; dry run rolled back. No user or Auth record deleted.');return;}
   await db.query('COMMIT');console.log('PASS approved deleted-Auth development identities retired with audit, historical IDs/cases preserved. New same-email applicants remain independently pending; no case access inherited.');
  }catch(error){await db.query('ROLLBACK');throw error;}
}
