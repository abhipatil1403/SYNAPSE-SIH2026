import assert from 'node:assert/strict';
import type { Client, Pool } from 'pg';
import { CanonicalStore } from '../../lib/hosted/store';
import { PlatformEngine } from '../../lib/platform/engine';
import { processHostedJob } from '../../lib/hosted/processing';
import type { Command, Principal } from '../../lib/platform/contracts';
import type { TranslationProvider, SemanticProvider } from '../../lib/automation/providers';
export async function verifyHostedProcessing(db: Client, pool: Pool, users: string[], auth: string[], sessions: string[], bureaus: string[], institutionId: string, categoryId: string) {
    const claims = (n = 0) => ({ sub: auth[n], session_id: sessions[n], role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }), principal = (n = 0): Principal => ({ userId: users[n], authId: auth[n], sessionId: sessions[n] }), store = (n = 0) => new CanonicalStore(pool, principal(n), claims(n), undefined, undefined, error => {
        const e = error as {
            code?: string;
            message?: string;
        };
        console.error(JSON.stringify({ syntheticPhase16Only: true, code: e.code, message: e.message }));
    });
    const snapshot = (n = 0) => new PlatformEngine(store(n)).snapshot(principal(n));
    const send = (command: Command, n = 0) => { const key = crypto.randomUUID(); return new PlatformEngine({ transaction: work => store(n).write(command, work, key) }).execute(principal(n), { idempotencyKey: key, command }); };
    const resolve = (n = 0) => async () => ({ principal: principal(n), store: store(n) });
    let calls = 0;
    const translation: TranslationProvider = { translate: async (subject, body) => { calls++; return { subject: 'Synthetic translated subject', body: 'Synthetic translated complaint body', language: 'hi', score: null, provider: 'Explicit mock transport for disposable SQL test', version: 'mock-translation/1' }; } };
    const semantic: SemanticProvider = { version: 'mock-embedding/1', embed: async (texts) => { calls++; return texts.map((_, i) => i === 0 ? [1, 0] : [.8, .6]); } };
    const d = await send({ type: 'draft.create', source: 'MANUAL', sourceReference: 'phase16-processing-fixture', subject: 'Synthetic multilingual original', body: 'Original retained text for the synthetic translation fixture.', language: 'hi', institutionId: null, bureauId: bureaus[0] });
    await send({ type: 'draft.verify', draftId: d.entityId, expectedVersion: '1', institutionId, reason: 'Synthetic human institution review' });
    assert.deepEqual(await processHostedJob(resolve(1), { processingApproved: true, translation, semantic }, d.entityId), { processed: false });
    assert.equal(calls, 0);
    for (let n = 0; n < 4; n++)
        await processHostedJob(resolve(), { processingApproved: false }, d.entityId);
    assert.equal(calls, 0);
    const blocked = await store().locked(async (c) => (await c.query("SELECT count(*)::int n FROM synapse_gateway.processing_jobs WHERE submission_id=$1 AND status='BLOCKED'", [d.entityId])).rows[0].n);
    assert.ok(blocked > 0);
    await store().locked(async (c) => { await c.query("UPDATE synapse_gateway.processing_jobs SET status='QUEUED' WHERE submission_id=$1 AND status='BLOCKED'", [d.entityId]); }, true);
    for (let n = 0; n < 4; n++)
        await processHostedJob(resolve(), { processingApproved: true, translation, semantic }, d.entityId);
    let s = await snapshot(), draft = s.drafts.find(x => x.id === d.entityId)!, t = s.translations?.find(t => t.draftId === d.entityId)!;
    assert.ok(t);
    assert.equal(t.reviewStatus, 'NEEDS_REVIEW');
    assert.equal(draft.body, 'Original retained text for the synthetic translation fixture.');
    assert.ok(draft.categorySuggestions?.length);
    await assert.rejects(send({ type: 'draft.register', draftId: d.entityId, expectedVersion: draft.version, categoryId, officerId: users[0], priority: 'NORMAL', discoveryAllowed: true }), { code: 'translation_review_required' });
    await send({ type: 'translation.correct', draftId: d.entityId, expectedVersion: draft.version, translationId: t.id, subject: t.subject, body: t.body, reason: 'Synthetic human compared translation against original' });
    s = await snapshot();
    draft = s.drafts.find(x => x.id === d.entityId)!;
    for (const m of s.matches.filter(m => m.draftId === d.entityId && m.decision === 'PENDING')) {
        await send({ type: 'match.review', draftId: d.entityId, expectedVersion: draft.version, matchId: m.id, decision: 'DISTINCT', reason: 'Synthetic independent complaint review' });
        draft = (await snapshot()).drafts.find(x => x.id === d.entityId)!;
    }
    const registered = await send({ type: 'draft.register', draftId: d.entityId, expectedVersion: draft.version, categoryId, officerId: users[0], priority: 'NORMAL', discoveryAllowed: true });
    const b = await snapshot(1);
    assert.equal(b.cases.some(c => c.id === registered.entityId), false);
    const metadata = b.discovery?.find(c => c.id === registered.entityId)!;
    assert.ok(metadata);
    assert.deepEqual(Object.keys(metadata).sort(), ['id', 'caseNumber', 'institutionId', 'categoryId', 'bureauId'].sort());
    assert.equal((await snapshot(4)).discovery?.length, 0);
    const request = await send({ type: 'access.request', caseId: registered.entityId, scope: 'DETAILS', until: new Date(Date.now() + 3600000).toISOString(), reason: 'Synthetic explicit cross-Bureau detail request' }, 1);
    const version = async () => ((await snapshot(2)).cases.find(c => c.id === registered.entityId)!.version);
    await send({ type: 'access.decide', caseId: registered.entityId, expectedVersion: await version(), requestId: request.entityId, decision: 'APPROVED', reason: 'Independent owning Bureau approval of detail scope' }, 2);
    assert.equal((await snapshot(1)).cases.some(c => c.id === registered.entityId), true);
    await send({ type: 'access.revoke', caseId: registered.entityId, expectedVersion: await version(), userId: users[1], scope: 'DETAILS', reason: 'Synthetic revocation test' }, 2);
    assert.equal((await snapshot(1)).cases.some(c => c.id === registered.entityId), false);
    const stale = await send({ type: 'draft.create', source: 'MANUAL', sourceReference: 'phase16-stale-provider-fixture', subject: 'Synthetic source race', body: 'Source must not accept a stale provider result.', language: 'hi', institutionId, bureauId: bureaus[0] });
    let changed = false;
    const changingTranslation: TranslationProvider = { translate: async () => {
            if (!changed) {
                changed = true;
                await send({ type: 'draft.language', draftId: stale.entityId, expectedVersion: '1', language: 'mr', reason: 'Synthetic source change during network call' });
            }
            return { subject: 'Stale', body: 'Must not be committed', language: 'hi', score: null, provider: 'Explicit mock', version: 'mock/1' };
        } };
    for (let n = 0; n < 3 && !changed; n++)
        await processHostedJob(resolve(), { processingApproved: true, translation: changingTranslation, semantic }, stale.entityId);
    assert.equal(changed, true);
    assert.equal((await snapshot()).translations?.some(t => t.draftId === stale.entityId && t.body === 'Must not be committed'), false);
    let realProviderResult = '';
    if (process.argv.includes('--real-providers')) {
        if (process.env.SYNAPSE_DEV_EXTERNAL_PROCESSING_APPROVED !== 'true' || !process.env.SYNAPSE_GEMINI_EMBEDDINGS_API_KEY || !process.env.SYNAPSE_GOOGLE_TRANSLATION_KEY)
            throw Error('APPROVED_REAL_PROVIDER_CONFIGURATION_REQUIRED');
        const { GeminiEmbeddings, GoogleCloudTranslation } = await import('../../lib/automation/google');
        const real = await send({ type: 'draft.create', source: 'MANUAL', sourceReference: 'phase16-real-provider-development-only', subject: 'प्रयोगात्मक शिकायत', body: 'यह केवल विकास परीक्षण के लिए बनाई गई शिकायत है। किसी वास्तविक व्यक्ति या संस्था का निजी विवरण इसमें नहीं है।', language: 'hi', institutionId: null, bureauId: bureaus[0] });
        await send({ type: 'draft.verify', draftId: real.entityId, expectedVersion: '1', institutionId, reason: 'Authorized synthetic provider development test' });
        const settings = { processingApproved: true, translation: new GoogleCloudTranslation(process.env.SYNAPSE_GOOGLE_TRANSLATION_KEY), semantic: new GeminiEmbeddings(process.env.SYNAPSE_GEMINI_EMBEDDINGS_API_KEY, process.env.SYNAPSE_GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-001') };
        for (let n = 0; n < 5; n++)
            await processHostedJob(resolve(), settings, real.entityId);
        const observed = await snapshot(), translated = observed.translations?.find(t => t.draftId === real.entityId);
        assert.equal(translated?.provider, 'Google Cloud Translation');
        assert.equal(translated.reviewStatus, 'NEEDS_REVIEW');
        assert.ok(observed.drafts.find(d => d.id === real.entityId)?.categorySuggestions?.some(s => s.providerVersion.startsWith('Google Gemini/')));
        assert.ok(observed.matches.some(m => m.draftId === real.entityId && m.algorithmVersion.startsWith('Google Gemini/')));
        realProviderResult = ' Additional real approved development-provider requests: Google Cloud Translation and Gemini actual results persisted with provenance in disposable canonical PostgreSQL PASS; no production complaint data, no hosted writes, no mailbox read.';
    }
    const catalog = (await db.query("SELECT pg_get_userbyid(proowner) owner,prosecdef,proconfig,has_function_privilege('authenticated',oid,'EXECUTE') browser FROM pg_proc WHERE oid='synapse_gateway.ops_discovery()'::regprocedure")).rows[0];
    assert.equal(catalog.owner, 'synapse_discovery_reader');
    assert.equal(catalog.browser, false);
    assert.ok(catalog.proconfig.includes('search_path=""') && catalog.proconfig.includes('row_security=on'));
    assert.equal((await db.query("SELECT has_column_privilege('synapse_discovery_reader','synapse.cases','summary','SELECT') allowed")).rows[0].allowed, false);
    return 'HOSTED PROCESSING: real disposable PostgreSQL leases, blocked configuration, mocked actual-provider contract persistence/provenance, original preservation, human translation review, stale-source rejection, indexed authorized candidates, cross-Bureau provider denial, metadata-only discovery, independent access approval/revocation, no admin case bypass and private nonowning discovery grants PASS. Provider transport mocked for the authorization fixtures; no hosted activation.' + realProviderResult;
}
