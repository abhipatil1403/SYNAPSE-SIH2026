import type { Pool, PoolClient } from 'pg';
import type { TransactionStore } from '../platform/engine';
import { PlatformError, type State, type Principal, type Command } from '../platform/contracts';
import { loadCanonicalState } from './projection';
import { persistCanonicalState } from './persistence';
/** Real canonical Supabase rows; no parallel JSON business database or demo identity. */
export class CanonicalStore implements TransactionStore {
    constructor(private pool: Pool, readonly principal: Principal, private claims: unknown, private command?: Command, private requestId?: string, private diagnostic?: (error: unknown) => void) { }
    async locked<T>(work: (c: PoolClient) => Promise<T>, writing = Boolean(this.command)) {
        const c = await this.pool.connect();
        let broken = false;
        try {
            await c.query('BEGIN');
            await c.query('SET LOCAL ROLE synapse_operations_runtime');
            await c.query('SET LOCAL jit=off');
            await c.query("SELECT set_config('request.jwt.claims',$1,true),set_config('synapse.user_id',$2,true)", [JSON.stringify(this.claims), this.principal.userId]);
            await c.query("SELECT pg_advisory_xact_lock(7319,26264)");
            const control = (await c.query('SELECT enabled,writes_enabled,revision::text FROM synapse_gateway.operations_control WHERE singleton')).rows[0];
            if (!control?.enabled || writing && !control.writes_enabled)
                throw new PlatformError(503, 'operations_release_required', 'The database deployment has not completed its authorized release checks.');
            const actor = (await c.query('SELECT synapse_gateway.ops_actor() actor')).rows[0].actor;
            if (actor !== this.principal.userId)
                throw new PlatformError(403, 'current_approval_required', 'Current account approval and active role membership are required.');
            const result = await work(c);
            await c.query('COMMIT');
            return result;
        }
        catch (error) {
            await c.query('ROLLBACK').catch(() => { broken = true; });
            if (error instanceof PlatformError)
                throw error;
            const code = (error as {
                code?: string;
            }).code;
            this.diagnostic?.(error);
            if (code === '28000')
                throw new PlatformError(401, 'session_required', 'Your session is no longer active. Sign in again.');
            if (code === '42501')
                throw new PlatformError(403, 'authorization_changed', 'Your current permissions do not allow this action.');
            if (['23505', '40001', '40P01'].includes(code ?? ''))
                throw new PlatformError(409, 'concurrent_change', 'This record changed or already exists. Reload before retrying.');
            if (['23514', '23503', '22023'].includes(code ?? ''))
                throw new PlatformError(400, 'invalid_record', 'The requested record does not satisfy the current data rules.');
            throw new PlatformError(503, 'operations_unavailable', 'The authorized database operation could not be completed.');
        }
        finally {
            c.release(broken);
        }
    }
    async load(c: PoolClient) { const revision = (await c.query('SELECT revision::text FROM synapse_gateway.operations_control WHERE singleton')).rows[0]?.revision; return loadCanonicalState(c, revision); }
    async transaction<T>(work: (state: State) => Promise<T>) { return this.locked(async (c) => { const before = await this.load(c), next = structuredClone(before); if (this.command?.type === 'draft.register' && !before.receipts[this.principal.userId + ':' + this.requestId])
        next.nextCaseNumber = (await c.query("SELECT nextval(pg_get_serial_sequence('synapse.cases','case_number'))::text n")).rows[0].n; const result = await work(next); if (JSON.stringify(next) !== JSON.stringify(before)) {
        if (!this.command)
            throw Error('READ_TRANSACTION_MUTATION');
        await persistCanonicalState(c, before, next, this.command, this.principal.userId);
    } return result; }); }
    async write<T>(command: Command, work: (state: State) => Promise<T>, requestId?: string) { return new CanonicalStore(this.pool, this.principal, this.claims, command, requestId, this.diagnostic).transaction(work); }
}
