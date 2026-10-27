import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {operatorContext,safeMain} from '../phase2/operator.mjs';
import {saveVault} from '../phase2/vault.mjs';
// Owner-only correction to the ALREADY approved development test plan.
// It cannot select arbitrary users, elevate roles or transfer any case.
safeMain(async()=>{
 const plan=JSON.parse((await readFile('.local/phase2/approved-accounts.json','utf8')).replace(/^\uFEFF/,'')),adminPlan=JSON.parse((await readFile('.local/phase2/approved-admin.json','utf8')).replace(/^\uFEFF/,'')),approved=plan.accounts[1];assert.ok(plan.approved&&plan.projectRef==='xjnukuerzlrxjjqwmgkn'&&approved.roleCode==='CASE_OFFICER'&&Date.parse(plan.expiresAt)>Date.now()+3600000&&adminPlan.environment==='DEVELOPMENT_ONLY');
 const {db}=await operatorContext();let applied=false;
 try{await db.query('BEGIN');
  const actor=(await db.query("SELECT u.user_id FROM synapse.users u JOIN synapse.auth_identity_links l ON l.internal_user_id=u.user_id AND l.revoked_at IS NULL JOIN auth.users au ON au.id=l.auth_user_id JOIN synapse.user_role_assignments a ON a.user_id=u.user_id JOIN synapse.roles r USING(role_id) WHERE lower(au.email)=lower($1) AND au.email_confirmed_at IS NOT NULL AND u.account_status='ACTIVE' AND r.role_code='SYSTEM_ADMIN' AND r.is_active AND a.scope_type='GLOBAL' AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now()) FOR SHARE OF u,l,a",[adminPlan.email])).rows;assert.equal(actor.length,1);
  const target=(await db.query("SELECT u.user_id,l.auth_user_id FROM synapse.users u JOIN synapse.auth_identity_links l ON l.internal_user_id=u.user_id AND l.revoked_at IS NULL JOIN auth.users au ON au.id=l.auth_user_id JOIN synapse_gateway.onboarding o ON o.auth_user_id=au.id WHERE lower(au.email)=lower($1) AND au.email_confirmed_at IS NOT NULL AND u.account_status='ACTIVE' AND o.status='APPROVED' AND NOT u.is_global_admin FOR UPDATE OF u FOR SHARE OF l",[approved.email])).rows;assert.equal(target.length,1);assert.notEqual(target[0].user_id,actor[0].user_id);
  const bureau=(await db.query('SELECT bureau_id,bureau_name FROM synapse.bureaus WHERE is_active AND bureau_name LIKE $1',[approved.bureauName+' Bureau%'])).rows;assert.equal(bureau.length,1);
  const roles=(await db.query("SELECT a.*,r.role_code FROM synapse.user_role_assignments a JOIN synapse.roles r USING(role_id) WHERE a.user_id=$1 AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now()) FOR UPDATE OF a",[target[0].user_id])).rows;
  const memberships=(await db.query('SELECT * FROM synapse.user_bureau_memberships WHERE user_id=$1 AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()) FOR UPDATE',[target[0].user_id])).rows;assert.equal(roles.length,1);assert.equal(roles[0].role_code,'CASE_OFFICER');assert.equal(roles[0].scope_type,'BUREAU');assert.equal(memberships.length,1);assert.equal(memberships[0].bureau_id,roles[0].bureau_id);
  if(roles[0].bureau_id===bureau[0].bureau_id){
   const prior=(await db.query("SELECT event_id,actor_user_id FROM synapse_gateway.account_audit WHERE auth_user_id=$1 AND action='OWNER_APPROVED_DEVELOPMENT_BUREAU_CORRECTION' AND detail->>'ownerOperatorProcedure'='true' ORDER BY occurred_at DESC LIMIT 1",[target[0].auth_user_id])).rows[0];
   const clarified=prior&&(await db.query("SELECT 1 FROM synapse_gateway.account_audit WHERE action='OWNER_PROVISIONING_ACTOR_CLARIFIED' AND detail->>'priorEventId'=$1",[prior.event_id])).rowCount;
   if(prior?.actor_user_id&&!clarified){
    // The original row retained the independently approved administrator as
    // actor. Clarify that this particular corrective transaction was executed
    // by the authorized owner operator, without rewriting append-only history.
    await db.query('UPDATE synapse.user_role_assignments SET assigned_by_user_id=NULL WHERE user_role_assignment_id=$1 AND assigned_by_user_id=$2',[roles[0].user_role_assignment_id,prior.actor_user_id]);
    await db.query("INSERT INTO synapse_gateway.account_audit(auth_user_id,actor_user_id,action,detail) VALUES($1,NULL,'OWNER_PROVISIONING_ACTOR_CLARIFIED',$2)",[target[0].auth_user_id,{priorEventId:prior.event_id,verifiedAdministratorUserId:prior.actor_user_id,execution:'Authorized owner SQL operator under the explicit development test-account plan; not an issued administrator-session operation',authorityChanged:false}]);
    if(process.argv.includes('--apply-approved-bureau-correction'))await db.query('COMMIT');else await db.query('ROLLBACK');console.log('PASS owner-operator audit provenance clarified; no authority changed.');return;
   }
   await db.query('ROLLBACK');console.log('PASS current approved Officer B already has the plan-approved Academic CASE_OFFICER scope. No change.');return;
  }
  const until=new Date(Math.min(Date.parse(plan.expiresAt),roles[0].valid_until?.getTime()??Infinity,memberships[0].valid_until?.getTime()??Infinity));assert.ok(until.getTime()>Date.now()+3600000);
  await saveVault('.local/phase10/bureau-correction.vault',{at:new Date().toISOString(),environment:'DEVELOPMENT_ONLY',target:target[0],roles,memberships,approvedBureau:bureau[0],until});
  await db.query('UPDATE synapse.user_role_assignments SET valid_until=clock_timestamp() WHERE user_role_assignment_id=$1',[roles[0].user_role_assignment_id]);await db.query('UPDATE synapse.user_bureau_memberships SET valid_until=clock_timestamp() WHERE membership_id=$1',[memberships[0].membership_id]);
  await db.query('INSERT INTO synapse.user_bureau_memberships(user_id,bureau_id,valid_until) VALUES($1,$2,$3)',[target[0].user_id,bureau[0].bureau_id,until]);await db.query("INSERT INTO synapse.user_role_assignments(user_id,role_id,scope_type,bureau_id,valid_until,assigned_by_user_id) VALUES($1,$2,'BUREAU',$3,$4,NULL)",[target[0].user_id,roles[0].role_id,bureau[0].bureau_id,until]);
  await db.query("INSERT INTO synapse_gateway.account_audit(auth_user_id,actor_user_id,action,detail) VALUES($1,NULL,'OWNER_APPROVED_DEVELOPMENT_BUREAU_CORRECTION',$2)",[target[0].auth_user_id,{reason:'Correct independently approved development Officer B to the pre-authorized Academic Bureau; retain CASE_OFFICER role, original assignment history and all case ownership',previousBureau:roles[0].bureau_id,approvedBureau:bureau[0].bureau_id,validUntil:until.toISOString(),ownerOperatorProcedure:true}]);
  if(process.argv.includes('--apply-approved-bureau-correction')){await db.query('COMMIT');applied=true;}else await db.query('ROLLBACK');
  await mkdir('docs/phase10',{recursive:true});await writeFile('docs/phase10/BUREAU_CORRECTION.json',JSON.stringify({checkedAt:new Date().toISOString(),environment:'DEVELOPMENT_ONLY',applied,role:'CASE_OFFICER',approvedBureau:bureau[0].bureau_name,priorAssignmentsRetained:true,caseOwnershipChanged:false,officerAChanged:false,hostedBusinessWritesEnabled:false,authority:'Existing explicit owner-approved two-account development plan; one-time operator procedure, not an automatic application grant'},null,2)+'\n');console.log(applied?'PASS audited approved development Bureau correction applied; role unchanged, no case moved.':'PASS exact approved Bureau correction dry run rolled back.');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{await db.end();}
});
