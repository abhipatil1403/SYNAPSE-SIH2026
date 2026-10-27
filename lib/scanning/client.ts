import { createHash } from 'node:crypto';
import { z } from 'zod';
export class ScannerError extends Error {
    constructor(public code: string) { super(code); }
}
export const scannerVerdict = z.object({ verdict: z.enum(['CLEAN', 'INFECTED', 'INDETERMINATE']), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().positive().max(2097152), engine: z.literal('ClamAV'), version: z.string().min(1).max(160), scanId: z.uuid(), scannedAt: z.iso.datetime({ offset: true }) }).strict();
export type ScannerVerdict = z.infer<typeof scannerVerdict>;
export function scannerConfiguration(env: Record<string, string | undefined> = process.env) {
    const endpoint = env.SYNAPSE_SCANNER_URL, token = env.SYNAPSE_SCANNER_TOKEN;
    if (!endpoint || !token || token.length < 32 || env.SYNAPSE_SCANNER_PRIVATE_APPROVED !== 'true')
        throw new ScannerError('PRIVATE_SCANNER_CONFIGURATION_REQUIRED');
    let url: URL;
    try {
        url = new URL(endpoint);
    }
    catch {
        throw new ScannerError('PRIVATE_SCANNER_HTTPS_REQUIRED');
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/scan' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
        throw new ScannerError('PRIVATE_SCANNER_HTTPS_REQUIRED');
    return { url: url.href, token };
}
/** Only actual authenticated service responses can clear bytes. No filename-only or MIME-only scan verdicts. */
export async function scanActualBytes(bytes: Buffer, config: ReturnType<typeof scannerConfiguration>, fetcher: typeof fetch = fetch): Promise<ScannerVerdict> {
    if (!bytes.length || bytes.length > 2097152)
        throw new ScannerError('SCANNER_UPLOAD_LIMIT');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    let response: Response;
    try {
        response = await fetcher(config.url, { method: 'POST', headers: { Authorization: 'Bearer ' + config.token, 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.length) }, body: new Uint8Array(bytes), redirect: 'error', signal: AbortSignal.timeout(20000) });
    }
    catch {
        throw new ScannerError('SCANNER_UNAVAILABLE_OR_TIMEOUT');
    }
    if (!response.ok)
        throw new ScannerError('SCANNER_SERVICE_REJECTED');
    const reader = response.body?.getReader();
    if (!reader)
        throw new ScannerError('SCANNER_INVALID_RESPONSE');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const part = await reader.read();
            if (part.done)
                break;
            size += part.value.length;
            if (size > 8192) {
                await reader.cancel();
                throw new ScannerError('SCANNER_INVALID_RESPONSE');
            }
            chunks.push(part.value);
        }
    }
    finally {
        reader.releaseLock();
    }
    let result: ScannerVerdict;
    try {
        result = scannerVerdict.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    }
    catch {
        throw new ScannerError('SCANNER_INVALID_RESPONSE');
    }
    const age = Date.now() - Date.parse(result.scannedAt);
    if (result.sha256 !== sha256 || result.bytes !== bytes.length || age > 300000 || age < -60000)
        throw new ScannerError('SCANNER_RESULT_BINDING_FAILED');
    return result;
}
