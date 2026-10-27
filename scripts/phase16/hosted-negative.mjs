import assert from 'node:assert/strict';
import pg from 'pg';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { gatewayCa } from '../../lib/auth/gateway-ca.ts';
import { safeMain } from '../phase2/operator.mjs';
safeMain(async () => {
    const url = new URL(process.env.SYNAPSE_GATEWAY_DATABASE_URL);
    assert.equal(decodeURIComponent(url.username), 'synapse_web_login.xjnukuerzlrxjjqwmgkn');
    assert.match(url.hostname, /^aws-[a-z0-9-]+\.pooler\.supabase\.com$/);
    assert.equal(url.pathname, '/postgres');
    assert.equal(url.search, '');
    const db = new pg.Client({ connectionString: url.href, ssl: { ca: gatewayCa(), rejectUnauthorized: true, servername: url.hostname }, statement_timeout: 5000 });
    await db.connect();
    try {
        await assert.rejects(db.query('SELECT case_id FROM synapse.cases LIMIT 1'), { code: '42501' });
        await db.query('BEGIN');
        await db.query('SET LOCAL ROLE synapse_web_gateway');
        await assert.rejects(db.query("SELECT synapse_gateway.gmail('{}','options','{}')"), { code: '42501' });
        await db.query('ROLLBACK');
        await db.query('BEGIN');
        await db.query('SET LOCAL ROLE synapse_web_gateway');
        const lease = (await db.query("SELECT synapse_gateway.gmail('{}','worker.acquire',$1) result", [{ address: 'unconfigured@example.invalid', leaseHash: createHash('sha256').update(randomBytes(32)).digest('hex') }])).rows[0].result;
        assert.equal(lease.blocked, 'OPERATIONS_RELEASE_REQUIRED');
        await db.query('ROLLBACK');
        await db.query('BEGIN');
        await db.query('SET LOCAL ROLE synapse_operations_runtime');
        await db.query('SET LOCAL jit=off');
        await db.query("SELECT set_config('request.jwt.claims','{}',true)");
        assert.deepEqual((await db.query('SELECT enabled,writes_enabled FROM synapse_gateway.operations_control')).rows[0], { enabled: false, writes_enabled: false });
        for (const table of ['synapse.cases', 'synapse.case_submissions', 'synapse_gateway.document_bytes', 'synapse_gateway.gmail_attachments'])
            assert.equal((await db.query('SELECT count(*)::int n FROM ' + table)).rows[0].n, 0);
        for(const table of ['synapse_gateway.scanner_results','synapse_gateway.category_suggestions','synapse_gateway.processing_jobs']) assert.equal((await db.query('SELECT count(*)::int n FROM '+table)).rows[0].n,0);
        assert.equal((await db.query('SELECT jsonb_array_length(synapse_gateway.ops_discovery()) n')).rows[0].n,0);
        await assert.rejects(db.query('UPDATE synapse_gateway.operations_control SET enabled=true'), { code: '42501' });
        await db.query('ROLLBACK');
        await db.query('BEGIN');await db.query('SET LOCAL ROLE synapse_web_gateway');const reminders=(await db.query("SELECT synapse_gateway.deadline_notifications('{}') body")).rows[0].body;assert.equal(reminders.blocked,'OPERATIONS_RELEASE_REQUIRED');await db.query('ROLLBACK');
        const report = { checkedAt: new Date().toISOString(), environment: 'Actual deployed Supabase / restricted synapse_web_login / verified hostname and CA TLS', identity: 'No JWT or officer identity supplied; no identity impersonation', checks: ['Restricted login cannot directly query source cases', 'Private OAuth options reject missing authenticated administrator', 'Gmail worker refuses an inactive complaint write release', 'Empty claims see zero cases, submissions, document bytes and original Gmail attachments under actual RLS', 'Runtime role cannot enable its own release control','Empty claims see zero processing jobs, scanner receipts, category suggestions and discovery metadata','Private deadline delivery refuses the disabled release'], businessMutationPerformed: false, releaseEnabled: false, actualIssuedJwtTest: false, googleCalled: false };
        await mkdir('docs/phase16', { recursive: true });
        await writeFile('docs/phase16/HOSTED_NEGATIVE_RESULTS.json', JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify(report, null, 2));
    }
    finally {
        await db.end();
    }
});
