import "server-only";
import { privateGatewayPool } from '../auth/gateway';
import { GmailError } from './security';
/** No Data API exposure or service-role client. Only the private gateway may call this function. */
export async function gmailDatabase<T = Record<string, unknown>>(claims: unknown, operation: string, input: unknown = {}): Promise<T> {
    const client = await privateGatewayPool().connect().catch(() => { throw new GmailError('GMAIL_DATABASE_UNAVAILABLE', 503); });
    let broken = false;
    try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE synapse_web_gateway');
        const result = await client.query('SELECT synapse_gateway.gmail($1,$2,$3) result', [JSON.stringify(claims), operation, JSON.stringify(input)]);
        await client.query('COMMIT');
        return result.rows[0].result as T;
    }
    catch (error) {
        await client.query('ROLLBACK').catch(() => { broken = true; });
        const code = (error as {
            code?: string;
        }).code;
        throw new GmailError(code === '42501' ? 'GMAIL_AUTHORITY_REQUIRED' : code === '28000' ? 'GMAIL_STATE_OR_LEASE_EXPIRED' : code === '40001' ? 'GMAIL_CONNECTION_CHANGED' : 'GMAIL_DATABASE_UNAVAILABLE', code === '42501' ? 403 : code === '28000' ? 401 : code === '40001' ? 409 : 503);
    }
    finally {
        client.release(broken);
    }
}
