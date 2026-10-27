import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { operatorContext, safeMain } from '../phase2/operator.mjs';
const files = ['20261027171357_phase14_canonical_operations.sql', '20261027174828_phase15_hosted_gmail_oauth.sql', '20261027185138_phase15_active_intake_bureau.sql'];
safeMain(async () => {
    const evidence = JSON.parse(await readFile('docs/phase14/local-database-results.json', 'utf8'));
    assert.ok(Date.now() - Date.parse(evidence.checkedAt) < 3600000);
    assert.ok(evidence.results.some(r => r.startsWith('GMAIL SQL:')) && evidence.results.some(r => r.startsWith('CANONICAL HOSTED ADAPTER:')));
    const migrations = [];
    for (const [index, file] of files.entries()) {
        const sql = await readFile('supabase/candidates/' + file, 'utf8');
        assert.equal(sql, await readFile('supabase/migrations/' + file, 'utf8'));
        const sha256 = createHash('sha256').update(sql).digest('hex');
        assert.equal(sha256, [evidence.operationsSha256,evidence.gmailSha256,evidence.gmailAuthoritySha256][index]);
        assert.ok(!/\b(?:TRUNCATE|DROP TABLE|DELETE FROM|ALTER TABLE auth\.|BYPASSRLS)\b/i.test(sql.replaceAll('NOBYPASSRLS', '')));
        migrations.push({ file, sql, sha256 });
    }
    const { db } = await operatorContext();
    async function counts() { const names = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='synapse' ORDER BY tablename")).rows; const result = {}; for (const { tablename } of names) {
        assert.match(tablename, /^[a-z_][a-z0-9_]*$/);
        result[tablename] = (await db.query('SELECT count(*)::text n FROM synapse.' + tablename)).rows[0].n;
    } return result; }
    const legacy = async () => (await db.query("SELECT p.proname,p.oid::regprocedure::text signature,md5(pg_get_functiondef(p.oid)) hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='synapse' ORDER BY p.oid")).rows;
    try {
        await db.query('BEGIN');
        await db.query("SET LOCAL lock_timeout='5s'");
        await db.query("SELECT pg_advisory_xact_lock(hashtext('synapse-reviewed-canonical-gmail'))");
        const beforeCounts = await counts(), beforeFunctions = await legacy(), beforeGate = (await db.query('SELECT read_enabled,read_until FROM synapse.phase1_access_config FOR UPDATE')).rows;
        assert.equal(beforeGate[0].read_enabled, false);
        assert.equal(beforeGate[0].read_until, null);
        await mkdir('.local/phase15', { recursive: true });
        await writeFile('.local/phase15/pre-migration-baseline-'+new Date().toISOString().replace(/[^0-9TZ]/g,'')+'.json', JSON.stringify({ checkedAt: new Date().toISOString(), counts: beforeCounts, functions: beforeFunctions, columns: (await db.query("SELECT table_schema,table_name,column_name,data_type,column_default,is_nullable FROM information_schema.columns WHERE table_schema IN('synapse','synapse_gateway') ORDER BY 1,2,ordinal_position")).rows, policies: (await db.query("SELECT * FROM pg_policies WHERE schemaname IN('synapse','synapse_gateway') ORDER BY schemaname,tablename,policyname")).rows }, null, 2));
        for (const migration of migrations) {
            const previous = (await db.query('SELECT statements FROM supabase_migrations.schema_migrations WHERE version=$1', [migration.file.slice(0, 14)])).rows[0];
            if (previous)
                assert.equal(previous.statements.join('').replaceAll('\r\n', '\n').trim(), migration.sql.replaceAll('\r\n', '\n').trim());
            else {
                await db.query(migration.sql);
                await db.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)', [migration.file.slice(0, 14), migration.file.slice(15, -4), [migration.sql.trim()]]);
            }
        }
        assert.deepEqual(await counts(), beforeCounts);
        assert.deepEqual(await legacy(), beforeFunctions);
        assert.deepEqual((await db.query('SELECT read_enabled,read_until FROM synapse.phase1_access_config')).rows, beforeGate);
        const control = (await db.query('SELECT enabled,writes_enabled FROM synapse_gateway.operations_control')).rows[0];
        assert.equal(control.enabled, false);
        assert.equal(control.writes_enabled, false);
        const roles = (await db.query("SELECT rolname,NOT rolsuper AND NOT rolcanlogin AND NOT rolbypassrls AND NOT rolinherit AND NOT rolcreaterole AND NOT rolcreatedb AND NOT EXISTS(SELECT FROM pg_class c WHERE c.relowner=r.oid AND c.relkind='r') safe FROM pg_roles r WHERE rolname IN('synapse_gmail_manager','synapse_operations_runtime') ORDER BY rolname")).rows;
        assert.equal(roles.length, 2);
        assert.ok(roles.every(r => r.safe));
        const fn = (await db.query("SELECT pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service,has_function_privilege('synapse_web_gateway',p.oid,'EXECUTE') gateway FROM pg_proc p WHERE p.oid='synapse_gateway.gmail(jsonb,text,jsonb)'::regprocedure")).rows[0];
        assert.equal(fn.owner, 'synapse_gmail_manager');
        assert.ok(fn.prosecdef && fn.proconfig.includes('search_path=""') && fn.proconfig.includes('row_security=on') && !fn.anon && !fn.authenticated && !fn.service && fn.gateway);
        assert.equal((await db.query("SELECT has_schema_privilege('synapse_web_login','synapse','USAGE') exposed,has_function_privilege('authenticated','public.synapse_phase1_me()','EXECUTE') public_rpc")).rows[0].exposed, false);
        assert.equal((await db.query("SELECT has_function_privilege('authenticated','public.synapse_phase1_me()','EXECUTE') allowed")).rows[0].allowed, false);
        const apply = process.argv.includes('--apply-reviewed');
        await db.query(apply ? 'COMMIT' : 'ROLLBACK');
        await mkdir('docs/phase15', { recursive: true });
        await writeFile('docs/phase15/MIGRATION_REVIEW.json', JSON.stringify({ checkedAt: new Date().toISOString(), migrations: migrations.map(({ file, sha256 }) => ({ file, sha256 })), hostedApplied: apply, transactionalDryRun: !apply, allOriginalTableCountsUnchanged: true, originalFunctionDefinitionsUnchanged: true, readLeaseUnchanged: true, operationsEnabled: false, businessWritesEnabled: false, oauthConnectionsCreated: 0, function: fn, roles, localEvidenceAt: evidence.checkedAt, scope: 'Reviewed additive schema and private-role privileges only; no account grants, managed Auth changes, complaint mutations, public RPC reopening or release activation.' }, null, 2) + '\n');
        console.log(apply ? 'PASS reviewed migrations applied; all existing business table counts/functions retained, Live Mode and complaint writes OFF.' : 'PASS hosted transactional migration dry run; rolled back every DDL change.');
    }
    catch (error) {
        await db.query('ROLLBACK');
        throw error;
    }
    finally {
        await db.end();
    }
});
