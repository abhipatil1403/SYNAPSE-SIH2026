import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { hostedOperationalServer } from './server';
import { persistCanonicalState } from './persistence';
import { canDocuments, requireCase } from '../platform/authorization';
import { PlatformEngine } from '../platform/engine';
import { PlatformError, type State } from '../platform/contracts';
import { requireSameOrigin } from '../live/request';
import { inspectAttachment } from '../workbench/attachments';
async function boundedForm(request: NextRequest) { const reader = request.body?.getReader(); if (!reader)
    throw new PlatformError(400, 'file_required', 'Choose an evidence file.'); const chunks: Uint8Array[] = []; let size = 0; try {
    while (true) {
        const part = await reader.read();
        if (part.done)
            break;
        size += part.value.length;
        if (size > 2300000) {
            await reader.cancel();
            throw new PlatformError(413, 'file_limit', 'Hosted attachments support up to 2 MB.');
        }
        chunks.push(part.value);
    }
}
finally {
    reader.releaseLock();
} return new Response(Buffer.concat(chunks), { headers: { 'Content-Type': request.headers.get('content-type') ?? '' } }).formData(); }
export async function hostedAttachment(request: NextRequest, caseId: string, writing = false) {
    if (process.env.SYNAPSE_HOSTED_OPERATIONS_ENABLED !== 'true')
        throw new PlatformError(503, 'operations_release_required', 'The hosted operations release is not enabled.');
    const api = hostedOperationalServer(request), r = await api.resolve();
    z.uuid().parse(caseId);
    if (!writing) {
        const id = z.uuid().parse(request.nextUrl.searchParams.get('id'));
        const file = await r.store.locked(async (c) => { const state = await r.store.load(c), user = state.staff.find(u => u.id === r.principal.userId)!, record = requireCase(state, user, caseId, new Date().toISOString()); if (!canDocuments(state, user, record, new Date().toISOString()))
            throw new PlatformError(404, 'not_found', 'Document unavailable.'); const result = (await c.query('SELECT b.bytes,v.original_filename name,v.media_type,v.malware_scan_status scan FROM synapse_gateway.document_bytes b JOIN synapse.document_versions v ON v.document_version_id=b.version_id JOIN synapse.evidence_items e ON e.document_version_id=v.document_version_id WHERE b.case_id=$1 AND e.evidence_item_id=$2', [caseId, id])).rows[0]; if (!result || !(result.scan === 'CLEAN' || result.scan === 'NOT_REQUIRED' && result.media_type === 'text/plain'))
            throw new PlatformError(404, 'not_found', 'Document unavailable or quarantined.'); return result; });
        return api.context.apply(new NextResponse(new Uint8Array(file.bytes), { headers: { 'Content-Type': file.media_type, 'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(file.name), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } }));
    }
    requireSameOrigin(request, api.context.config.appOrigin);
    const form = await boundedForm(request), file = form.get('file');
    if (!(file instanceof File) || file.size > 2097152)
        throw new PlatformError(400, 'file_limit', 'Choose a supported attachment up to 2 MB.');
    const bytes = Buffer.from(await file.arrayBuffer()), inspection = inspectAttachment(bytes, file.name), versionId = randomUUID(), id = randomUUID();
    await r.store.locked(async (c) => { const before = await r.store.load(c), state = structuredClone(before), now = new Date().toISOString(), user = state.staff.find(u => u.id === r.principal.userId)!, record = requireCase(state, user, caseId, now, true); if (!canDocuments(state, user, record, now))
        throw new PlatformError(404, 'not_found', 'Document unavailable.'); const requested = form.get('documentId'), documentId = requested ? z.uuid().parse(requested) : randomUUID(), prior = state.evidence.filter(e => e.caseId === caseId && e.documentId === documentId); if (requested && !prior.length)
        throw new PlatformError(404, 'not_found', 'Document unavailable.'); const command = { type: 'evidence.attach' as const, caseId, expectedVersion: z.string().regex(/^[1-9][0-9]*$/).parse(form.get('expectedVersion')), evidence: { id, caseId, documentId, versionId, number: Math.max(0, ...prior.map(e => e.number)) + 1, ...inspection, byteSize: bytes.length, status: 'SUBMITTED' as const, source: inspection.scan === 'NOT_REQUIRED' ? 'Validated UTF-8 text; no binary scan verdict claimed' : 'Hosted binary quarantine; trusted scanner required', createdAt: now } }; await new PlatformEngine({ transaction: async <T>(work: (s: State) => Promise<T>) => work(state) }).execute(r.principal, { idempotencyKey: randomUUID(), command }); await persistCanonicalState(c, before, state, command, r.principal.userId); await c.query('INSERT INTO synapse_gateway.document_bytes(version_id,case_id,bytes) VALUES($1,$2,$3)', [versionId, caseId, bytes]); }, true);
    return api.respond({ saved: true, id, scan: inspection.scan, message: inspection.scan === 'PENDING' ? 'Evidence retained in quarantine; download and verification require a trusted scanner.' : 'Actual evidence bytes and metadata committed.' }, inspection.scan === 'PENDING' ? 202 : 201);
}
