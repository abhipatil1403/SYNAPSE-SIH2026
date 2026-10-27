import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Client} from 'pg';
import {snapshotSchema} from '../../lib/platform/contracts';
import {platformDashboard,platformCalendar} from '../../lib/platform/selectors';

export async function verifyReadonlyWorkspace(db:Client){
 assert.match((await db.query('SELECT current_database() db')).rows[0].db,/^synapse_test_[a-f0-9]{32}$/);
 const auth=[randomUUID(),randomUUID(),randomUUID()],users=[randomUUID(),randomUUID(),randomUUID()],bureaus=[randomUUID(),randomUUID()],institutions=[randomUUID(),randomUUID()],cases=[randomUUID(),randomUUID()],sid=randomUUID(),policy=randomUUID(),policyVersion=randomUUID(),sla=randomUUID();
 const claims=(n=0)=>({sub:auth[n],session_id:sid,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600});
 await db.query('BEGIN');
 const call=async(c:unknown)=>{await db.query('SAVEPOINT workspace_call');try{await db.query('SET LOCAL ROLE synapse_web_gateway');const result=snapshotSchema.parse((await db.query('SELECT synapse_gateway.workspace($1) result',[c])).rows[0].result);await db.query('RESET ROLE; RELEASE SAVEPOINT workspace_call');return result;}catch(error){await db.query('ROLLBACK TO SAVEPOINT workspace_call; RELEASE SAVEPOINT workspace_call');throw error;}};
 try{
  for(let n=0;n<3;n++){
   await db.query('INSERT INTO auth.users(id) VALUES($1)',[auth[n]]);
   await db.query("INSERT INTO synapse.users(user_id,email,display_name) VALUES($1,$2,$3)",[users[n],'workspace-'+n+'@example.invalid','Synthetic workspace account '+n]);
   await db.query('INSERT INTO synapse.auth_identity_links(auth_user_id,internal_user_id) VALUES($1,$2)',[auth[n],users[n]]);
   if(n<2){await db.query('INSERT INTO synapse.bureaus(bureau_id,bureau_code,bureau_name) VALUES($1,$2,$3)',[bureaus[n],'WORKSPACE_'+n,'Synthetic Bureau '+n]);await db.query("INSERT INTO synapse.user_bureau_memberships(user_id,bureau_id,membership_type,valid_from,valid_until) VALUES($1,$2,'MEMBER',now()-interval '1 day',now()+interval '1 day')",[users[n],bureaus[n]]);}
   await db.query("INSERT INTO synapse.user_role_assignments(user_id,role_id,scope_type,bureau_id,valid_from,valid_until) SELECT $1,role_id,$2,$3,now()-interval '1 day',now()+interval '1 day' FROM synapse.roles WHERE role_code=$4",[users[n],n===2?'GLOBAL':'BUREAU',n===2?null:bureaus[n],n===2?'SYSTEM_ADMIN':'CASE_OFFICER']);
  }
  const category=randomUUID();await db.query("INSERT INTO synapse.case_categories(category_id,category_code,category_name) VALUES($1,'WORKSPACE_TEST','Synthetic workspace category')",[category]);
  for(let n=0;n<2;n++){
   await db.query("SELECT set_config('synapse.user_id',$1,true)",[users[n]]);
   await db.query('INSERT INTO synapse.institutions(institution_id,canonical_name,state_name) VALUES($1,$2,$3)',[institutions[n],'Synthetic institution '+n,'Maharashtra']);
   await db.query("INSERT INTO synapse.cases(case_id,case_number,institution_id,category_id,current_status_code,lead_bureau_id,accountable_officer_id,title,summary,disposed_at,row_version,created_by_user_id) OVERRIDING SYSTEM VALUE VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",[cases[n],String(9007199254740993n+BigInt(n)),institutions[n],category,'NEW',bureaus[n],users[n],'Synthetic authorized case '+n,'Original synthetic complaint '+n,null,'9007199254740993',users[n]]);
  }
  await db.query("SELECT set_config('synapse.user_id',$1,true),set_config('synapse.workflow_action','DISPOSE',true)",[users[2]]);
  await db.query("UPDATE synapse.cases SET current_status_code='DISPOSED',disposed_at=now() WHERE case_id=$1",[cases[1]]);
  await db.query("SELECT set_config('synapse.workflow_action','',true)");
  await db.query("INSERT INTO synapse.sla_policies(sla_policy_id,policy_code,policy_name) VALUES($1,'WORKSPACE','Synthetic SLA')",[policy]);
  await db.query("INSERT INTO synapse.sla_policy_versions(sla_policy_version_id,sla_policy_id,version_number,start_event_code,duration_minutes,effective_from) VALUES($1,$2,1,'CASE_REGISTERED',1440,now()-interval '1 day')",[policyVersion,policy]);
  await db.query("INSERT INTO synapse.sla_instances(sla_instance_id,sla_policy_version_id,case_id,started_at,original_due_at,current_due_at) VALUES($1,$2,$3,now()-interval '1 day',now()+interval '1 day',now()+interval '2 days')",[sla,policyVersion,cases[0]]);
  await db.query('UPDATE synapse.phase1_access_config SET read_enabled=false,read_until=NULL');
  const account=await call(claims());assert.equal(account.workspace?.mode,'ACCOUNT_ONLY');assert.equal(account.me?.id,users[0]);assert.equal(account.cases.length,0);assert.equal(account.institutions.length,0);assert.ok(!JSON.stringify(account).includes(cases[0]));
  for(const role of ['anon','authenticated','service_role']){await db.query('SAVEPOINT browser');await db.query('SET LOCAL ROLE '+role);await assert.rejects(db.query("SELECT synapse_gateway.workspace('{}')"),{code:'42501'});await db.query('ROLLBACK TO SAVEPOINT browser; RELEASE SAVEPOINT browser');}
  await assert.rejects(call({}),{code:'28000'});await assert.rejects(call({...claims(),exp:1}),{code:'28000'});await assert.rejects(call({...claims(),session_id:null}),{code:'28000'});
  await db.query("UPDATE synapse.phase1_access_config SET read_enabled=true,read_until=now()+interval '5 minutes'");
  const a=await call(claims()),b=await call(claims(1)),admin=await call(claims(2));
  assert.equal(a.workspace?.mode,'READ_ONLY');assert.deepEqual(a.cases.map(c=>c.id),[cases[0]]);assert.deepEqual(b.cases.map(c=>c.id),[cases[1]]);assert.equal(admin.cases.length,0);assert.equal(admin.me?.roles[0],'SYSTEM_ADMIN');
  assert.equal(a.cases[0].caseNumber,'9007199254740993');assert.equal(a.cases[0].version,'9007199254740993');assert.equal(a.cases[0].summary,'Original synthetic complaint 0');assert.deepEqual(a.institutions.map(i=>i.id),[institutions[0]]);
  assert.equal(a.sla[0].id,sla);assert.notEqual(a.sla[0].dueAt,a.sla[0].originalDueAt);assert.equal(platformCalendar(a).length,1);assert.equal(platformDashboard(b,b.generatedAt).resolutionPercent,100);
  await db.query("UPDATE synapse.sla_instances SET sla_status='MET',completed_at=now() WHERE sla_instance_id=$1",[sla]);assert.equal((await call(claims())).sla[0].status,'MET');assert.equal(platformCalendar(await call(claims())).length,0);
  assert.equal((await db.query("SELECT has_any_column_privilege('synapse_case_reader','synapse.documents','SELECT') doc,has_any_column_privilege('synapse_case_reader','synapse.cases','INSERT,UPDATE') writes")).rows[0].doc,false);assert.equal((await db.query("SELECT has_any_column_privilege('synapse_case_reader','synapse.cases','INSERT,UPDATE') writes")).rows[0].writes,false);
  await db.query("UPDATE synapse.users SET account_status='SUSPENDED' WHERE user_id=$1",[users[0]]);await assert.rejects(call(claims()),{code:'42501'});await db.query("UPDATE synapse.users SET account_status='ACTIVE' WHERE user_id=$1",[users[0]]);
  await db.query('UPDATE synapse.user_role_assignments SET valid_until=now() WHERE user_id=$1',[users[0]]);await assert.rejects(call(claims()),{code:'42501'});await db.query("UPDATE synapse.user_role_assignments SET valid_until=now()+interval '1 day' WHERE user_id=$1",[users[0]]);
  await db.query('UPDATE synapse.user_bureau_memberships SET valid_until=now() WHERE user_id=$1',[users[0]]);await assert.rejects(call(claims()),{code:'42501'});await db.query("UPDATE synapse.user_bureau_memberships SET valid_until=now()+interval '1 day' WHERE user_id=$1",[users[0]]);
  await db.query('INSERT INTO synapse.auth_session_revocations(session_id,auth_user_id) VALUES($1,$2)',[sid,auth[0]]);await assert.rejects(call(claims()),{code:'28000'});await db.query('DELETE FROM synapse.auth_session_revocations WHERE session_id=$1',[sid]);
  await db.query("UPDATE synapse.phase1_access_config SET read_until=now()-interval '1 second'");assert.equal((await call(claims())).workspace?.mode,'ACCOUNT_ONLY');
  return ['LOCAL WORKSPACE: private browser/service denial, approved account-only fallback, expiring gate, exact bigint data, actual case/SLA/calendar metrics, cross-Bureau isolation, no admin case bypass, suspension, role/membership expiry and revoked-session denial PASS. Synthetic SQL claims only; every fixture and gate change rolled back.'];
 }finally{await db.query('ROLLBACK');}
}
