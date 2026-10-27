import { NextRequest } from 'next/server';
import { z } from 'zod';
import { hostedOperationalServer } from '@/lib/hosted/server';
import { platformFailure } from '@/lib/platform/server';
import { PlatformError } from '@/lib/platform/contracts';
import { requireSameOrigin, smallJson } from '@/lib/live/request';
import { deliverDeadlineNotifications } from '@/lib/hosted/deadlines';
import { insert } from '@/lib/hosted/persistence';
import { randomUUID } from 'node:crypto';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const bodySchema = z.discriminatedUnion('action', [z.object({ action: z.literal('save'), policyId: z.uuid(), minutes: z.number().int().min(1).max(525600), reason: z.string().trim().min(5).max(2000) }).strict(), z.object({ action: z.literal('run') }).strict()]);
function apiFor(request: NextRequest) {
    if (process.env.SYNAPSE_HOSTED_OPERATIONS_ENABLED !== 'true')
        throw new PlatformError(503, 'operations_release_required', 'The hosted operations release is not enabled.');
    return hostedOperationalServer(request);
}
export async function GET(request: NextRequest) {
    try {
        const api = apiFor(request), r = await api.resolve();
        return api.respond(await r.store.locked(async (c) => (await c.query('SELECT policy_version_id "policyId",minutes,reviewed_at "reviewedAt" FROM synapse_gateway.reminder_rules ORDER BY reviewed_at DESC')).rows));
    }
    catch (error) {
        return platformFailure(error);
    }
}
export async function POST(request: NextRequest) {
    try {
        const api = apiFor(request);
        requireSameOrigin(request, api.context.config.appOrigin);
        const r = await api.resolve();
        if (!r.identity.account.roles.includes('SYSTEM_ADMIN'))
            throw new PlatformError(403, 'configuration_authority_required', 'An active System Administrator must review reminder rules.');
        const body = bodySchema.parse(await smallJson(request));
        if (body.action === 'run')
            return api.respond(await deliverDeadlineNotifications(r.identity.claims));
        await r.store.locked(async (c) => {
            const current = (await c.query("SELECT 1 FROM synapse.policy_versions WHERE policy_version_id=$1 AND status='APPROVED' AND effective_from<=(now() AT TIME ZONE 'Asia/Kolkata')::date AND (effective_until IS NULL OR effective_until>=(now() AT TIME ZONE 'Asia/Kolkata')::date)", [body.policyId])).rowCount;
            if (!current)
                throw new PlatformError(409, 'policy_unavailable', 'Select a current approved policy.');
            await c.query('INSERT INTO synapse_gateway.reminder_rules(policy_version_id,minutes,reviewed_by,reason) VALUES($1,$2,$3,$4) ON CONFLICT(policy_version_id) DO UPDATE SET minutes=excluded.minutes,reviewed_by=excluded.reviewed_by,reason=excluded.reason,reviewed_at=now()', [body.policyId, body.minutes, r.principal.userId, body.reason]);
            await insert(c, 'synapse.audit_events', { audit_event_id: randomUUID(), actor_user_id: r.principal.userId, event_type: 'SLA_REMINDER_RULE_REVIEWED', entity_type: 'policy', entity_id: body.policyId, reason: body.reason });
        }, true);
        return api.respond({ saved: true });
    }
    catch (error) {
        return platformFailure(error);
    }
}
