import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { scanActualBytes, scannerConfiguration } from '../lib/scanning/client';
const bytes = Buffer.from('Synthetic scanner contract bytes'), config = scannerConfiguration({ SYNAPSE_SCANNER_URL: 'https://private-scanner.example.invalid/scan', SYNAPSE_SCANNER_TOKEN: randomBytes(32).toString('hex'), SYNAPSE_SCANNER_PRIVATE_APPROVED: 'true' });
const receipt = (overrides: Record<string, unknown> = {}) => ({ verdict: 'CLEAN', sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, engine: 'ClamAV', version: 'ClamAV mock transport fixture', scanId: randomUUID(), scannedAt: new Date().toISOString(), ...overrides });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
test('private scanner requires approved authenticated HTTPS endpoint; never follows arbitrary redirects', () => {
    for (const url of ['http://localhost:8080/scan', 'https://user:secret@private.example.invalid/scan', 'https://private.example.invalid/scan?redirect=x', 'https://private.example.invalid/other'])
        assert.throws(() => scannerConfiguration({ SYNAPSE_SCANNER_URL: url, SYNAPSE_SCANNER_TOKEN: config.token, SYNAPSE_SCANNER_PRIVATE_APPROVED: 'true' }));
    assert.throws(() => scannerConfiguration({ SYNAPSE_SCANNER_URL: config.url, SYNAPSE_SCANNER_TOKEN: 'short', SYNAPSE_SCANNER_PRIVATE_APPROVED: 'true' }));
    assert.throws(() => scannerConfiguration({ SYNAPSE_SCANNER_URL: config.url, SYNAPSE_SCANNER_TOKEN: config.token }));
});
test('mock transport sends actual bytes and requires bound explicit real-service receipt', async () => { const result = await scanActualBytes(bytes, config, async (url, init) => { assert.equal(url, config.url); assert.equal(init?.redirect, 'error'); assert.deepEqual(Buffer.from(init?.body as Uint8Array), bytes); assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer ' + config.token); return json(receipt()); }); assert.equal(result.verdict, 'CLEAN'); });
test('mock transport: infected and indeterminate are never transformed into clean', async () => {
    for (const verdict of ['INFECTED', 'INDETERMINATE'])
        assert.equal((await scanActualBytes(bytes, config, async () => json(receipt({ verdict })))).verdict, verdict);
});
test('mock transport: malformed, wrong-hash, wrong-size, stale, HTTP and timeout results cannot clear', async () => {
    for (const value of [{ clean: true }, receipt({ sha256: '0'.repeat(64) }), receipt({ bytes: 999 }), receipt({ scannedAt: new Date(Date.now() - 600000).toISOString() }), receipt({ engine: 'Unknown scanner' })])
        await assert.rejects(scanActualBytes(bytes, config, async () => json(value)));
    await assert.rejects(scanActualBytes(bytes, config, async () => json({}, 503)), { code: 'SCANNER_SERVICE_REJECTED' });
    await assert.rejects(scanActualBytes(bytes, config, async () => { throw new DOMException('fixture', 'TimeoutError'); }), { code: 'SCANNER_UNAVAILABLE_OR_TIMEOUT' });
    await assert.rejects(scanActualBytes(Buffer.alloc(2097153), config), { code: 'SCANNER_UPLOAD_LIMIT' });
});
