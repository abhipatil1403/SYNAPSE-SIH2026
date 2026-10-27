import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { releaseChecks } from './release-checks.mjs';
import { operatorContext, safeMain } from '../phase2/operator.mjs';
const reviewedCommit = 'c30898630e061a5874c103e9f63ce4b7efa0e744';
const releaseIndex = process.argv.indexOf('--tested-release-commit'), releaseCommit = releaseIndex < 0 ? reviewedCommit : process.argv[releaseIndex + 1];
assert.match(releaseCommit, /^[a-f0-9]{40}$/);
execFileSync('git', ['merge-base', '--is-ancestor', reviewedCommit, releaseCommit], { stdio: 'pipe' });
const sourceChanges = execFileSync('git', ['diff', '--name-only', reviewedCommit, releaseCommit, '--', 'app', 'components', 'lib', 'package.json', 'package-lock.json', 'services', 'supabase'], { encoding: 'utf8', stdio: 'pipe' }).trim().split('\n').filter(Boolean);
assert.ok(sourceChanges.every(p => ['lib/hosted/store.ts', 'components/account-profile.tsx', 'lib/live/request.ts'].includes(p)), 'Only the reviewed read-contention/diagnostics correction is included beyond the approved application base.');
// The explicit flag records the human owner's 2026-10-28 approval of this exact release.
// This operator-only utility never belongs in a Next web process or browser bundle.
safeMain(async () => {
    const apply = process.argv.includes('--owner-approved-development-release');
    const ci = await releaseChecks(releaseCommit);
    assert.equal(ci.head, releaseCommit);
    assert.equal(ci.localHead, releaseCommit);
    assert.equal(ci.runs.length, 2);
    assert.ok(ci.runs.every(r => r.status === 'completed' && r.conclusion === 'success'));
    assert.ok(ci.checks.some(c => c.name === 'GitGuardian Security Checks' && c.conclusion === 'success'));
    const review = JSON.parse(await readFile('docs/phase16/MIGRATION_REVIEW.json', 'utf8'));
    assert.equal(review.hostedApplied, true);
    const sessions = JSON.parse(await readFile('docs/phase16/HOSTED_SESSION_RESULTS.json', 'utf8'));
    assert.equal(sessions.allPassed, true);
    assert.equal(sessions.providerMocked, false);
    assert.ok(Date.now() - Date.parse(sessions.checkedAt) < 86400000);
    const approved = JSON.parse(await readFile('.local/phase2/approved-admin.json', 'utf8'));
    const { db, admin } = await operatorContext({ authAdmin: true });
    try {
        const owners = (await db.query("SELECT u.user_id,l.auth_user_id FROM synapse.users u JOIN synapse.auth_identity_links l ON l.internal_user_id=u.user_id AND l.revoked_at IS NULL WHERE lower(u.email)=lower($1) AND u.account_status='ACTIVE' AND EXISTS(SELECT FROM synapse.user_role_assignments a JOIN synapse.roles r USING(role_id) WHERE a.user_id=u.user_id AND a.scope_type='GLOBAL' AND r.role_code='SYSTEM_ADMIN' AND r.is_active AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now()))", [approved.email])).rows;
        assert.equal(owners.length, 1);
        const owner = owners[0], provider = await admin.getUserById(owner.auth_user_id);
        assert.ok(!provider.error && provider.data.user?.email_confirmed_at && provider.data.user.email.toLowerCase() === approved.email.toLowerCase());
        assert.ok(!provider.data.user.banned_until || Date.parse(provider.data.user.banned_until) < Date.now());
        await db.query('BEGIN');
        await db.query("SET LOCAL lock_timeout='5s'");
        await db.query("SELECT pg_advisory_xact_lock(hashtext('synapse-development-release'))");
        for (const m of review.migrations) {
            const row = (await db.query('SELECT statements FROM supabase_migrations.schema_migrations WHERE version=$1', [m.file.slice(0, 14)])).rows[0];
            assert.ok(row);
            const actual = row.statements.join('').replaceAll('\r\n', '\n').trim(), source = (await readFile('supabase/migrations/' + m.file, 'utf8')).replaceAll('\r\n', '\n').trim();
            assert.equal(actual, source);
            assert.equal(createHash('sha256').update(await readFile('supabase/migrations/' + m.file)).digest('hex'), m.sha256);
        }
        const before = (await db.query('SELECT enabled,writes_enabled,approved_by,approved_at,release_review FROM synapse_gateway.operations_control WHERE singleton FOR UPDATE')).rows[0];
        assert.equal(before.writes_enabled, false);
        if (before.enabled)
            assert.ok(before.release_review.includes(reviewedCommit) && before.approved_by === owner.user_id);
        const lease = (await db.query('SELECT read_enabled,read_until FROM synapse.phase1_access_config')).rows;
        assert.deepEqual(lease, [{ read_enabled: false, read_until: null }]);
        const sourceBefore = (await db.query("SELECT a.user_role_assignment_id,a.user_id,a.role_id,a.scope_type,a.bureau_id,a.valid_from,a.valid_until FROM synapse.user_role_assignments a ORDER BY a.user_role_assignment_id")).rows;
        const memberships = (await db.query('SELECT * FROM synapse.user_bureau_memberships ORDER BY membership_id')).rows;
        assert.equal((await db.query("SELECT has_function_privilege('authenticated','public.synapse_phase1_me()','EXECUTE') OR has_function_privilege('authenticated','public.synapse_phase1_cases(text,text,text,integer,integer,text)','EXECUTE') exposed")).rows[0].exposed, false);
        await mkdir('.local/phase16', { recursive: true });
        await writeFile('.local/phase16/pre-activation-' + Date.now() + '.json', JSON.stringify({ checkedAt: new Date().toISOString(), control: before, roleAssignments: sourceBefore, memberships, lease }, null, 2));
        const reason = 'Explicit human owner approval: Approve development activation after CI passes. Approved implementation base ' + reviewedCommit + '; CI-verified scoped read-contention corrective release ' + releaseCommit + '; PR #1; development core workflows and real hosted authorization tests only. Existing roles unchanged; public case RPCs remain closed; Gmail scheduling OFF; unscanned attachments quarantined. Operator-assisted approval record, not a browser approval action.';
        await db.query('UPDATE synapse_gateway.operations_control SET enabled=true,writes_enabled=true,approved_by=$1,approved_at=now(),release_review=$2 WHERE singleton', [owner.user_id, reason]);
        await db.query("INSERT INTO synapse.audit_events(audit_event_id,actor_user_id,event_type,entity_type,entity_id,reason) VALUES($1,NULL,'DEVELOPMENT_RELEASE_APPROVED','workflow',$2,$3)", [randomUUID(), randomUUID(), reason]);
        assert.deepEqual((await db.query('SELECT read_enabled,read_until FROM synapse.phase1_access_config')).rows, lease);
        assert.deepEqual((await db.query('SELECT a.user_role_assignment_id,a.user_id,a.role_id,a.scope_type,a.bureau_id,a.valid_from,a.valid_until FROM synapse.user_role_assignments a ORDER BY a.user_role_assignment_id')).rows, sourceBefore);
        assert.deepEqual((await db.query('SELECT * FROM synapse.user_bureau_memberships ORDER BY membership_id')).rows, memberships);
        await db.query(apply ? 'COMMIT' : 'ROLLBACK');
        const report = { checkedAt: new Date().toISOString(), reviewedCommit, testedReleaseCommit: releaseCommit, sourceCorrectionScope: sourceChanges, ownerApprovalSource: 'Human user response in this conversation: Approve development activation after CI passes', ciVerified: ci.runs.map(r => ({ id: r.id, conclusion: r.conclusion })), gitGuardianPassed: true, currentAdministratorAndConfirmedProviderMappingVerified: true, applied: apply, transactionalDryRun: !apply, databaseDevelopmentOperationsEnabled: apply || before.enabled, databaseDevelopmentWritesEnabled: apply || before.writes_enabled, roleAssignmentsUnchanged: true, bureauMembershipsUnchanged: true, legacyReadLeaseUnchanged: true, publicCaseRpcsClosed: true, managedSchemaModified: false, webServiceRoleIntroduced: false, scope: 'Owner-approved development core workflows only; Gmail scheduling off and private scanner acceptance pending. This is not global production Live Mode sign-off.' };
        await writeFile('docs/phase16/DEVELOPMENT_ACTIVATION.json', JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify(report));
    }
    catch (error) {
        await db.query('ROLLBACK');
        throw error;
    }
    finally {
        await db.end();
    }
});
