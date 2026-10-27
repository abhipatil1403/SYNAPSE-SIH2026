import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { loadVault } from '../phase2/vault.mjs';
import { verifyCurrentSession } from '../../lib/auth/live-session.ts';
import { gatewayCa } from '../../lib/auth/gateway-ca.ts';
const origin = 'https://synapse-sih-2026.vercel.app', preflight = process.argv.includes('--read-only-preflight');
if (!process.argv.includes('--approved-development-release'))
    throw Error('EXPLICIT_APPROVED_DEVELOPMENT_TEST_REQUIRED');
if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname !== 'xjnukuerzlrxjjqwmgkn.supabase.co')
    throw Error('PROJECT_MISMATCH');
for (const key of ['DATABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])
    if (process.env[key])
        throw Error('OPERATOR_ENV_NOT_ALLOWED_IN_WORKFLOW_TEST');
const actors = [], checks = [], testSessions = [];
let phase = 'START', fixtures;
const ok = (condition, label) => assert.ok(condition, label), save = async () => writeFile('.local/phase16/hosted-fixtures.json', JSON.stringify(fixtures, null, 2));
async function expect(response, status, label) { if (response.status !== status) {
    let code = 'UNEXPECTED_RESPONSE';
    try {
        code = (await response.json()).error?.code ?? code;
    }
    catch { }
    throw Error(label + '_' + response.status + '_' + String(code).toUpperCase());
} return response; }
function actor(account) { const cookies = new Map(); return { account, snapshot: null, header: () => [...cookies].map(([k, v]) => k + '=' + v).join('; '), async call(path, { body, method = body === undefined ? 'GET' : 'POST', cookie } = {}) { const form = body instanceof FormData; const response = await fetch(origin + path, { method, headers: { Origin: origin, Cookie: cookie ?? this.header(), ...(body !== undefined && !form ? { 'Content-Type': 'application/json' } : {}) }, ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }), redirect: 'manual', signal: AbortSignal.timeout(60000) }); if (cookie === undefined)
        for (const value of response.headers.getSetCookie()) {
            const first = value.split(';')[0], position = first.indexOf('=');
            cookies.set(first.slice(0, position), first.slice(position + 1));
        } return response; }, async snap() { const response = await expect(await this.call('/api/workspace/snapshot'), 200, 'CANONICAL_SNAPSHOT'); ok(response.headers.get('x-synapse-data-source')?.includes('canonical'), 'CANONICAL_SOURCE_REQUIRED'); const result = await response.json(); ok(!result.workspace, 'LEGACY_ACCOUNT_PREVIEW_MUST_BE_REPLACED'); this.snapshot = result; return result; }, async send(command, key = randomUUID()) { return (await expect(await this.call('/api/workspace/commands', { body: { idempotencyKey: key, command } }), 200, 'COMMAND_' + command.type.replaceAll('.', '_').toUpperCase())).json(); }, async detail(caseId) { return (await expect(await this.call('/api/workspace/cases/' + caseId), 200, 'OWN_CASE_DETAIL')).json(); } }; }
async function caseCommand(a, caseId, command) { const { case: c } = await a.detail(caseId); return a.send({ ...command, caseId, expectedVersion: c.version }); }
async function actualRls(officers, caseIds, evidenceId) {
    const url = new URL(process.env.SYNAPSE_GATEWAY_DATABASE_URL);
    ok(decodeURIComponent(url.username) === 'synapse_web_login.xjnukuerzlrxjjqwmgkn', 'RESTRICTED_DATABASE_LOGIN_REQUIRED');
    const pool = new pg.Pool({ connectionString: url.href, ssl: { ca: gatewayCa(), servername: url.hostname, rejectUnauthorized: true }, max: 1, statement_timeout: 8000 });
    try {
        for (const [n, a] of officers.entries()) {
            const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (u, i) => fetch(u, { ...i, signal: AbortSignal.timeout(20000) }) } });
            testSessions.push(client);
            const login = await client.auth.signInWithPassword({ email: a.account.email, password: a.account.password });
            ok(!login.error && login.data.session, 'REAL_SQL_AUTH_LOGIN_REQUIRED');
            const identity = await verifyCurrentSession(client.auth, process.env.NEXT_PUBLIC_SUPABASE_URL), c = await pool.connect();
            try {
                await c.query('BEGIN READ ONLY');
                await c.query('SET LOCAL ROLE synapse_operations_runtime');
                await c.query('SET LOCAL jit=off');
                await c.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify(identity.claims)]);
                const actor = (await c.query('SELECT synapse_gateway.ops_actor() id')).rows[0].id;
                assert.equal(actor, a.snapshot.me.id, 'REAL_SUBJECT_MAPPING_MISMATCH');
                const visible = (await c.query('SELECT case_id FROM synapse.cases WHERE case_id=ANY($1::uuid[])', [caseIds])).rows.map(r => r.case_id);
                assert.deepEqual(visible, [caseIds[n]], 'REAL_JWT_TWO_BUREAU_RLS_LEAK');
                const bytes = (await c.query('SELECT count(*)::int n FROM synapse_gateway.document_bytes b JOIN synapse.evidence_items e ON e.document_version_id=b.version_id WHERE e.evidence_item_id=$1', [evidenceId])).rows[0].n;
                assert.equal(bytes, n === 0 ? 1 : 0, 'REAL_JWT_DOCUMENT_RLS_LEAK');
                await c.query('COMMIT');
            }
            catch (error) {
                await c.query('ROLLBACK');
                throw error;
            }
            finally {
                c.release();
            }
        }
    }
    finally {
        await pool.end();
    }
    checks.push('Actual issued JWTs + provider-current online verification + restricted TLS SQL login: each Bureau sees only its own new case; only owning officer can read the quarantined byte row under RLS.');
}
async function main() {
    await mkdir('.local/phase16', { recursive: true });
    try {
        fixtures = JSON.parse(await readFile('.local/phase16/hosted-fixtures.json', 'utf8'));
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
        fixtures = { runId: randomUUID(), officers: [{}, {}] };
        await save();
    }
    const vault = await loadVault('.local/acceptance/real-users.vault');
    phase = 'LOGIN_AND_CURRENT_CANONICAL_SNAPSHOTS';
    for (const account of vault.accounts) {
        phase = 'CANONICAL_PREFLIGHT_ACCOUNT_' + (actors.length + 1);
        const a = actor(account);
        actors.push(a);
        const response = await expect(await a.call('/api/auth/login', { body: { email: account.email, password: account.password } }), 200, 'REAL_HOSTED_LOGIN');
        const login = await response.json();
        ok(login.account.status === 'APPROVED' && (preflight || login.liveEnabled === true), 'APPROVED_DEVELOPMENT_RELEASE_REQUIRED');
        const snap = await a.snap();
        ok(snap.me, 'CURRENT_SERVER_IDENTITY_REQUIRED');
    }
    const admin = actors.find(a => a.snapshot.me.roles.includes('SYSTEM_ADMIN')), officers = actors.filter(a => a.snapshot.me.roles.includes('CASE_OFFICER') && !a.snapshot.me.roles.includes('SYSTEM_ADMIN'));
    ok(admin && officers.length === 2, 'EXACT_APPROVED_ACCOUNT_ROLES_REQUIRED');
    const [A, B] = officers;
    const bureau = (a, word) => a.snapshot.me.bureauIds.find(id => a.snapshot.bureaus.some(b => b.id === id && b.name.toLowerCase().includes(word)));
    const bureaus = [bureau(A, 'approval'), bureau(B, 'academic')];
    ok(bureaus.every(Boolean) && bureaus[0] !== bureaus[1], 'EXACT_APPROVED_SEPARATE_BUREAUS_REQUIRED');
    for (const a of officers)
        ok(a.snapshot.me.roles.every(r => r === 'CASE_OFFICER'), 'EXISTING_OFFICER_ROLE_MUST_NOT_BE_ELEVATED');
    const before = officers.map(a => a.snapshot.cases.length);
    checks.push('Actual production HTTPS login and provider-current approved identity; original workspace returns canonical data with no account-only preview for all three approved accounts. Existing Case Officer assignments remain separate.');
    if (preflight) {
        await writeFile('docs/phase16/HOSTED_PREFLIGHT_RESULTS.json', JSON.stringify({ checkedAt: new Date().toISOString(), realHosted: true, actualIssuedJwt: true, providerMocked: false, businessRecordsWritten: false, canonicalAccounts: actors.length, separateApprovedOfficerBureaus: true, checks, allPassed: true }, null, 2) + '\n');
        console.log('PASS actual hosted canonical read preflight for three approved accounts.');
        return;
    }
    phase = 'REAL_DEVELOPMENT_INSTITUTION_AND_CATEGORY';
    if (!fixtures.institutionId) {
        const result = await A.send({ type: 'institution.create', permanentId: 'DEV-P16-' + fixtures.runId.slice(0, 8), name: 'SYNAPSE DEVELOPMENT ONLY — Release acceptance ' + fixtures.runId.slice(0, 8), state: 'Development test', region: 'Development test' });
        fixtures.institutionId = result.entityId;
        await save();
    }
    if (!fixtures.categoryId) {
        const result = await admin.send({ type: 'category.create', name: 'Development release acceptance ' + fixtures.runId.slice(0, 8) });
        fixtures.categoryId = result.entityId;
        await save();
    }
    for (const [n, a] of officers.entries()) {
        const f = fixtures.officers[n];
        phase = 'OFFICER_' + (n + 1) + '_REAL_INTAKE';
        if (!f.draftId) {
            const result = await a.send({ type: 'draft.create', source: 'MANUAL', sourceReference: 'DEV-P16-' + fixtures.runId + '-' + n, subject: 'DEVELOPMENT ACCEPTANCE ONLY — Bureau ' + (n + 1) + ' — ' + fixtures.runId.slice(0, 8), body: n === 0 ? 'यह केवल SYNAPSE विकास स्वीकृति परीक्षण है। यह किसी वास्तविक संस्थान की शिकायत नहीं है। पंजीकरण, विभागीय अधिकार और संगरोध की जाँच करें। परीक्षण ' + fixtures.runId : 'Owner-approved automated development fixture. This is not an actual institutional complaint. Verify canonical registration, isolation and quarantine. Fixture ' + fixtures.runId + ' / Bureau ' + (n + 1), language: n === 0 ? 'hi' : 'en', bureauId: bureaus[n], institutionId: null });
            f.draftId = result.entityId;
            await save();
        }
        let snap = await a.snap(), draft = snap.drafts.find(d => d.id === f.draftId);
        ok(draft, 'OWN_DRAFT_PERSISTED');
        if (!draft.verified) {
            await a.send({ type: 'draft.verify', draftId: f.draftId, expectedVersion: draft.version, institutionId: fixtures.institutionId, reason: 'Owner-approved automated inspection of synthetic development fixture; not a real complainant review.' });
            snap = await a.snap();
            draft = snap.drafts.find(d => d.id === f.draftId);
        }
        if (!f.processingCompleted || (n === 0 && !f.translationCompleted)) {
            for (let i = 0; i < 7; i++) {
                const response = await expect(await a.call('/api/workspace/processing/run', { body: { draftId: f.draftId } }), 200, 'REAL_HOSTED_PROVIDER_JOB');
                const result = await response.json();
                if (!result.processed)
                    break;
                if (result.status === 'COMPLETED') {
                    if (result.kind === 'MATCH') {
                        ok(result.result.provider === 'Google Gemini' && result.result.categorySuggestionsExecuted === true, 'ACTUAL_GEMINI_PROVENANCE_REQUIRED');
                        f.processingCompleted = true;
                    }
                    else {
                        ok(result.kind === 'TRANSLATE' && result.result.provider === 'Google Cloud Translation' && result.result.humanReviewRequired === true, 'ACTUAL_TRANSLATION_PROVENANCE_REQUIRED');
                        f.translationCompleted = true;
                    }
                    await save();
                }
                else
                    ok(result.status === 'SUPERSEDED', 'REAL_PROVIDER_PROCESSING_' + String(result.errorCode ?? result.status));
            }
            ok(f.processingCompleted, 'COMPLETED_REAL_PROVIDER_JOB_REQUIRED');
        }
        if (n === 0 && !f.translationReviewed) {
            snap = await a.snap();
            draft = snap.drafts.find(d => d.id === f.draftId);
            const translated = snap.translations.find(t => t.draftId === f.draftId && t.reviewStatus === 'NEEDS_REVIEW');
            ok(translated?.provider === 'Google Cloud Translation' && translated.body.trim() && translated.body !== draft.body, 'ACTUAL_ENGLISH_TRANSLATION_REVIEW_REQUIRED');
            await expect(await a.call('/api/workspace/commands', { body: { idempotencyKey: randomUUID(), command: { type: 'draft.register', draftId: f.draftId, expectedVersion: draft.version, categoryId: fixtures.categoryId, officerId: snap.me.id, priority: 'NORMAL' } } }), 409, 'UNREVIEWED_TRANSLATION_REGISTRATION_DENIED');
            await a.send({ type: 'translation.correct', draftId: f.draftId, translationId: translated.id, expectedVersion: draft.version, subject: translated.subject, body: translated.body, reason: 'Owner-approved automated acceptance inspection of a known Hindi development fixture and actual provider output; not a production human review.' });
            f.translationReviewed = true;
            await save();
        }
        if (!f.caseId) {
            snap = await a.snap();
            draft = snap.drafts.find(d => d.id === f.draftId);
            f.registerKey ??= randomUUID();
            f.registerCommand = { type: 'draft.register', draftId: f.draftId, expectedVersion: draft.version, categoryId: fixtures.categoryId, officerId: snap.me.id, priority: 'NORMAL', discoveryAllowed: false };
            await save();
            const result = await a.send(f.registerCommand, f.registerKey);
            f.caseId = result.entityId;
            f.registerResult = result;
            await save();
        }
        assert.deepEqual(await a.send(f.registerCommand, f.registerKey), f.registerResult, 'REGISTRATION_IDEMPOTENCY_FAILED');
        const detail = await a.detail(f.caseId);
        ok(detail.case.bureauId === bureaus[n] && detail.case.officerId === a.snapshot.me.id, 'PERSISTED_CASE_ASSIGNMENT_REQUIRED');
    }
    const caseIds = fixtures.officers.map(f => f.caseId), caseId = caseIds[0];
    checks.push('Both officers created clearly labelled development-only intake through real APIs, verified known test content, executed actual hosted Gemini categorization and Hindi-to-English Cloud Translation with enforced review, and registered distinct canonical cases. Replaying each registration key returns the original receipt.');
    phase = 'CROSS_BUREAU_AND_ADMIN_CASE_DENIAL';
    for (const [n, a] of officers.entries()) {
        const other = caseIds[1 - n];
        await expect(await a.call('/api/workspace/cases/' + other), 404, 'CROSS_BUREAU_CASE_READ_DENIAL');
        await expect(await a.call('/api/workspace/commands', { body: { idempotencyKey: randomUUID(), command: { type: 'case.priority', caseId: other, expectedVersion: '1', priority: 'URGENT', reason: 'Approved cross-Bureau negative test; must not commit.' } } }), 404, 'CROSS_BUREAU_OPERATION_DENIAL');
        const s = await a.snap();
        ok(!s.cases.some(c => c.id === other), 'CROSS_BUREAU_SNAPSHOT_LEAK');
    }
    for (const id of caseIds)
        await expect(await admin.call('/api/workspace/cases/' + id), 404, 'ADMIN_NO_COMPLAINT_BYPASS');
    checks.push('Both officers are denied the other Bureau exact case URL and mutation. Administrator configuration authority cannot read either complaint.');
    phase = 'TASKS_PRIORITY_CALENDAR_AND_COUNTS';
    await caseCommand(A, caseId, { type: 'case.priority', priority: 'HIGH', reason: 'Development fixture priority persistence test.' });
    let detail = await A.detail(caseId);
    assert.equal(detail.case.priority, 'HIGH');
    await expect(await A.call('/api/workspace/commands', { body: { idempotencyKey: randomUUID(), command: { type: 'case.priority', caseId, expectedVersion: '1', priority: 'LOW', reason: 'Stale version negative test; must not commit.' } } }), 409, 'STALE_VERSION_DENIED');
    if (!fixtures.taskId) {
        const r = await caseCommand(A, caseId, { type: 'task.create', title: 'Development acceptance task ' + fixtures.runId.slice(0, 8), taskType: 'INVESTIGATION', assigneeId: A.snapshot.me.id, dueAt: new Date(Date.now() + 86400000).toISOString() });
        detail = await A.detail(caseId);
        fixtures.taskId = detail.tasks.find(t => t.title === 'Development acceptance task ' + fixtures.runId.slice(0, 8))?.id;
        ok(fixtures.taskId && r.entityId, 'PERSISTED_TASK_REQUIRED');
        await save();
    }
    await caseCommand(A, caseId, { type: 'task.update', taskId: fixtures.taskId, status: 'COMPLETED' });
    detail = await A.detail(caseId);
    ok(detail.tasks.some(t => t.id === fixtures.taskId && t.status === 'COMPLETED'), 'PERSISTED_TASK_UPDATE_REQUIRED');
    const currentCalendar = await (await expect(await A.call('/api/workspace/calendar'), 200, 'CURRENT_CALENDAR')).json();
    if (fixtures.eventId && !currentCalendar.some(e => e.id === fixtures.eventId)) {
        fixtures.eventId = null;
        await save();
    }
    if (!fixtures.eventId) {
        const result = await caseCommand(A, caseId, { type: 'event.schedule', title: 'Development acceptance review', at: new Date(Date.now() + 86400000).toISOString(), kind: 'REVIEW', reason: 'Development fixture calendar test.' });
        fixtures.eventId = result.entityId;
        await save();
    }
    const calendar = await (await expect(await A.call('/api/workspace/calendar'), 200, 'REAL_CALENDAR')).json();
    ok(calendar.some(e => e.id === fixtures.eventId), 'PERSISTED_CALENDAR_EVENT_REQUIRED');
    await caseCommand(A, caseId, { type: 'event.reschedule', eventId: fixtures.eventId, title: 'Development acceptance review rescheduled', at: new Date(Date.now() + 172800000).toISOString(), reason: 'Development fixture reschedule test.' });
    await caseCommand(A, caseId, { type: 'event.cancel', eventId: fixtures.eventId, reason: 'Development acceptance concluded; do not leave an artificial upcoming review.' });
    const afterCalendar = await (await expect(await A.call('/api/workspace/calendar'), 200, 'REAL_CALENDAR_AFTER_CANCEL')).json();
    ok(!afterCalendar.some(e => e.id === fixtures.eventId), 'CANCELLED_CALENDAR_EVENT_REMAINED');
    for (const [n, a] of officers.entries()) {
        const snapshot = await a.snap(), dashboard = await (await expect(await a.call('/api/workspace/dashboard'), 200, 'REAL_DASHBOARD')).json();
        assert.equal(dashboard.total, snapshot.cases.length, 'REAL_DASHBOARD_COUNT_MISMATCH');
        ok(snapshot.cases.length >= before[n], 'AUTHORIZED_CASE_COUNT_REGRESSION');
        const report = await (await expect(await a.call('/api/workspace/reports'), 200, 'AUTHORIZED_REPORT')).json();
        ok(report.rows.some(c => c.caseNumber === snapshot.cases.find(c => c.id === caseIds[n]).caseNumber), 'OWN_CASE_REPORT_REQUIRED');
    }
    checks.push('Actual canonical priority/task changes, optimistic concurrency denial, calendar schedule/reschedule/cancel, authorized report and computed dashboard totals verified through production HTTP. Test calendar entry cancelled.');
    phase = 'ACTUAL_BYTES_QUARANTINE_AND_DOCUMENT_ISOLATION';
    const bytes = Buffer.from('DEVELOPMENT ACCEPTANCE ONLY — harmless unscanned fixture ' + fixtures.runId), hash = createHash('sha256').update(bytes).digest('hex');
    if (!fixtures.evidenceId) {
        const d = await A.detail(caseId), form = new FormData();
        form.set('file', new Blob([bytes], { type: 'text/plain' }), 'development-acceptance.txt');
        form.set('expectedVersion', d.case.version);
        const uploaded = await (await expect(await A.call('/api/workbench/attachments/' + caseId, { body: form }), 202, 'ACTUAL_ATTACHMENT_UPLOAD')).json();
        assert.equal(uploaded.scan, 'PENDING');
        fixtures.evidenceId = uploaded.id;
        await save();
    }
    detail = await A.detail(caseId);
    const evidence = detail.evidence.find(e => e.id === fixtures.evidenceId);
    ok(evidence && evidence.sha256 === hash && evidence.byteSize === bytes.length && evidence.scan === 'PENDING', 'ACTUAL_QUARANTINED_BYTE_METADATA_REQUIRED');
    for (const a of officers)
        await expect(await a.call('/api/workbench/attachments/' + caseId + '?id=' + fixtures.evidenceId), 404, 'QUARANTINED_OR_UNAUTHORIZED_DOWNLOAD_DENIED');
    await expect(await B.call('/api/workspace/attachments/scan', { body: { kind: 'DOCUMENT', id: fixtures.evidenceId, caseId } }), 404, 'CROSS_BUREAU_SCAN_DENIED');
    await expect(await A.call('/api/workspace/attachments/scan', { body: { kind: 'DOCUMENT', id: fixtures.evidenceId, caseId } }), 503, 'MISSING_REAL_SCANNER_DENIES_CLEARANCE');
    detail = await A.detail(caseId);
    await expect(await A.call('/api/workspace/commands', { body: { idempotencyKey: randomUUID(), command: { type: 'evidence.review', caseId, expectedVersion: detail.case.version, evidenceId: fixtures.evidenceId, status: 'VERIFIED', reason: 'Approved quarantine negative test; must not mark verified.' } } }), 409, 'UNSCANNED_HUMAN_VERIFICATION_DENIED');
    await expect(await A.call('/api/workspace/commands', { body: { idempotencyKey: randomUUID(), command: { type: 'case.assign', caseId, expectedVersion: detail.case.version, officerId: A.snapshot.me.id, reason: 'Case Officer cannot perform Bureau Head assignment.' } } }), 403, 'BUREAU_HEAD_ONLY_OPERATION_DENIED');
    checks.push('Actual harmless attachment bytes persisted with matching SHA-256/size in quarantine. Owner and other Bureau downloads denied; other Bureau cannot scan; missing scanner cannot clear; unscanned verification and Case Officer head-only assignment denied. No ClamAV success simulated.');
    phase = 'REAL_ISSUED_JWT_HOSTED_RLS';
    await actualRls(officers, caseIds, fixtures.evidenceId);
    phase = 'LOGOUT_AND_REVOKED_COOKIE_REPLAY';
    for (const a of actors) {
        await expect(await a.call('/api/auth/refresh', { body: {} }), 200, 'REAL_REFRESH');
        const stale = a.header();
        await expect(await a.call('/api/auth/logout', { body: {} }), 200, 'REAL_APPLICATION_LOGOUT');
        await expect(await a.call('/api/workspace/snapshot', { cookie: stale }), 401, 'LOGGED_OUT_PROTECTED_REPLAY_DENIED');
    }
    checks.push('Actual refresh and application logout succeeded for all three fresh test sessions; unchanged old cookie replay cannot access the enabled canonical workspace. No existing user session or role was intentionally changed.');
    await writeFile('docs/phase16/HOSTED_WORKFLOW_RESULTS.json', JSON.stringify({ checkedAt: new Date().toISOString(), origin, reviewedImplementationCommit: 'c30898630e061a5874c103e9f63ce4b7efa0e744', testedReleaseCommit: JSON.parse(await readFile('docs/phase16/DEVELOPMENT_ACTIVATION.json','utf8')).testedReleaseCommit, realHosted: true, actualIssuedJwt: true, providerMocked: false, browserAutomation: false, developmentFixtureOnly: true, fixturesRetainedForAudit: true, fixtureCases: caseIds.map(id => ({ url: origin + '/complaints/' + id })), newCanonicalCases: 2, actualHostedGeminiProcessing: true, actualHostedCloudTranslation: true, actualHostedClamAV: false, mailboxRead: false, existingRoleAssignmentsChanged: false, existingBureauMembershipsChanged: false, managedSchemaChanged: false, headApprovalPositiveTest: 'Not run: no approved Bureau Head credentials supplied; existing Case Officers were not elevated.', suspensionOrRoleRevocationRetested: 'Not mutated in this run to preserve approved assignments; prior disposable SQL tests retain coverage.', fullAccessTokenLifetimeWait: 'Not repeated; current refresh/logout/replay checked with real tokens.', checks, allPassed: true }, null, 2) + '\n');
    console.log('PASS actual hosted development workflows, actual Google jobs, issued-JWT two-Bureau RLS and quarantine isolation.');
}
try {
    await main();
}
catch (error) {
    const message = String(error.message), safe = /^[A-Z0-9_.-]{3,200}$/.test(message) ? message : 'HOSTED_WORKFLOW_TEST_FAILED';
    await writeFile('.local/phase16/hosted-workflow-failure.json', JSON.stringify({ checkedAt: new Date().toISOString(), phase, safeCode: safe, checksPassed: checks.length }, null, 2));
    console.error('Sanitized hosted workflow failure: ' + phase + ' / ' + safe);
    process.exitCode = 1;
}
finally {
    for (const a of actors)
        await a.call('/api/auth/logout', { body: {} }).catch(() => { });
    for (const c of testSessions)
        await c.auth.signOut({ scope: 'local' }).catch(() => { });
}
