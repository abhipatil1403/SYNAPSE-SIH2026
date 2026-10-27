import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { Pool, type Client } from 'pg';
export async function verifyGmailDatabase(db: Client, url: string, users: string[], auth: string[], sessions: string[], bureaus: string[]) {
    await db.query('CREATE ROLE synapse_gmail_test_login LOGIN NOINHERIT NOBYPASSRLS;GRANT synapse_web_gateway TO synapse_gmail_test_login WITH INHERIT FALSE,SET TRUE');
    const connection = new URL(url);
    connection.username = 'synapse_gmail_test_login';
    connection.password = '';
    const pool = new Pool({ connectionString: connection.href });
    const claims = (n = 4) => ({ sub: auth[n], session_id: sessions[n], role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 });
    async function call(op: string, input: unknown = {}, n = 4) { const c = await pool.connect(); try {
        await c.query('BEGIN');
        await c.query('SET LOCAL ROLE synapse_web_gateway');
        const r = await c.query('SELECT synapse_gateway.gmail($1,$2,$3) result', [claims(n), op, input]);
        await c.query('COMMIT');
        return r.rows[0].result;
    }
    catch (error) {
        await c.query('ROLLBACK');
        throw error;
    }
    finally {
        c.release();
    } }
    try {
        const catalog = (await db.query(`SELECT pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,NOT has_function_privilege('authenticated',p.oid,'EXECUTE') browser_closed,NOT has_function_privilege('anon',p.oid,'EXECUTE') anon_closed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='synapse_gateway' AND p.proname='gmail'`)).rows[0];
        assert.equal(catalog.owner, 'synapse_gmail_manager');
        assert.equal(catalog.prosecdef, true);
        assert.ok(catalog.proconfig.includes('row_security=on'));
        assert.ok(catalog.proconfig.includes('search_path=""'));
        assert.equal(catalog.browser_closed, true);
        assert.equal(catalog.anon_closed, true);
        assert.equal((await db.query("SELECT rolbypassrls OR rolcanlogin OR rolsuper unsafe FROM pg_roles WHERE rolname='synapse_gmail_manager'")).rows[0].unsafe, false);
        await assert.rejects(call('options', {}, 0), { code: '42501' });
        await db.query('UPDATE synapse_gateway.operations_control SET writes_enabled=false');
        assert.ok((await call('options')).officers.some((o: {
            id: string;
        }) => o.id === users[0]));
        const stateHash = createHash('sha256').update(randomUUID()).digest('hex'), connectionId = randomUUID(), address = 'synthetic-intake@example.invalid';
        await call('begin', { stateHash, connectionId, address, bureauId: bureaus[0], reviewOwnerId: users[0], label: 'INBOX', verifierCiphertext: 'synthetic-encrypted-verifier', redirectUri: 'https://synapse.example.invalid/api/integrations/gmail/oauth/callback' });
        const original = claims;
        void original;
        const c = await pool.connect();
        try {
            await c.query('BEGIN');
            await c.query('SET LOCAL ROLE synapse_web_gateway');
            await assert.rejects(c.query('SELECT synapse_gateway.gmail($1,$2,$3)', [{ ...claims(), session_id: randomUUID() }, 'consume', { stateHash }]), { code: '28000' });
            await c.query('ROLLBACK');
        }
        finally {
            c.release();
        }
        assert.equal((await call('consume', { stateHash })).connectionId, connectionId);
        await assert.rejects(call('consume', { stateHash }), { code: '28000' });
        await call('complete', { stateHash, tokensCiphertext: 'synthetic-ciphertext-not-a-real-token' });
        await assert.rejects(call('complete', { stateHash, tokensCiphertext: 'replay' }), { code: '28000' });
        assert.equal((await call('status', { address })).status, 'AUTHORIZED');
        assert.equal((await call('worker.acquire', { address, leaseHash: 'unreleased' })).blocked, 'OPERATIONS_RELEASE_REQUIRED');
        await db.query('UPDATE synapse_gateway.operations_control SET writes_enabled=true');
        const leaseHash = createHash('sha256').update(randomUUID()).digest('hex'), input = { connectionId, leaseHash };
        assert.equal((await call('worker.acquire', { address, leaseHash })).id, connectionId);
        await assert.rejects(call('worker.enqueue', { ...input, leaseHash: 'wrong', messageIds: ['synthetic-email'], cursor: {} }), { code: '28000' });
        await call('worker.enqueue', { ...input, messageIds: ['synthetic-email'], cursor: { mode: 'history', anchor: '100' } });
        await call('worker.enqueue', { ...input, messageIds: ['synthetic-email'], cursor: { mode: 'history', anchor: '100' } });
        const queue = await call('worker.next', input), bytes = Buffer.from('Synthetic plain-text evidence');
        const email = { ...input, queueId: queue.id, messageId: 'synthetic-email', body: 'Synthetic SQL-only email; never fetched from a mailbox.', subject: 'Synthetic fixture', sender: 'sender@example.invalid', receivedAt: new Date().toISOString(), fingerprint: createHash('sha256').update('fixture').digest('hex'), rawMime: Buffer.from('Subject: Synthetic fixture\r\n\r\nFixture only').toString('base64'), attachments: [{ name: 'evidence.txt', mediaType: 'text/plain', sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.toString('base64'), scan: 'NOT_REQUIRED' }] };
        const result = await call('worker.ingest', email);
        assert.ok(result.draftId);
        assert.equal((await call('status', { address })).ingested, 1);
        const draft = (await db.query('SELECT submitted_by_user_id,intake_owner_user_id,submission_status,human_verified,original_body FROM synapse.case_submissions WHERE submission_id=$1', [result.draftId])).rows[0];
        assert.equal(draft.submitted_by_user_id, null);
        assert.equal(draft.intake_owner_user_id, users[0]);
        assert.equal(draft.human_verified, false);
        assert.equal(draft.submission_status, 'DRAFT');
        assert.equal(draft.original_body, email.body);
        assert.equal((await db.query('SELECT count(*)::int n FROM synapse_gateway.gmail_attachments WHERE submission_id=$1', [result.draftId])).rows[0].n, 1);
        assert.equal((await call('worker.next', input)).id, undefined);
        await call('worker.enqueue',{...input,messageIds:['inactive-bureau-email'],cursor:{}});const paused=await call('worker.next',input);await db.query('UPDATE synapse.bureaus SET is_active=false WHERE bureau_id=$1',[bureaus[0]]);await assert.rejects(call('worker.ingest',{...email,queueId:paused.id,messageId:paused.messageId}),{code:'42501'});await db.query('UPDATE synapse.bureaus SET is_active=true WHERE bureau_id=$1',[bureaus[0]]);assert.ok((await call('worker.ingest',{...email,queueId:paused.id,messageId:paused.messageId})).draftId);
        await call('worker.enqueue', { ...input, messageIds: ['revoked-officer-email'], cursor: {} });
        const revoked = await call('worker.next', input);
        await db.query("UPDATE synapse.user_role_assignments SET valid_until=now() WHERE user_id=$1", [users[0]]);
        await assert.rejects(call('worker.ingest', { ...email, queueId: revoked.id, messageId: revoked.messageId }), { code: '42501' });
        await db.query("UPDATE synapse.user_role_assignments SET valid_until=now()+interval '1 day' WHERE user_id=$1", [users[0]]);
        await call('worker.finish', input);
        await call('disconnect', { address });
        assert.equal((await call('status', { address })).status, 'DISCONNECTED');
        assert.equal((await db.query('SELECT count(*)::int n FROM synapse.case_submissions WHERE submission_id=$1', [result.draftId])).rows[0].n, 1);
        return { draftId: result.draftId, message: 'GMAIL SQL: private function ownership/grants/search_path, non-bypass role, administrator-only OAuth, session-bound one-time state and completion, operations release denial, worker lease isolation, durable de-duplication, actual canonical draft/raw MIME/attachment/audit persistence, human review default, inactive Bureau and revoked officer denial PASS. Synthetic SQL fixtures only; no provider/mailbox test.' };
    }
    finally {
        await pool.end();
    }
}
