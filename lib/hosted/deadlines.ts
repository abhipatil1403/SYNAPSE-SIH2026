import 'server-only';
import { privateGatewayPool } from '../auth/gateway';
import { PlatformError } from '../platform/contracts';
export async function deliverDeadlineNotifications(claims: unknown = {}) {
    const c = await privateGatewayPool().connect();
    try {
        await c.query('BEGIN');
        await c.query('SET LOCAL ROLE synapse_web_gateway');
        const result = (await c.query('SELECT synapse_gateway.deadline_notifications($1) body', [JSON.stringify(claims)])).rows[0].body;
        await c.query('COMMIT');
        return result as {
            delivered: number;
            blocked?: string;
        };
    }
    catch (error) {
        await c.query('ROLLBACK');
        throw new PlatformError((error as {
            code?: string;
        }).code === '42501' ? 403 : 503, 'deadline_service_unavailable', 'The reviewed deadline notification service is unavailable.');
    }
    finally {
        c.release();
    }
}
