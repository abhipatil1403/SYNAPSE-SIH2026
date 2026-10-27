import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { randomBytes, createHash } from 'node:crypto';
import { createScannerServer } from './server.mjs';
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(resolve));
test('real HTTP adapter with explicit mock clamd transport requires service auth and forwards exact bytes', async () => {
    const expected = Buffer.from('Synthetic exact-byte stream fixture'), token = randomBytes(32).toString('hex');
    let actual;
    const daemon = net.createServer(socket => {
        let data = Buffer.alloc(0);
        socket.on('data', chunk => {
            data = Buffer.concat([data, chunk]);
            if (data.toString().startsWith('zVERSION\0')) {
                socket.end('ClamAV mock-daemon/1\0');
                return;
            }
            const prefix = Buffer.from('zINSTREAM\0');
            if (data.length < prefix.length + 4)
                return;
            assert.ok(data.subarray(0, prefix.length).equals(prefix));
            let offset = prefix.length;
            const parts = [];
            while (offset + 4 <= data.length) {
                const size = data.readUInt32BE(offset);
                offset += 4;
                if (size === 0) {
                    actual = Buffer.concat(parts);
                    socket.end('stream: OK\0');
                    return;
                }
                if (offset + size > data.length)
                    return;
                parts.push(data.subarray(offset, offset + size));
                offset += size;
            }
        });
    });
    const port = await listen(daemon), server = createScannerServer({ token, clamHost: '127.0.0.1', clamPort: port }), httpPort = await listen(server), url = 'http://127.0.0.1:' + httpPort;
    try {
        assert.equal((await fetch(url + '/scan', { method: 'POST', body: expected })).status, 401);
        assert.equal((await fetch(url + '/scan', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'text/plain' }, body: expected })).status, 415);
        assert.equal((await fetch(url + '/scan', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream' }, body: Buffer.alloc(2097153) })).status, 413);
        const response = await fetch(url + '/scan', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream' }, body: expected });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.deepEqual(actual, expected);
        assert.equal(body.verdict, 'CLEAN');
        assert.equal(body.sha256, createHash('sha256').update(expected).digest('hex'));
        assert.equal(body.bytes, expected.length);
        assert.equal(body.engine, 'ClamAV');
        assert.equal(body.version, 'ClamAV mock-daemon/1');
    }
    finally {
        server.closeAllConnections();
        await close(server);
        await close(daemon);
    }
});
test('mock clamd infection and malformed protocol cannot produce a clean receipt', async () => {
    for (const reply of ['stream: FixtureThreat FOUND\0', 'stream: indeterminate reply\0', 'malformed truncated reply']) {
        const daemon = net.createServer(socket => socket.once('data', data => socket.end(data.toString().startsWith('zVERSION') ? 'ClamAV mock-daemon/1\0' : reply))), port = await listen(daemon), token = randomBytes(32).toString('hex'), server = createScannerServer({ token, clamHost: '127.0.0.1', clamPort: port }), httpPort = await listen(server);
        try {
            const response = await fetch('http://127.0.0.1:' + httpPort + '/scan', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream' }, body: 'Synthetic fixture' });
            if (reply.endsWith('\0')) {
                assert.equal(response.status, 200);
                assert.notEqual((await response.json()).verdict, 'CLEAN');
            }
            else
                assert.equal(response.status, 503);
        }
        finally {
            server.closeAllConnections();
            await close(server);
            await close(daemon);
        }
    }
});
test('unreachable real TCP backend returns unavailable, never CLEAN', async () => {
    const unused = net.createServer(), port = await listen(unused);
    await close(unused);
    const token = randomBytes(32).toString('hex'), server = createScannerServer({ token, clamHost: '127.0.0.1', clamPort: port }), httpPort = await listen(server);
    try {
        const response = await fetch('http://127.0.0.1:' + httpPort + '/scan', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream' }, body: 'Synthetic fixture' });
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { error: 'SCANNER_BACKEND_UNAVAILABLE' });
    }
    finally {
        server.closeAllConnections();
        await close(server);
    }
});
