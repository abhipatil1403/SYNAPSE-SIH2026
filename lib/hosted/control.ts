import 'server-only';
import { privateGatewayPool } from '../auth/gateway';
export async function hostedOperationsActive() {
    if (process.env.SYNAPSE_HOSTED_OPERATIONS_ENABLED !== 'true')
        return false;
    const c = await privateGatewayPool().connect();
    try {
        await c.query('BEGIN');
        await c.query('SET LOCAL ROLE synapse_operations_runtime');
        const row = (await c.query('SELECT enabled AND writes_enabled active FROM synapse_gateway.operations_control WHERE singleton')).rows[0];
        await c.query('COMMIT');
        return row?.active === true;
    }
    catch {
        await c.query('ROLLBACK');
        return false;
    }
    finally {
        c.release();
    }
}
