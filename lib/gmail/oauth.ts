import { z } from 'zod';
import { GmailError, verifyScopes, type gmailConfig } from './security';
export type OAuthTokens = {
    refreshToken: string;
    accessToken: string;
    expiresAt: number;
    scope: string;
};
async function responseJson(response: Response) { const text = await response.text(); if (text.length > 200000)
    throw new GmailError('GMAIL_RESPONSE_LIMIT', 503); try {
    return JSON.parse(text);
}
catch {
    throw new GmailError('GMAIL_INVALID_PROVIDER_RESPONSE', 503);
} }
export async function exchangeCode(config: ReturnType<typeof gmailConfig>, code: string, verifier: string, fetcher: typeof fetch = fetch): Promise<OAuthTokens> {
    const response = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, code, code_verifier: verifier, grant_type: 'authorization_code' }), redirect: 'error', signal: AbortSignal.timeout(20000) }), body = await responseJson(response);
    if (!response.ok)
        throw new GmailError('GMAIL_CODE_EXCHANGE_REJECTED', 400);
    const tokens = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1), expires_in: z.number().int().positive(), scope: z.string().min(1) }).safeParse(body);
    if (!tokens.success)
        throw new GmailError('GMAIL_OFFLINE_CONSENT_REQUIRED', 400);
    verifyScopes(tokens.data.scope);
    return { accessToken: tokens.data.access_token, refreshToken: tokens.data.refresh_token, expiresAt: Date.now() + tokens.data.expires_in * 1000, scope: tokens.data.scope };
}
export async function refreshTokens(config: ReturnType<typeof gmailConfig>, tokens: OAuthTokens, fetcher: typeof fetch = fetch): Promise<OAuthTokens> {
    verifyScopes(tokens.scope);
    if (tokens.expiresAt > Date.now() + 60000)
        return tokens;
    const response = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: tokens.refreshToken, grant_type: 'refresh_token' }), redirect: 'error', signal: AbortSignal.timeout(20000) }), body = await responseJson(response);
    if (!response.ok)
        throw new GmailError(response.status === 400 ? 'GMAIL_REAUTHORIZE_REQUIRED' : 'GMAIL_REFRESH_UNAVAILABLE', response.status === 400 ? 409 : 503);
    const result = z.object({ access_token: z.string().min(1), expires_in: z.number().int().positive(), refresh_token: z.string().optional(), scope: z.string().optional() }).safeParse(body);
    if (!result.success)
        throw new GmailError('GMAIL_INVALID_TOKEN_RESPONSE', 503);
    if (result.data.scope)
        verifyScopes(result.data.scope);
    return { accessToken: result.data.access_token, refreshToken: result.data.refresh_token ?? tokens.refreshToken, expiresAt: Date.now() + result.data.expires_in * 1000, scope: result.data.scope ?? tokens.scope };
}
export async function verifyMailbox(accessToken: string, approved: string, fetcher: typeof fetch = fetch) {
    const response = await fetcher('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: 'Bearer ' + accessToken }, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok)
        throw new GmailError('GMAIL_PROFILE_UNAVAILABLE', 503);
    const result = z.object({ emailAddress: z.email(), historyId: z.string().regex(/^\d+$/) }).safeParse(await responseJson(response));
    if (!result.success)
        throw new GmailError('GMAIL_PROFILE_INVALID', 503);
    if (result.data.emailAddress.toLowerCase() !== approved.toLowerCase())
        throw new GmailError('GMAIL_MAILBOX_MISMATCH', 403);
    return result.data;
}
