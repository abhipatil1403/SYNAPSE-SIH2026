import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireSameOrigin } from '../lib/live/request';
const request = (origin?: string, site?: string) => new Request('https://synapse.example.invalid/api/workspace/commands', { method: 'POST', headers: { ...(origin ? { Origin: origin } : {}), ...(site ? { 'Sec-Fetch-Site': site } : {}) } });
test('same-origin commands accept the canonical configured origin with an optional trailing slash', () => { for (const configured of ['https://synapse.example.invalid', 'https://synapse.example.invalid/'])
    assert.doesNotThrow(() => requireSameOrigin(request('https://synapse.example.invalid'), configured)); assert.doesNotThrow(() => requireSameOrigin(request('http://127.0.0.1:3017'), 'http://127.0.0.1:3017/')); });
test('origin normalization preserves missing-origin, cross-origin and cross-site denial', () => { for (const r of [request(), request('https://attacker.example.invalid'), request('https://synapse.example.invalid', 'cross-site'), request('https://synapse.example.invalid/path')])
    assert.throws(() => requireSameOrigin(r, 'https://synapse.example.invalid/'), { status: 403, code: 'invalid_origin' }); });
test('unsafe configured origins fail closed without accepting paths, credentials or insecure remote HTTP', () => { for (const configured of ['', 'https://synapse.example.invalid/path', 'https://synapse.example.invalid/?x=1', 'https://user:secret@synapse.example.invalid', 'http://synapse.example.invalid'])
    assert.throws(() => requireSameOrigin(request('https://synapse.example.invalid'), configured), { status: 503, code: 'origin_configuration_unavailable' }); });
