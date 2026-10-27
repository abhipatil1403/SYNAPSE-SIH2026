import http from 'node:http';
import net from 'node:net';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const LIMIT = 2097152;
function authorized(header, token) {
    if (typeof header !== 'string')
        return false;
    const supplied = Buffer.from(header), expected = Buffer.from('Bearer ' + token);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
function command(config, bytes) {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection({ host: config.clamHost, port: config.clamPort });
        let output = Buffer.alloc(0), settled = false;
        const stop = error => {
            if (settled)
                return;
            settled = true;
            clearTimeout(deadline);
            socket.destroy();
            error ? reject(Error('SCANNER_BACKEND_UNAVAILABLE')) : resolve(output.toString('utf8').replace(/\0/g, '').trim());
        };
        const deadline = setTimeout(() => stop(true), 12000);
        socket.setTimeout(12000, () => stop(true));
        socket.on('error', () => stop(true));
        socket.on('data', chunk => {
            output = Buffer.concat([output, chunk]);
            if (output.length > 4096)
                stop(true);
            else if (output.includes(0))
                stop(false);
        });
        socket.on('end', () => stop(true));
        socket.on('connect', () => {
            if (!bytes) {
                socket.write(Buffer.from('zVERSION\0'));
                return;
            }
            socket.write(Buffer.from('zINSTREAM\0'));
            for (let offset = 0; offset < bytes.length; offset += 65536) {
                const part = bytes.subarray(offset, offset + 65536), size = Buffer.alloc(4);
                size.writeUInt32BE(part.length);
                socket.write(size);
                socket.write(part);
            }
            socket.write(Buffer.alloc(4));
        });
    });
}
export function createScannerServer(config) {
    if (!config.token || config.token.length < 32 || !config.clamHost || !Number.isInteger(config.clamPort) || config.clamPort < 1 || config.clamPort > 65535)
        throw Error('PRIVATE_SCANNER_CONFIGURATION_REQUIRED');
    const server = http.createServer(async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
        if (!authorized(req.headers.authorization, config.token)) {
            send(401, { error: 'UNAUTHORIZED' });
            req.resume();
            return;
        }
        if (req.method === 'GET' && req.url === '/health') {
            try {
                const version = await command(config);
                if (!version.startsWith('ClamAV '))
                    throw Error();
                send(200, { engine: 'ClamAV', ready: true });
            }
            catch {
                send(503, { error: 'SCANNER_BACKEND_UNAVAILABLE' });
            }
            return;
        }
        if (req.method !== 'POST' || req.url !== '/scan') {
            send(404, { error: 'NOT_FOUND' });
            req.resume();
            return;
        }
        if (req.headers['content-type'] !== 'application/octet-stream') {
            send(415, { error: 'BINARY_BODY_REQUIRED' });
            req.resume();
            return;
        }
        if (Number(req.headers['content-length'] ?? 0) > LIMIT) {
            send(413, { error: 'UPLOAD_LIMIT' });
            req.resume();
            return;
        }
        const chunks = [];
        let size = 0;
        try {
            for await (const chunk of req) {
                size += chunk.length;
                if (size > LIMIT) {
                    send(413, { error: 'UPLOAD_LIMIT' });
                    return;
                }
                chunks.push(chunk);
            }
            if (!size) {
                send(400, { error: 'EMPTY_BODY' });
                return;
            }
            const bytes = Buffer.concat(chunks), reply = await command(config, bytes), version = await command(config);
            if (!version.startsWith('ClamAV ') || version.length > 160)
                throw Error();
            const verdict = reply === 'stream: OK' ? 'CLEAN' : /^stream: .+ FOUND$/.test(reply) ? 'INFECTED' : 'INDETERMINATE';
            send(200, { verdict, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, engine: 'ClamAV', version, scanId: randomUUID(), scannedAt: new Date().toISOString() });
        }
        catch {
            if (!res.headersSent)
                send(503, { error: 'SCANNER_BACKEND_UNAVAILABLE' });
        }
    });
    server.requestTimeout = 25000;
    server.headersTimeout = 10000;
    server.keepAliveTimeout = 5000;
    return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const server = createScannerServer({ token: process.env.SYNAPSE_SCANNER_TOKEN, clamHost: process.env.CLAMAV_HOST ?? 'clamav', clamPort: Number(process.env.CLAMAV_PORT ?? 3310) });
        server.listen(Number(process.env.PORT ?? 8080), process.env.BIND_HOST ?? '127.0.0.1', () => console.log('Private scanner adapter listening; no credentials or evidence are logged.'));
    }
    catch {
        console.error('Private scanner configuration is incomplete.');
        process.exitCode = 1;
    }
}
