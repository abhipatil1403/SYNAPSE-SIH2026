import 'server-only';
import type { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import { scannerConfiguration } from '../scanning/client';
/** Current deployment observations, not static claims that every service is operational. */
export async function operationalReadiness(pool: Pool, claims: unknown) {
    const checks: {
        id: string;
        status: string;
        source: string;
    }[] = [];
    const add = (id: string, pass: boolean, source: string) => checks.push({ id, status: pass ? 'PASS' : 'BLOCKED', source });
    const c = await pool.connect();
    let businessWritesEnabled = false;
    try {
        await c.query('BEGIN');
        await c.query('SET LOCAL ROLE synapse_operations_runtime');
        await c.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)]);
        const catalog = (await c.query("SELECT NOT has_function_privilege('authenticated','public.synapse_phase1_me()','EXECUTE') AND NOT has_function_privilege('authenticated','public.synapse_phase1_cases(text,text,text,integer,integer,text)','EXECUTE') direct_rpc_closed,NOT has_schema_privilege(session_user,'synapse','USAGE') private_login,to_regprocedure('synapse_gateway.ops_discovery()') IS NOT NULL discovery,to_regprocedure('synapse_gateway.deadline_notifications(jsonb)') IS NOT NULL deadlines,to_regclass('synapse_gateway.scanner_results') IS NOT NULL scanner,to_regclass('synapse_gateway.category_suggestions') IS NOT NULL processing")).rows[0];
        add('direct_case_rpc_closed', catalog.direct_rpc_closed, 'Current hosted function ACLs');
        add('restricted_database_login', catalog.private_login, 'Current source-schema privilege of the actual web login');
        const ownerAssumption = (await c.query("SELECT NOT pg_has_role(session_user,'synapse_case_reader','MEMBER') AND NOT pg_has_role(session_user,'synapse_account_manager','MEMBER') safe")).rows[0];
        add('no_owner_role_assumption', ownerAssumption.safe, 'Current web-login role memberships; no function/table-owner assumption');
        const routines = (await c.query("SELECT count(*)::int n,bool_and(p.prosecdef AND p.proconfig @> ARRAY['search_path=\"\"','row_security=on'] AND NOT r.rolsuper AND NOT r.rolcanlogin AND NOT r.rolbypassrls AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')) safe FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='synapse_gateway' AND p.proname IN('ops_discovery','ops_discoverable','ops_active_bureau','deadline_notifications')")).rows[0];
        add('private_helper_ownership_and_grants', routines.n === 4 && routines.safe, 'Current private helper ACLs, fixed search_path, row_security and non-bypass ownership');
        const roles = (await c.query("SELECT count(*)::int n,bool_and(NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit AND NOT rolcreaterole AND NOT rolcreatedb) safe FROM pg_roles WHERE rolname IN('synapse_operations_runtime','synapse_discovery_reader','synapse_gmail_manager','synapse_deadline_notifier')")).rows[0];
        add('private_non_bypass_roles', roles.n === 4 && roles.safe, 'Current hosted role attributes');
        add('hosted_workflow_migrations', catalog.discovery && catalog.deadlines && catalog.scanner && catalog.processing, 'Current database routines/tables, not a local migration filename');
        const gate = (await c.query('SELECT enabled,writes_enabled,enabled AND length(release_review)>10 reviewed FROM synapse_gateway.operations_control WHERE singleton')).rows[0];
        businessWritesEnabled = gate.enabled && gate.writes_enabled && process.env.SYNAPSE_HOSTED_OPERATIONS_ENABLED === 'true';
        add('independent_release_review', gate.reviewed, 'Enabled database gate constrained by an owner approval record; application roles cannot approve themselves');
        add('hosted_operations_active', businessWritesEnabled, 'Current server switch and actual database controls');
        await c.query('SET LOCAL ROLE synapse_web_gateway');
        if (process.env.SYNAPSE_GMAIL_APPROVED_ADDRESS) {
            const gmail = (await c.query('SELECT synapse_gateway.gmail($1,$2,$3) body', [JSON.stringify(claims), 'status', JSON.stringify({ address: process.env.SYNAPSE_GMAIL_APPROVED_ADDRESS })])).rows[0].body;
            add('dedicated_mailbox_authorized', gmail.status === 'AUTHORIZED', 'Current private mailbox connection state');
            add('real_email_ingested', Boolean(gmail.lastIngestedAt), 'Actual persisted first-ingestion timestamp');
        }
        else
            add('dedicated_mailbox_authorized', false, 'SYNAPSE_GMAIL_APPROVED_ADDRESS is missing');
        await c.query('COMMIT');
    }
    catch {
        await c.query('ROLLBACK');
        add('hosted_catalog_check', false, 'Current database setup could not be verified; no successful check is inferred');
    }
    finally {
        c.release();
    }
    add('https_application_origin', Boolean(process.env.SYNAPSE_APP_ORIGIN?.startsWith('https://')), 'Current server origin configuration');
    try {
        const evidence = JSON.parse(await readFile('docs/phase16/HOSTED_SESSION_RESULTS.json', 'utf8')), age = Date.now() - Date.parse(evidence.checkedAt);
        add('provider_current_session_security', age >= 0 && age < 7 * 86400000 && evidence.allPassed === true && evidence.providerMocked === false, 'Executed real hosted Auth login/refresh/logout/replay report; ' + evidence.checkedAt);
    }
    catch {
        add('provider_current_session_security', false, 'No current real hosted session evidence is installed');
    }
    for (const [file, id, predicate] of [
        ['HOSTED_WORKFLOW_RESULTS.json', 'hosted_positive_workflow_acceptance', (v: Record<string, unknown>) => v.realHosted === true && v.actualIssuedJwt === true && v.providerMocked === false && v.allPassed === true],
        ['SCANNER_E2E_RESULTS.json', 'actual_private_clamav_acceptance', (v: Record<string, unknown>) => v.actualClamAV === true && v.providerMocked === false && v.cleanDownloadVerified === true && v.infectedDownloadDenied === true && v.allPassed === true],
        ['ADVISOR_STATUS.json', 'provider_advisor_review', (v: Record<string, unknown>) => v.successfulFinalAdvisorRun === true && v.status === 'PASS']
    ] as const) {
        try {
            const evidence = JSON.parse(await readFile('docs/phase16/' + file, 'utf8')), age = Date.now() - Date.parse(evidence.checkedAt);
            add(id, age >= 0 && age < 7 * 86400000 && predicate(evidence), 'Recorded executed acceptance evidence: ' + file + '; ' + evidence.checkedAt);
        }
        catch {
            add(id, false, 'No current executed acceptance evidence: ' + file);
        }
    }
    add('gemini_server_configuration', Boolean(process.env.SYNAPSE_GEMINI_EMBEDDINGS_API_KEY) && process.env.SYNAPSE_DEV_EXTERNAL_PROCESSING_APPROVED === 'true', 'Server-only key and explicit development-data processing approval; individual jobs record actual provider results');
    add('translation_server_configuration', Boolean(process.env.SYNAPSE_GOOGLE_TRANSLATION_KEY) && process.env.SYNAPSE_DEV_EXTERNAL_PROCESSING_APPROVED === 'true', 'Server-only Google Cloud Translation key and data approval; configuration alone does not prove a completed job');
    try {
        scannerConfiguration();
        add('private_scanner_configuration', true, 'Approved authenticated HTTPS endpoint is configured; actual clean receipts still required per file');
    }
    catch {
        add('private_scanner_configuration', false, 'Private scanner endpoint/token/approval missing or invalid; files stay quarantined');
    }
    return { checkedAt: new Date().toISOString(), checks, safeToActivateLive: checks.length > 0 && checks.every(c => c.status === 'PASS'), businessWritesEnabled };
}
