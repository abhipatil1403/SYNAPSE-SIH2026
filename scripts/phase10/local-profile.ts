import assert from 'node:assert/strict';
import type {Client} from 'pg';
import {randomUUID} from 'node:crypto';
export async function verifySelfProfile(db:Client){
 const auth=randomUUID(),other=randomUUID(),user=randomUUID(),sid=randomUUID();
 const claims={sub:auth,session_id:sid,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600};
 await db.query('INSERT INTO auth.users(id) VALUES($1),($2)',[auth,other]);await db.query("INSERT INTO synapse.users(user_id,email,display_name) VALUES($1,'profile-fixture@example.invalid','Synthetic owner')",[user]);await db.query('INSERT INTO synapse.auth_identity_links(auth_user_id,internal_user_id) VALUES($1,$2)',[auth,user]);await db.query("INSERT INTO synapse.user_role_assignments(user_id,role_id,scope_type,valid_from) SELECT $1,role_id,'GLOBAL',now()-interval '1 hour' FROM synapse.roles WHERE role_code='SYSTEM_ADMIN'",[user]);
 const call=async(c:unknown,input:unknown)=>{await db.query('BEGIN');try{await db.query('SET LOCAL ROLE synapse_web_gateway');const r=(await db.query('SELECT synapse_gateway.profile($1,$2) result',[c,input])).rows[0].result;await db.query('COMMIT');return r;}catch(e){await db.query('ROLLBACK');throw e;}};
 await db.query('SET ROLE authenticated');await assert.rejects(db.query("SELECT synapse_gateway.profile('{}','{}')"),{code:'42501'});await db.query('RESET ROLE');
 await assert.rejects(call({...claims,sub:other},{name:'Cannot assign identity'}),{code:'42501'});
 await assert.rejects(call(claims,{name:'Valid name',role:'SYSTEM_ADMIN'}),{code:'22023'});await assert.rejects(call(claims,{name:' '}),{code:'22023'});
 assert.equal((await call(claims,{name:'Updated synthetic owner'})).saved,true);assert.equal((await db.query('SELECT display_name FROM synapse.users WHERE user_id=$1',[user])).rows[0].display_name,'Updated synthetic owner');assert.equal((await db.query("SELECT count(*)::int n FROM synapse_gateway.account_audit WHERE auth_user_id=$1 AND action='PROFILE_NAME_UPDATED'",[auth])).rows[0].n,1);
 await db.query("UPDATE synapse.users SET account_status='SUSPENDED' WHERE user_id=$1",[user]);await assert.rejects(call(claims,{name:'Denied after suspension'}),{code:'42501'});
 await db.query("UPDATE synapse.users SET account_status='ACTIVE' WHERE user_id=$1",[user]);await db.query('UPDATE synapse.user_role_assignments SET valid_until=now() WHERE user_id=$1',[user]);await assert.rejects(call(claims,{name:'Denied after role expiry'}),{code:'42501'});
 await db.query('DELETE FROM synapse_gateway.account_audit WHERE auth_user_id=$1',[auth]);await db.query('DELETE FROM synapse.user_role_assignments WHERE user_id=$1',[user]);await db.query('DELETE FROM synapse.auth_identity_links WHERE auth_user_id=$1',[auth]);await db.query('DELETE FROM synapse.users WHERE user_id=$1',[user]);await db.query('DELETE FROM auth.users WHERE id=ANY($1)',[[auth,other]]);
 return ['LOCAL PROFILE: only current active mapped self may change display name; browser/other identity, role injection, suspension and expired authority denied; audit persisted. Synthetic SQL claims, not issued JWT authentication.'];
}
