import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const GMAIL_CALLBACK = '/api/integrations/gmail/oauth/callback';
export const GMAIL_COOKIE = '__Host-synapse-gmail-oauth';
export class GmailError extends Error {
    constructor(public code: string, public status = 400) { super(code); }
}
export function hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
export function matchesState(expected: string | undefined, actual: string | null) { if (!expected || !actual || !/^[A-Za-z0-9_-]{43}$/.test(expected) || !/^[A-Za-z0-9_-]{43}$/.test(actual))
    return false; return timingSafeEqual(Buffer.from(expected), Buffer.from(actual)); }
function key(value: string) { const bytes = Buffer.from(value, 'base64'); if (bytes.length !== 32 || bytes.toString('base64') !== value)
    throw new GmailError('GMAIL_TOKEN_KEY_REQUIRED', 503); return bytes; }
export function seal(value: unknown, secret: string, aad: string) { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(secret), iv); cipher.setAAD(Buffer.from(aad)); const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]); return JSON.stringify({ v: 1, iv: iv.toString('base64'), data: data.toString('base64'), tag: cipher.getAuthTag().toString('base64') }); }
export function open<T>(encrypted: string, secret: string, aad: string): T { try {
    const v = JSON.parse(encrypted);
    if (v.v !== 1)
        throw Error();
    const iv = Buffer.from(v.iv, 'base64'), tag = Buffer.from(v.tag, 'base64');
    if (iv.length !== 12 || tag.length !== 16)
        throw Error();
    const decipher = createDecipheriv('aes-256-gcm', key(secret), iv);
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(v.data, 'base64')), decipher.final()]).toString('utf8')) as T;
}
catch {
    throw new GmailError('GMAIL_CREDENTIAL_REAUTHORIZE', 503);
} }
export function gmailConfig(env: Record<string, string | undefined> = process.env) {
    const address = env.SYNAPSE_GMAIL_APPROVED_ADDRESS?.trim().toLowerCase(), origin = env.SYNAPSE_APP_ORIGIN;
    if (!address || !z.email().safeParse(address).success)
        throw new GmailError('GMAIL_APPROVED_ADDRESS_REQUIRED', 503);
    if (!origin)
        throw new GmailError('GMAIL_PRODUCTION_ORIGIN_REQUIRED', 503);
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.hostname === 'localhost' || url.hostname === '127.0.0.1')
        throw new GmailError('GMAIL_PRODUCTION_ORIGIN_REQUIRED', 503);
    const clientId = env.SYNAPSE_GMAIL_CLIENT_ID, clientSecret = env.SYNAPSE_GMAIL_CLIENT_SECRET, tokenKey = env.SYNAPSE_GMAIL_TOKEN_ENCRYPTION_KEY;
    if (!clientId || !clientSecret || !tokenKey)
        throw new GmailError('GMAIL_OAUTH_CONFIGURATION_REQUIRED', 503);
    key(tokenKey);
    return { address, origin: url.origin, redirectUri: url.origin + GMAIL_CALLBACK, clientId, clientSecret, tokenKey, enabled: env.SYNAPSE_GMAIL_ENABLED === 'true' };
}
export function authorizationUrl(config: ReturnType<typeof gmailConfig>, state: string, verifier: string) { const url = new URL('https://accounts.google.com/o/oauth2/v2/auth'); url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code', scope: GMAIL_SCOPE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', state, login_hint: config.address, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString(); return url.href; }
export function verifyScopes(scope: string) { const scopes = scope.split(/\s+/).filter(Boolean); if (!scopes.length || !scopes.includes(GMAIL_SCOPE) || scopes.some(v => v !== GMAIL_SCOPE))
    throw new GmailError('GMAIL_READONLY_SCOPE_REQUIRED', 403); }
export function cronAuthorized(header: string | null, secret: string | undefined) { if (!secret || secret.length < 32 || !header)
    return false; const expected = Buffer.from('Bearer ' + secret), value = Buffer.from(header); return expected.length === value.length && timingSafeEqual(expected, value); }
