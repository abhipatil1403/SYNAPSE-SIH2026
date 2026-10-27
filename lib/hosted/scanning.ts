import 'server-only';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { randomUUID, createHash } from 'node:crypto';
import { hostedOperationalServer } from './server';
import { throttle } from '../auth/gateway';
import { insert } from './persistence';
import { PlatformError } from '../platform/contracts';
import { requireSameOrigin, smallJson } from '../live/request';
import { scanActualBytes, scannerConfiguration, ScannerError } from '../scanning/client';
const inputSchema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('DOCUMENT'), id: z.uuid(), caseId: z.uuid() }).strict(), z.object({ kind: z.literal('GMAIL_ATTACHMENT'), id: z.uuid(), draftId: z.uuid() }).strict()]);
export async function scanAuthorizedAttachment(request: NextRequest) {
    if (process.env.SYNAPSE_HOSTED_OPERATIONS_ENABLED !== 'true')
        throw new PlatformError(503, 'operations_release_required', 'The hosted operations release is not enabled.');
    const api = hostedOperationalServer(request);
    requireSameOrigin(request, api.context.config.appOrigin);
    const input = inputSchema.parse(await smallJson(request)), r = await api.resolve();
    await throttle(request, 'scanner', r.identity.user.email);
    const read = async (c: import('pg').PoolClient) => {
        const row = input.kind === 'DOCUMENT' ? (await c.query("SELECT b.version_id target_id,b.bytes,b.case_id,trim(v.sha256_hex) sha256 FROM synapse_gateway.document_bytes b JOIN synapse.document_versions v ON v.document_version_id=b.version_id JOIN synapse.evidence_items e ON e.document_version_id=b.version_id WHERE e.evidence_item_id=$1 AND b.case_id=$2 AND synapse_gateway.ops_scope(b.case_id,true,true)", [input.id, input.caseId])).rows[0] : (await c.query('SELECT id target_id,bytes,sha256 FROM synapse_gateway.gmail_attachments WHERE id=$1 AND submission_id=$2 AND synapse_gateway.ops_draft(submission_id,true)', [input.id, input.draftId])).rows[0];
        if (!row)
            throw new PlatformError(404, 'not_found', 'Attachment unavailable.');
        return row as {
            target_id: string;
            bytes: Buffer;
            sha256: string;
            case_id?: string;
        };
    };
    const original = await r.store.locked(read);
    if (createHash('sha256').update(original.bytes).digest('hex') !== original.sha256)
        throw new PlatformError(409, 'attachment_hash_mismatch', 'The stored attachment requires integrity review.');
    let result;
    try {
        result = await scanActualBytes(original.bytes, scannerConfiguration());
    }
    catch (error) {
        const code = error instanceof ScannerError ? error.code : 'SCANNER_UNAVAILABLE';
        await r.store.locked(async (c) => { await read(c); await insert(c, 'synapse.audit_events', { audit_event_id: randomUUID(), actor_user_id: r.principal.userId, event_type: 'SCANNER_NOT_CLEARED', entity_type: input.kind === 'DOCUMENT' ? 'case' : 'submission', entity_id: input.kind === 'DOCUMENT' ? input.caseId : input.draftId, reason: code + '; attachment remains quarantined' }); }, true);
        throw new PlatformError(503, code, 'The private scanner did not clear this file. Check SYNAPSE_SCANNER_URL, SYNAPSE_SCANNER_TOKEN and private-service approval. Download remains blocked.');
    }
    const current = await api.resolve();
    if (current.principal.userId !== r.principal.userId || current.principal.sessionId !== r.principal.sessionId)
        throw new PlatformError(401, 'session_changed', 'Sign in again.');
    await current.store.locked(async (c) => {
        const file = await read(c);
        if (file.sha256 !== result.sha256 || file.bytes.length !== result.bytes)
            throw new PlatformError(409, 'attachment_changed', 'Attachment changed; scan again.');
        await insert(c, 'synapse_gateway.scanner_results', { id: randomUUID(), provider_scan_id: result.scanId, document_version_id: input.kind === 'DOCUMENT' ? file.target_id : null, gmail_attachment_id: input.kind === 'GMAIL_ATTACHMENT' ? file.target_id : null, sha256: result.sha256, byte_size: result.bytes, verdict: result.verdict, engine: result.engine, engine_version: result.version, scanned_at: result.scannedAt, actor_id: current.principal.userId });
        const scan = result.verdict === 'INDETERMINATE' ? 'PENDING' : result.verdict;
        if (input.kind === 'DOCUMENT') {
            await c.query('UPDATE synapse.document_versions SET malware_scan_status=$2 WHERE document_version_id=$1', [file.target_id, scan]);
            if (scan !== 'CLEAN')
                await c.query("UPDATE synapse.evidence_items SET evidence_status='SUBMITTED',verified_by_user_id=NULL,verified_at=NULL WHERE document_version_id=$1 AND evidence_status='VERIFIED'", [file.target_id]);
            await c.query("SELECT set_config('synapse.workflow_action','STATUS_TRANSITION',true)");
            await c.query('UPDATE synapse.cases SET updated_at=now() WHERE case_id=$1', [input.caseId]);
        }
        else
            await c.query('UPDATE synapse_gateway.gmail_attachments SET scan=$2 WHERE id=$1', [file.target_id, scan]);
        await insert(c, 'synapse.audit_events', { audit_event_id: randomUUID(), actor_user_id: current.principal.userId, event_type: 'SCANNER_' + result.verdict, entity_type: input.kind === 'DOCUMENT' ? 'case' : 'submission', entity_id: input.kind === 'DOCUMENT' ? input.caseId : input.draftId, reason: 'Actual authenticated private ClamAV verdict; provider scan ' + result.scanId + '; bytes/hash verified' });
        await c.query('UPDATE synapse_gateway.operations_control SET revision=revision+1 WHERE singleton');
    }, true);
    return api.respond({ verdict: result.verdict, cleared: result.verdict === 'CLEAN', message: result.verdict === 'CLEAN' ? 'Actual file bytes cleared by the private ClamAV service.' : 'The file remains quarantined: ' + result.verdict + '.' });
}
