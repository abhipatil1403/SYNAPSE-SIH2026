import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool, type Client } from 'pg';
import { CanonicalStore } from '../../lib/hosted/store';
import { PlatformEngine } from '../../lib/platform/engine';
import { type Command, type Principal } from '../../lib/platform/contracts';
import { platformCalendar, platformDashboard } from '../../lib/platform/selectors';
export async function verifyCanonicalOperations(db: Client, url: string) {
    assert.match((await db.query('SELECT current_database() db')).rows[0].db, /^synapse_test_[a-f0-9]{32}$/);
    const users = Array.from({ length: 5 }, () => randomUUID()), auth = users.map(() => randomUUID()), sid = users.map(() => randomUUID()), bureaus = [randomUUID(), randomUUID()], roles = ['CASE_OFFICER', 'CASE_OFFICER', 'BUREAU_HEAD', 'BUREAU_HEAD', 'SYSTEM_ADMIN'];
    for (let n = 0; n < 2; n++)
        await db.query('INSERT INTO synapse.bureaus(bureau_id,bureau_code,bureau_name) VALUES($1,$2,$3)', [bureaus[n], 'CANONICAL_' + n, 'Synthetic canonical Bureau ' + n]);
    for (let n = 0; n < 5; n++) {
        await db.query('INSERT INTO auth.users(id) VALUES($1)', [auth[n]]);
        await db.query('INSERT INTO synapse.users(user_id,email,display_name) VALUES($1,$2,$3)', [users[n], 'canonical-' + n + '@example.invalid', 'Synthetic canonical user ' + n]);
        await db.query('INSERT INTO synapse.auth_identity_links(auth_user_id,internal_user_id) VALUES($1,$2)', [auth[n], users[n]]);
        const b = n % 2;
        if (n < 4)
            await db.query("INSERT INTO synapse.user_bureau_memberships(user_id,bureau_id,membership_type,valid_from,valid_until) VALUES($1,$2,'MEMBER',now()-interval '1 day',now()+interval '1 day')", [users[n], bureaus[b]]);
        await db.query("INSERT INTO synapse.user_role_assignments(user_id,role_id,scope_type,bureau_id,valid_from,valid_until) SELECT $1,role_id,$2,$3,now()-interval '1 day',now()+interval '1 day' FROM synapse.roles WHERE role_code=$4", [users[n], n === 4 ? 'GLOBAL' : 'BUREAU', n === 4 ? null : bureaus[b], roles[n]]);
    }
    await db.query("CREATE ROLE synapse_operations_test_login LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE; GRANT synapse_operations_runtime TO synapse_operations_test_login WITH INHERIT FALSE,SET TRUE");
    const connection = new URL(url);
    connection.username = 'synapse_operations_test_login';
    connection.password = '';
    const pool = new Pool({ connectionString: connection.href, max: 3, statement_timeout: 5000 });
    const p = (n = 0): Principal => ({ userId: users[n], authId: auth[n], sessionId: sid[n] }), claims = (n = 0) => ({ sub: auth[n], session_id: sid[n], role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }), store = (n = 0) => new CanonicalStore(pool, p(n), claims(n), undefined, undefined, error => { const e = error as {
        code?: string;
        message?: string;
        where?: string;
    }; console.error(JSON.stringify({ syntheticDatabaseOnly: true, code: e.code, message: e.message, where: e.where?.slice(0, 300) })); });
    const snapshot = (n = 0) => new PlatformEngine(store(n)).snapshot(p(n));
    const send = (cmd: Command, n = 0, key = randomUUID()) => new PlatformEngine({ transaction: work => store(n).write(cmd, work, key) }).execute(p(n), { idempotencyKey: key, command: cmd });
    try {
        await assert.rejects(snapshot(), { code: 'operations_release_required' });
        await db.query("UPDATE synapse_gateway.operations_control SET enabled=true,writes_enabled=true,approved_by=$1,approved_at=now(),release_review='Synthetic disposable authorization test; never deployed activation'", [users[4]]);
        assert.equal((await snapshot()).cases.length, 0);
        const institution = await send({ type: 'institution.create', permanentId: 'CANONICAL-TEST', name: 'Synthetic persisted institution', state: 'Test state', region: 'Test region' });
        const category = await send({ type: 'category.create', name: 'Synthetic canonical category' }, 4);
        const draft = await send({ type: 'draft.create', source: 'MANUAL', sourceReference: 'canonical-intake-test', subject: 'Canonical SQL registration test', body: 'Original synthetic complaint content.', language: 'en', bureauId: bureaus[0], institutionId: null });
        await assert.rejects(send({ type: 'draft.register', draftId: draft.entityId, expectedVersion: '1', categoryId: category.entityId, officerId: users[0], priority: 'NORMAL' }));
        await send({ type: 'draft.verify', draftId: draft.entityId, expectedVersion: '1', institutionId: institution.entityId, reason: 'Synthetic human verification' });
        const register: Command = { type: 'draft.register', draftId: draft.entityId, expectedVersion: '2', categoryId: category.entityId, officerId: users[0], priority: 'NORMAL', discoveryAllowed: false }, request = randomUUID(), result = await send(register, 0, request);
        assert.deepEqual(await send(register, 0, request), result);
        const caseId = result.entityId;
        assert.equal((await db.query('SELECT title,summary FROM synapse.cases WHERE case_id=$1', [caseId])).rows[0].summary, 'Original synthetic complaint content.');
        assert.equal((await snapshot()).cases.length, 1);
        assert.equal((await snapshot(1)).cases.length, 0);
        assert.equal((await snapshot(4)).cases.length, 0);
        assert.equal(platformDashboard(await snapshot(), new Date().toISOString()).total, 1);
        const version = async (n = 0) => (await snapshot(n)).cases.find(c => c.id === caseId)!.version;
        await assert.rejects(send({ type: 'case.priority', caseId, expectedVersion: '1', priority: 'HIGH', reason: 'Cross Bureau denial' }, 1));
        const concurrentVersion = await version();
        const concurrent = await Promise.allSettled([send({ type: 'case.priority', caseId, expectedVersion: concurrentVersion, priority: 'HIGH', reason: 'First concurrent command' }), send({ type: 'comment.add', caseId, expectedVersion: concurrentVersion, body: 'Competing canonical comment' })]);
        assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1);
        const task = await send({ type: 'task.create', caseId, expectedVersion: await version(), assigneeId: users[0], taskType: 'INVESTIGATION', title: 'Actual canonical work item', dueAt: new Date(Date.now() + 86400000).toISOString() });
        await send({ type: 'task.update', caseId, expectedVersion: await version(), taskId: (await snapshot()).tasks[0].id, status: 'COMPLETED' });
        const event = await send({ type: 'event.schedule', caseId, expectedVersion: await version(), title: 'Actual persisted hearing', at: new Date(Date.now() + 3600000).toISOString(), kind: 'HEARING', reason: 'Synthetic date test' });
        assert.equal(platformCalendar(await snapshot()).filter(e => e.type === 'HEARING').length, 1);
        await send({ type: 'event.reschedule', caseId, expectedVersion: await version(), eventId: event.entityId, title: 'Rescheduled canonical hearing', at: new Date(Date.now() + 7200000).toISOString(), reason: 'Synthetic reschedule test' });
        await send({ type: 'event.cancel', caseId, expectedVersion: await version(), eventId: event.entityId, reason: 'Synthetic cancellation test' });
        assert.equal(platformCalendar(await snapshot()).filter(e => e.type === 'HEARING').length, 0);
        const policy = await send({ type: 'policy.publish', label: 'Synthetic canonical closure policy', until: new Date(Date.now() + 86400000).toISOString(), requirements: ['TASKS', 'DEPENDENCIES', 'FINDINGS', 'APPROVAL'] }, 4);
        await send({ type: 'sla.set', caseId, expectedVersion: await version(2), policyId: policy.entityId, dueAt: new Date(Date.now() + 86400000).toISOString(), reason: 'Explicit approved deadline' }, 2);
        const s = await snapshot();
        assert.equal(s.sla.length, 1);
        assert.equal(s.tasks[0].status, 'COMPLETED');
        assert.ok(s.activity.length > 0);
        assert.ok(s.notifications.length > 0);
        await send({ type: 'notification.read', notificationId: s.notifications[0].id });
        await send({ type: 'case.transition', caseId, expectedVersion: await version(2), status: 'ASSIGNED', reason: 'Explicit initial assignment' }, 2);
        await send({ type: 'case.transition', caseId, expectedVersion: await version(2), status: 'UNDER_REVIEW', reason: 'Current review state' }, 2);
        const evaluated = await send({ type: 'closure.evaluate', caseId, expectedVersion: await version(2), policyId: policy.entityId }, 2);
        await send({ type: 'closure.dispose', caseId, expectedVersion: await version(2), evaluationId: evaluated.entityId, reason: 'Synthetic human-approved disposal' }, 2);
        assert.equal((await snapshot()).cases[0].status, 'DISPOSED');
        const { verifyGmailDatabase } = await import('./test-gmail');
        const gmailResult = await verifyGmailDatabase(db, url, users, auth, sid, bureaus);
        assert.equal((await snapshot(1)).drafts.some(d => d.id === gmailResult.draftId), false);
        await send({ type: 'draft.verify', draftId: gmailResult.draftId, expectedVersion: '1', institutionId: institution.entityId, reason: 'Synthetic Gmail human verification' });
        const mailCase = await send({ type: 'draft.register', draftId: gmailResult.draftId, expectedVersion: '2', categoryId: category.entityId, officerId: users[0], priority: 'NORMAL' });
        const persisted = (await snapshot()).evidence.find(e => e.caseId === mailCase.entityId);
        assert.ok(persisted);
        assert.equal(persisted.scan, 'NOT_REQUIRED');
        assert.equal(persisted.status, 'SUBMITTED');
        assert.equal((await db.query('SELECT octet_length(bytes) n FROM synapse_gateway.document_bytes WHERE version_id=$1', [persisted.versionId])).rows[0].n, Buffer.byteLength('Synthetic plain-text evidence'));
        const other = await pool.connect();
        try {
            await other.query('BEGIN');
            await other.query('SET LOCAL ROLE synapse_operations_runtime');
            await other.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims(1))]);
            assert.equal((await other.query('SELECT count(*)::int n FROM synapse.cases WHERE case_id=$1', [mailCase.entityId])).rows[0].n, 0);
            assert.equal((await other.query('SELECT count(*)::int n FROM synapse_gateway.document_bytes WHERE case_id=$1', [mailCase.entityId])).rows[0].n, 0);
            assert.equal((await other.query('SELECT count(*)::int n FROM synapse_gateway.gmail_attachments WHERE submission_id=$1', [gmailResult.draftId])).rows[0].n, 0);
            await other.query('ROLLBACK');
        }
        finally {
            other.release();
        }
        const mailVersion = (n = 2) => (snapshot(n).then(s => s.cases.find(c => c.id === mailCase.entityId)!.version));
        await send({ type: 'transfer.request', caseId: mailCase.entityId, expectedVersion: await mailVersion(), bureauId: bureaus[1], officerId: users[1], reason: 'Synthetic real workflow transfer test' }, 2);
        const incoming = (await snapshot(3)).transfers.find(t => t.caseId === mailCase.entityId)!;
        await send({ type: 'transfer.decide', caseId: mailCase.entityId, expectedVersion: incoming.expectedVersion, transferId: incoming.id, decision: 'COMPLETED', reason: 'Independent destination approval in synthetic test' }, 3);
        assert.equal((await snapshot()).cases.some(c => c.id === mailCase.entityId), false);
        assert.equal((await snapshot()).drafts.some(d => d.id === gmailResult.draftId), false);
        assert.equal((await snapshot()).evidence.some(e => e.caseId === mailCase.entityId), false);
        assert.equal((await snapshot(1)).cases.some(c => c.id === mailCase.entityId), true);
        await db.query("UPDATE synapse.users SET account_status='SUSPENDED' WHERE user_id=$1", [users[0]]);
        await assert.rejects(snapshot(), { code: 'current_approval_required' });
        await db.query("UPDATE synapse.users SET account_status='ACTIVE' WHERE user_id=$1", [users[0]]);
        await db.query('INSERT INTO synapse.auth_session_revocations(session_id,auth_user_id) VALUES($1,$2)', [sid[0], auth[0]]);
        await assert.rejects(snapshot());
        return [gmailResult.message, 'CANONICAL HOSTED ADAPTER: actual disposable PostgreSQL intake, verification, registration, idempotency, optimistic concurrency, tasks, calendar reschedule/cancel, policy/SLA, audited disposal, dashboard values, two-Bureau isolation, no admin case bypass, suspension and revoked-session rejection PASS. Synthetic SQL claims only; no deployed activation.'];
    }
    finally {
        await pool.end();
    }
}
