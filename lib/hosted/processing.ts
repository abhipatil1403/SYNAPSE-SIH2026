import { randomUUID, createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { CanonicalStore } from './store';
import { insert } from './persistence';
import { PlatformError, type Principal } from '../platform/contracts';
import { IntegrationError, type TranslationProvider, type SemanticProvider } from '../automation/providers';
import { normalizeText, cosine, lexicalSupport } from '../automation/normalization';
type Session = {
    principal: Principal;
    store: CanonicalStore;
};
type Settings = {
    processingApproved: boolean;
    translation?: TranslationProvider;
    semantic?: SemanticProvider;
};
type Job = {
    id: string;
    kind: 'TRANSLATE' | 'MATCH';
    submission_id: string;
    source_version: string;
    attempts: number;
    lease_token: string;
};
type Source = {
    submission_id: string;
    original_subject: string;
    original_body: string;
    original_language_code: string;
    institution_id: string | null;
    row_version: string;
    submission_status: string;
    received_at: string;
};
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const normalized = (subject: string, body: string) => normalizeText(subject, true) + '\n' + normalizeText(body);
async function source(c: PoolClient, id: string) { return (await c.query("SELECT submission_id,coalesce(original_subject,'') original_subject,coalesce(original_body,'') original_body,original_language_code,institution_id,row_version::text,submission_status,received_at FROM synapse.case_submissions WHERE submission_id=$1 AND synapse_gateway.ops_draft(submission_id,true)", [id])).rows[0] as Source | undefined; }
async function lease(c: PoolClient, job: Job) {
    if (!(await c.query("SELECT 1 FROM synapse_gateway.processing_jobs WHERE id=$1 AND lease_token=$2 AND lease_until>now() AND status='RUNNING' FOR UPDATE", [job.id, job.lease_token])).rowCount)
        throw new IntegrationError('PROCESSING_LEASE_EXPIRED', false);
}
async function advance(c: PoolClient, actor: string, draftId: string, kind: string, reason: string) { await c.query('UPDATE synapse_gateway.operations_control SET revision=revision+1 WHERE singleton'); await insert(c, 'synapse.audit_events', { audit_event_id: randomUUID(), actor_user_id: actor, event_type: 'PROCESSING_' + kind, entity_type: 'submission', entity_id: draftId, reason }); }
/** User-authorized server processing. Network calls run outside SQL transactions; current identity is resolved again before commit. */
export async function processHostedJob(resolve: () => Promise<Session>, settings: Settings, draftId?: string) {
    const initial = await resolve(), job = await initial.store.locked(async (c) => {
        const row = (await c.query("SELECT id,kind,submission_id,source_version::text,attempts FROM synapse_gateway.processing_jobs WHERE ($1::uuid IS NULL OR submission_id=$1) AND ((status='QUEUED' AND available_at<=now()) OR (status='RUNNING' AND lease_until<now())) AND synapse_gateway.ops_draft(submission_id,true) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1", [draftId ?? null])).rows[0];
        if (!row)
            return null;
        const token = randomUUID();
        await c.query("UPDATE synapse_gateway.processing_jobs SET status='RUNNING',attempts=attempts+1,lease_until=now()+interval '90 seconds',lease_token=$2,error_code=NULL WHERE id=$1", [row.id, token]);
        return { ...row, attempts: row.attempts + 1, lease_token: token } as Job;
    }, true);
    if (!job)
        return { processed: false };
    const current = async () => {
        const r = await resolve();
        if (r.principal.userId !== initial.principal.userId || r.principal.sessionId !== initial.principal.sessionId)
            throw new PlatformError(401, 'session_changed', 'Sign in again before processing.');
        return r;
    };
    try {
        const input = await initial.store.locked(async (c) => {
            await lease(c, job);
            const row = await source(c, job.submission_id);
            if (!row || row.row_version !== job.source_version || !['DRAFT', 'UNDER_REVIEW'].includes(row.submission_status))
                throw new IntegrationError('SOURCE_SUPERSEDED', false);
            return row;
        }, true);
        let result: Record<string, unknown>, finalized = false;
        const finish = async (c: PoolClient) => { await lease(c, job); await c.query("UPDATE synapse_gateway.processing_jobs SET status='COMPLETED',lease_until=NULL,lease_token=NULL,error_code=NULL,result=$3,completed_at=now() WHERE id=$1 AND lease_token=$2", [job.id, job.lease_token, JSON.stringify(result)]); };
        if (job.kind === 'TRANSLATE') {
            if (input.original_language_code === 'en')
                result = { translationRequired: false, sourceLanguage: 'en', providerExecuted: false };
            else {
                if (!settings.processingApproved || !settings.translation)
                    throw new IntegrationError('APPROVED_TRANSLATION_CONFIGURATION_REQUIRED', false);
                const translated = await settings.translation.translate(input.original_subject, input.original_body, input.original_language_code, 'en');
                result = { provider: translated.provider, version: translated.version, sourceLanguage: translated.language, translationRequired: translated.language !== 'en', humanReviewRequired: translated.language !== 'en' };
                const r = await current();
                await r.store.locked(async (c) => {
                    await lease(c, job);
                    const fresh = await source(c, input.submission_id);
                    if (!fresh || fresh.row_version !== input.row_version || !['DRAFT', 'UNDER_REVIEW'].includes(fresh.submission_status))
                        throw new IntegrationError('SOURCE_SUPERSEDED', false);
                    if (translated.language !== 'en') {
                        const version = (await c.query('SELECT coalesce(max(translation_version),0)+1 n FROM synapse.submission_translations WHERE submission_id=$1 AND source_language_code=$2 AND target_language_code=$3', [input.submission_id, translated.language, 'en'])).rows[0].n;
                        await insert(c, 'synapse.submission_translations', { translation_id: randomUUID(), submission_id: input.submission_id, source_language_code: translated.language, target_language_code: 'en', translated_subject: translated.subject, translated_body: translated.body, provider_name: translated.provider, provider_model_version: translated.version, translation_version: version, source_revision: input.row_version, review_state: 'NEEDS_REVIEW', provenance: JSON.stringify({ jobId: job.id, sourceVersion: input.row_version, originalFingerprint: digest(input.original_subject + '\n' + input.original_body), machineSubject: translated.subject, machineBody: translated.body, detector: translated.detector, targetLanguage: 'en', score: translated.score }) });
                    }
                    await advance(c, r.principal.userId, input.submission_id, 'TRANSLATE', 'Actual provider translation stored; original retained and human comparison required');
                    await finish(c);
                }, true);
                finalized = true;
            }
        }
        else {
            if (!input.institution_id)
                throw new IntegrationError('HUMAN_INSTITUTION_VERIFICATION_REQUIRED', false);
            const text = normalized(input.original_subject, input.original_body), excerpt = text.slice(0, 20000), fingerprint = digest(input.institution_id + '\n' + text);
            const candidates = await initial.store.locked(async (c) => {
                await lease(c, job);
                return (await c.query(`WITH choices AS (
    (SELECT case_id,title,summary,row_version,received_at,0 tier FROM synapse.cases WHERE institution_id=$1 AND to_tsvector('simple',coalesce(title,'')||' '||coalesce(summary,'')) @@ websearch_to_tsquery('simple',$2) ORDER BY ts_rank(to_tsvector('simple',coalesce(title,'')||' '||coalesce(summary,'')),websearch_to_tsquery('simple',$2)) DESC,received_at DESC LIMIT 24)
    UNION ALL (SELECT case_id,title,summary,row_version,received_at,1 tier FROM synapse.cases WHERE institution_id=$1 ORDER BY received_at DESC LIMIT 24)
   ) SELECT DISTINCT ON(case_id) case_id,title,coalesce(summary,'') summary,row_version::text,received_at,tier FROM choices ORDER BY case_id,tier LIMIT 24`, [input.institution_id, text.split(/\s+/).slice(0, 32).join(' OR ')])).rows as {
                    case_id: string;
                    title: string;
                    summary: string;
                    row_version: string;
                    received_at: string;
                }[];
            }, true);
            const categories = await initial.store.locked(async (c) => (await c.query('SELECT category_id,category_name FROM synapse.case_categories WHERE is_active ORDER BY category_id LIMIT 24')).rows as {
                category_id: string;
                category_name: string;
            }[]);
            const exact = candidates.filter(c => digest(input.institution_id + '\n' + normalized(c.title, c.summary)) === fingerprint), others = candidates.filter(c => !exact.some(e => e.case_id === c.case_id));
            if ((others.length || categories.length) && (!settings.processingApproved || !settings.semantic))
                throw new IntegrationError('APPROVED_GEMINI_CONFIGURATION_REQUIRED', false);
            const embeddings = others.length ? await settings.semantic!.embed([excerpt, ...others.map(c => normalized(c.title, c.summary).slice(0, 20000))]) : null;
            const categoryVectors = categories.length ? await settings.semantic!.embed([excerpt, ...categories.map(c => c.category_name)]) : null;
            result = { provider: embeddings || categoryVectors ? 'Google Gemini' : null, version: settings.semantic?.version ?? 'exact-normalized-source/1', shortlistCount: candidates.length, exactCount: exact.length, semanticExecuted: Boolean(embeddings), categorySuggestionsExecuted: Boolean(categoryVectors), humanReviewRequired: true };
            const r = await current();
            await r.store.locked(async (c) => {
                await lease(c, job);
                const fresh = await source(c, input.submission_id);
                if (!fresh || fresh.row_version !== input.row_version || !['DRAFT', 'UNDER_REVIEW'].includes(fresh.submission_status))
                    throw new IntegrationError('SOURCE_SUPERSEDED', false);
                const run = randomUUID();
                await insert(c, 'synapse.match_runs', { match_run_id: run, submission_id: input.submission_id, algorithm_code: settings.semantic?.version ?? 'exact-normalized-source/1', run_stage: embeddings ? 'EMBEDDING' : 'EXACT', run_status: 'SUCCEEDED', parameters: JSON.stringify({ jobId: job.id, sourceVersion: input.row_version, sourceFingerprint: fingerprint, shortlistLimit: 24, shortlist: 'indexed lexical and institution/recency under current RLS', inputLimit: 'first 20000 normalized characters', thresholds: { duplicate: .90, related: .75 }, humanReviewRequired: true }), completed_at: new Date().toISOString() });
                for (const candidate of candidates) {
                    const visible = (await c.query('SELECT row_version::text FROM synapse.cases WHERE case_id=$1', [candidate.case_id])).rows[0];
                    if (!visible || visible.row_version !== candidate.row_version)
                        continue;
                    const identical = exact.some(e => e.case_id === candidate.case_id), index = others.findIndex(e => e.case_id === candidate.case_id), score = identical ? 1 : cosine(embeddings![0], embeddings![index + 1]), recommendation = score >= .90 ? 'LIKELY_DUPLICATE' : score >= .75 ? 'RELATED_CASE' : 'SEPARATE_CASE';
                    await insert(c, 'synapse.match_candidates', { match_candidate_id: randomUUID(), match_run_id: run, candidate_case_id: candidate.case_id, match_classification: recommendation, overall_score: score < 0 ? null : score, feature_scores: JSON.stringify({ cosine: score, method: identical ? 'EXACT_NORMALIZED_FINGERPRINT' : 'ACTUAL_EMBEDDING_COSINE', sourceFingerprint: fingerprint, candidateVersion: candidate.row_version }), explanation: identical ? 'Same institution and normalized original content fingerprint; human duplicate review required.' : `Actual embedding cosine ${score.toFixed(4)}; same verified institution; indexed shortlist; first 20000 normalized characters. Supporting terms: ${lexicalSupport(text, normalized(candidate.title, candidate.summary)).join(', ') || 'none'}. Thresholds 0.90/0.75 are review aids, not confidence or automatic decisions.`, review_status: 'PENDING' });
                }
                if (categoryVectors)
                    for (const suggestion of categories.map((category, i) => ({ ...category, similarity: cosine(categoryVectors[0], categoryVectors[i + 1]) })).sort((a, b) => b.similarity - a.similarity).slice(0, 3))
                        await c.query('INSERT INTO synapse_gateway.category_suggestions(submission_id,source_revision,category_id,similarity,model_version) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [input.submission_id, input.row_version, suggestion.category_id, suggestion.similarity, settings.semantic!.version]);
                await advance(c, r.principal.userId, input.submission_id, 'MATCH', 'Actual authorized-source matching results stored; no automatic association or merge');
                await finish(c);
            }, true);
            finalized = true;
        }
        if (!finalized) {
            const r = await current();
            await r.store.locked(finish, true);
        }
        return { processed: true, kind: job.kind, status: 'COMPLETED', result };
    }
    catch (error) {
        const code = error instanceof IntegrationError ? error.code : 'PROCESSING_AUTHORIZATION_OR_STORAGE_CHANGED', status = code === 'SOURCE_SUPERSEDED' ? 'SUPERSEDED' : /CONFIGURATION|VERIFICATION_REQUIRED/.test(code) ? 'BLOCKED' : 'FAILED';
        const r = await current();
        await r.store.locked(async (c) => { await lease(c, job); await c.query("UPDATE synapse_gateway.processing_jobs SET status=$3,lease_until=NULL,lease_token=NULL,error_code=$4,completed_at=now() WHERE id=$1 AND lease_token=$2", [job.id, job.lease_token, status, code]); }, true);
        return { processed: true, kind: job.kind, status, errorCode: code };
    }
}
