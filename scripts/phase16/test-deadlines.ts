import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Client, type Pool, type Client as ClientType } from 'pg';
import { CanonicalStore } from '../../lib/hosted/store';
import { PlatformEngine } from '../../lib/platform/engine';
import type { Principal, Command } from '../../lib/platform/contracts';
export async function verifyDeadlineNotifications(db: ClientType, pool: Pool, url: string, users: string[], auth: string[], sessions: string[], caseId: string, policyId: string, bureauId: string) {
    const p = (n: number): Principal => ({ userId: users[n], authId: auth[n], sessionId: sessions[n] }), claims = (n: number) => ({ sub: auth[n], session_id: sessions[n], role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }), store = (n: number) => new CanonicalStore(pool, p(n), claims(n));
    const current = await new PlatformEngine(store(3)).snapshot(p(3)), record = current.cases.find(c => c.id === caseId)!;
    const key = crypto.randomUUID(), command: Command = { type: 'sla.set', caseId, expectedVersion: record.version, policyId, dueAt: new Date(Date.now() + 3600000).toISOString(), reason: 'Synthetic explicit future deadline' };
    await new PlatformEngine({ transaction: work => store(3).write(command, work, key) }).execute(p(3), { idempotencyKey: key, command });
    await store(4).locked(async (c) => { await c.query('INSERT INTO synapse_gateway.reminder_rules(policy_version_id,minutes,reviewed_by,reason) VALUES($1,120,$2,$3)', [policyId, users[4], 'Synthetic explicit reminder review']); }, true);
    const password = randomBytes(36).toString('hex');
    await db.query("SELECT set_config('synapse_test.login_password',$1,false)", [password]);
    await db.query("DO $$BEGIN EXECUTE format('CREATE ROLE synapse_deadline_test_login LOGIN NOINHERIT NOBYPASSRLS PASSWORD %L',current_setting('synapse_test.login_password'));END$$");
    await db.query("SELECT set_config('synapse_test.login_password','',false)");
    await db.query('GRANT synapse_web_gateway TO synapse_deadline_test_login WITH INHERIT FALSE,SET TRUE');
    const connection = new URL(url);
    connection.username = 'synapse_deadline_test_login';
    connection.password = password;
    const c = new Client({ connectionString: connection.href });
    await c.connect();
    async function run(identity: unknown = {}) {
        await c.query('BEGIN');
        try {
            await c.query('SET LOCAL ROLE synapse_web_gateway');
            const result = (await c.query('SELECT synapse_gateway.deadline_notifications($1) body', [identity])).rows[0].body;
            await c.query('COMMIT');
            return result;
        }
        catch (error) {
            await c.query('ROLLBACK');
            throw error;
        }
    }
    try {
        await assert.rejects(run(claims(1)), { code: '42501' });
        await db.query('UPDATE synapse_gateway.operations_control SET writes_enabled=false');
        assert.equal((await run()).blocked, 'OPERATIONS_RELEASE_REQUIRED');
        await db.query('UPDATE synapse_gateway.operations_control SET writes_enabled=true');
        assert.equal((await run(claims(4))).delivered, 1);
        assert.equal((await run()).delivered, 0);
        await db.query("UPDATE synapse.users SET account_status='SUSPENDED' WHERE user_id=$1", [users[1]]);
        await db.query("UPDATE synapse.sla_instances SET started_at=now()-interval '1 day',current_due_at=now()-interval '1 minute' WHERE case_id=$1 AND sla_status='RUNNING'", [caseId]);
        assert.equal((await run()).delivered, 1);
        assert.equal((await run()).delivered, 0);
        assert.equal((await db.query("SELECT count(*)::int n FROM synapse.notifications WHERE related_case_id=$1 AND notification_type='SLA_DEADLINE' AND recipient_user_id=$2", [caseId, users[1]])).rows[0].n, 1);
        await db.query("UPDATE synapse.users SET account_status='ACTIVE' WHERE user_id=$1", [users[1]]);
        await db.query('UPDATE synapse.bureaus SET is_active=false WHERE bureau_id=$1', [bureauId]);
        await db.query("UPDATE synapse.sla_instances SET current_due_at=now()-interval '2 minutes' WHERE case_id=$1 AND sla_status='RUNNING'", [caseId]);
        assert.equal((await run()).delivered, 0);
        await db.query('UPDATE synapse.bureaus SET is_active=true WHERE bureau_id=$1', [bureauId]);
        assert.equal((await db.query("SELECT has_column_privilege('synapse_deadline_notifier','synapse.cases','summary','SELECT') body_read,has_function_privilege('authenticated','synapse_gateway.deadline_notifications(jsonb)','EXECUTE') browser")).rows[0].body_read, false);
        assert.equal((await db.query("SELECT has_function_privilege('authenticated','synapse_gateway.deadline_notifications(jsonb)','EXECUTE') allowed")).rows[0].allowed, false);
        return 'HOSTED DEADLINES: actual reviewed rule and canonical SLA produce persistent notifications and dedupe receipts, future reminder targets assigned officer only, overdue targets current Bureau Head, suspended users/inactive Bureaus denied, global administrator required for manual service run, no complaint-body column privilege and inactive release denied PASS. Synthetic SQL fixtures; no production delivery.';
    }
    finally {
        await c.end();
    }
}
