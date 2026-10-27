import { operatorContext, safeMain } from '../phase2/operator.mjs';
import { randomUUID } from 'node:crypto';
safeMain(async () => { const { db } = await operatorContext(); try {
    const before = (await db.query('SELECT enabled,writes_enabled,release_review FROM synapse_gateway.operations_control WHERE singleton')).rows[0];
    const pause = process.argv.includes('--pause-development-writes');
    if (!pause && !process.argv.includes('--disable-development-release')) {
        console.log(JSON.stringify({ checkedAt: new Date().toISOString(), developmentEnabled: before.enabled, writesEnabled: before.writes_enabled, changed: false }));
        return;
    }
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(7319,26264)');
    await db.query('UPDATE synapse_gateway.operations_control SET enabled=$1,writes_enabled=false WHERE singleton', [pause ? before.enabled : false]);
    await db.query("INSERT INTO synapse.audit_events(audit_event_id,actor_user_id,event_type,entity_type,entity_id,reason) VALUES($1,NULL,'DEVELOPMENT_RELEASE_DISABLED','workflow',$2,'Operator fail-safe rollback of development release; all data and approval history retained')", [randomUUID(), randomUUID()]);
    await db.query('COMMIT');
    console.log('PASS development writes disabled; data, role assignments and review history retained.');
}
catch (error) {
    await db.query('ROLLBACK');
    throw error;
}
finally {
    await db.end();
} });
