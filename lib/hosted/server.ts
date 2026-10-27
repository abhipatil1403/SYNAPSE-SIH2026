import 'server-only';
import type { NextRequest } from 'next/server';
import { authContext } from '../auth/server';
import { privateGatewayPool } from '../auth/gateway';
import { PlatformEngine } from '../platform/engine';
import { PlatformQueries, type PlatformRepository } from '../platform/repository';
import { envelopeSchema, principalSchema, PlatformError } from '../platform/contracts';
import { CanonicalStore } from './store';
export function hostedOperationalServer(request: NextRequest) {
    const context = authContext(request);
    const resolve = async () => { const identity = await context.account(); if (identity.account.status !== 'APPROVED' || !identity.profile)
        throw new PlatformError(403, 'approval_required', 'Current officer approval is required.'); const principal = principalSchema.parse({ authId: identity.claims.sub, userId: identity.profile.id, sessionId: identity.claims.session_id }); return { identity, principal, store: new CanonicalStore(privateGatewayPool(), principal, identity.claims) }; };
    const repository: PlatformRepository = { snapshot: async () => { const r = await resolve(); return new PlatformEngine(r.store).snapshot(r.principal); }, command: async (input) => { const parsed = envelopeSchema.parse(input), r = await resolve(); if (parsed.command.type === 'draft.create' && parsed.command.source !== 'MANUAL')
            throw new PlatformError(400, 'trusted_ingestion_required', 'External-source drafts require the approved server ingestion adapter.'); if(parsed.command.type==='evidence.review'&&parsed.command.status==='VERIFIED'){const evidenceId=parsed.command.evidenceId,cleared=await r.store.locked(async c=>(await c.query("SELECT 1 FROM synapse.evidence_items e JOIN synapse.document_versions v USING(document_version_id) WHERE e.evidence_item_id=$1 AND v.malware_scan_status='CLEAN' AND EXISTS(SELECT FROM synapse_gateway.scanner_results x WHERE x.document_version_id=v.document_version_id AND x.sha256=trim(v.sha256_hex) AND x.verdict='CLEAN')",[evidenceId])).rowCount);if(!cleared)throw new PlatformError(409,'scanner_clearance_required','Run the private scanner and obtain a clean verdict before evidence verification.');}if (parsed.command.type === 'evidence.attach')
            throw new PlatformError(400, 'protected_upload_required', 'Upload actual file bytes through the protected evidence endpoint.'); return new PlatformEngine({ transaction: work => r.store.write(parsed.command, work, parsed.idempotencyKey) }).execute(r.principal, parsed); } };
    return { repository, queries: new PlatformQueries(repository), resolve, context, respond: (body: unknown, status = 200) => { const response = context.respond(body, status); response.headers.set('X-Synapse-Data-Source', 'Supabase / canonical authorized records'); return response; } };
}
