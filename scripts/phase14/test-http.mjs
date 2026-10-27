import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const port = Number(process.env.SYNAPSE_HTTP_TEST_PORT ?? 3015), origin = 'https://synapse-sih-2026.vercel.app', secret = randomBytes(32).toString('hex');
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'https://synthetic-project.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_http_fixture', SYNAPSE_APP_ORIGIN: origin, SYNAPSE_GMAIL_APPROVED_ADDRESS: 'complaints@example.invalid', SYNAPSE_GMAIL_CLIENT_ID: 'synthetic-http-client', SYNAPSE_GMAIL_CLIENT_SECRET: 'synthetic-http-secret', SYNAPSE_GMAIL_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'), CRON_SECRET: secret, SYNAPSE_GMAIL_ENABLED: 'false', SYNAPSE_HOSTED_OPERATIONS_ENABLED: 'false', SYNAPSE_PHASE1_READ_ENABLED: 'false' };
for (const key of ['DATABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SYNAPSE_SLA_DATABASE_URL', 'SYNAPSE_GEMINI_API_KEY', 'SYNAPSE_GEMINI_EMBEDDINGS_API_KEY', 'SYNAPSE_GOOGLE_TRANSLATION_KEY', 'SYNAPSE_TRANSLATION_API_KEY', 'HF_TOKEN', 'HUGGING_FACE_HUB_TOKEN', 'SYNAPSE_TEST_DATABASE_URL'])
    delete env[key];
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env, stdio: 'ignore', windowsHide: true });
const base = 'http://127.0.0.1:' + port, checks = [];
try {
    let ready = false;
    for (let n = 0; n < 80; n++) {
        try {
            await fetch(base + '/api/cron/gmail', { signal: AbortSignal.timeout(1000) });
            ready = true;
            break;
        }
        catch {
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    }
    assert.ok(ready, 'Production HTTP test server did not become ready');
    const call = (path, init = {}) => fetch(base + path, { ...init, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    assert.equal((await call('/api/cron/gmail')).status, 401);
    checks.push('Real Next HTTP: cron rejects missing bearer');
    const disabled = await call('/api/cron/gmail', { headers: { Authorization: 'Bearer ' + secret } });
    assert.equal(disabled.status, 200);
    assert.deepEqual(await disabled.json(), { enabled: false, ingested: 0 });
    checks.push('Real Next HTTP: authenticated disabled cron returns without ingestion');
    const callback = await call('/api/integrations/gmail/oauth/callback?code=synthetic-code&state=invalid');
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.get('location'), origin + '/settings?gmail=failed');
    assert.ok(/HttpOnly/i.test(callback.headers.get('set-cookie') ?? ''));
    assert.ok(/Secure/i.test(callback.headers.get('set-cookie') ?? ''));
    assert.ok(!(callback.headers.get('location') ?? '').includes('synthetic-code'));
    checks.push('Real Next HTTP: invalid/missing cookie state rejected, secure cookie cleared, no OAuth code in redirect');
    assert.equal((await call('/api/integrations/gmail/oauth/start', { method: 'POST', headers: { Origin: 'https://attacker.example.invalid', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    checks.push('Real Next HTTP: cross-origin OAuth start denied');
    assert.equal((await call('/api/integrations/gmail/status')).status, 401);
    checks.push('Real Next HTTP: unauthenticated integration status denied');
    assert.equal((await call('/api/cron/deadlines')).status, 401);
    const deadlines = await call('/api/cron/deadlines', { headers: { Authorization: 'Bearer ' + secret } });
    assert.equal(deadlines.status, 200);
    assert.deepEqual(await deadlines.json(), { enabled: false, delivered: 0 });
    checks.push('Real Next HTTP: deadline cron requires its bearer and cannot write when operations are disabled');
    for (const [path, method] of [['/api/workspace/processing/status','GET'],['/api/workspace/processing/run','POST'],['/api/workspace/processing/retry','POST'],['/api/workspace/attachments/scan','POST'],['/api/workspace/reminders','GET']]) {
        const response=await call(path,{method,headers:{Origin:origin,'Content-Type':'application/json'},...(method==='POST'?{body:'{}'}:{})});
        assert.equal(response.status,503,path);
        const body=await response.json();assert.equal(body.error.code,'operations_release_required',path);
    }
    checks.push('Real Next HTTP: processing, scanner and reminder endpoints retain the disabled-release boundary; no fake success');
    const report = { checkedAt: new Date().toISOString(), server: 'Next production build / real HTTP', authConfiguration: 'synthetic project and publishable fixture; no session or provider JWT issued', googleConfiguration: 'synthetic; no Google consent or mailbox request performed', browserAutomation: false, checks };
    await mkdir('docs/phase16', { recursive: true });
    await writeFile('docs/phase16/HTTP_RESULTS.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
}
finally {
    server.kill();
}
