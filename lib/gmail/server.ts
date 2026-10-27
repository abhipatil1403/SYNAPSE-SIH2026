import "server-only";
import { randomBytes, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authContext } from '../auth/server';
import { throttle } from '../auth/gateway';
import { requireSameOrigin, smallJson } from '../live/request';
import { Phase1Error } from '../live/service';
import { gmailDatabase } from './database';
import { authorizationUrl, GMAIL_COOKIE, GmailError, gmailConfig, hash, matchesState, open, seal } from './security';
import { exchangeCode, verifyMailbox } from './oauth';
import { runGmailSync } from './sync';
const startInput = z.object({ bureauId: z.uuid(), reviewOwnerId: z.uuid(), label: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/) }).strict();
export type GmailStatus = {
    id?: string;
    status: string;
    address?: string;
    bureauId?: string;
    reviewOwnerId?: string;
    label?: string;
    lastSyncAt?: string;
    lastIngestedAt?: string;
    errorCode?: string;
    pending?: number;
    failed?: number;
    ingested?: number;
};
const errorMessages: Record<string, string> = { GMAIL_APPROVED_ADDRESS_REQUIRED: 'Configure the approved complaint mailbox address on this deployment.', GMAIL_PRODUCTION_ORIGIN_REQUIRED: 'Configure the canonical HTTPS application origin.', GMAIL_OAUTH_CONFIGURATION_REQUIRED: 'Configure the Gmail OAuth client and token encryption key.', GMAIL_TOKEN_KEY_REQUIRED: 'Configure a valid 32-byte Gmail token encryption key.', GMAIL_DATABASE_UNAVAILABLE: 'Gmail database setup is unavailable. The deployment owner must apply the reviewed migrations.', GMAIL_AUTHORITY_REQUIRED: 'An active System Administrator is required.', GMAIL_NOT_ENABLED: 'Scheduled intake is disabled. Connect the dedicated mailbox and verify one real email first.', OPERATIONS_RELEASE_REQUIRED: 'Complaint writes await the independent database release review. OAuth connection is available separately.', GMAIL_VERIFY_REQUIRED: 'Verify one real email before enabling scheduled intake.', GMAIL_NOT_READY_OR_BUSY: 'The mailbox is not connected or another sync is running.' };
export function gmailFailure(error: unknown) { if (error instanceof z.ZodError)
    error = new GmailError('GMAIL_INPUT_INVALID', 400); const code = error instanceof GmailError || error instanceof Phase1Error ? error.code : 'GMAIL_UNAVAILABLE', status = error instanceof GmailError || error instanceof Phase1Error ? error.status : 503; return NextResponse.json({ error: { code, message: errorMessages[code] ?? 'The Gmail operation could not be completed. Reconnect or retry after reviewing integration status.' } }, { status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } }); }
async function administrator(context: ReturnType<typeof authContext>) { const identity = await context.account(); if (identity.account.status !== 'APPROVED' || !identity.account.roles.includes('SYSTEM_ADMIN'))
    throw new GmailError('GMAIL_AUTHORITY_REQUIRED', 403); return identity; }
export async function gmailStatus(request: NextRequest) { const context = authContext(request); try {
    const identity = await administrator(context);
    const options = await gmailDatabase(identity.claims, 'options');
    let config;
    try {
        config = gmailConfig();
    }
    catch (error) {
        return context.respond({ configured: false, enabled: false, configurationCode: error instanceof GmailError ? error.code : 'GMAIL_OAUTH_CONFIGURATION_REQUIRED', options });
    }
    const status = await gmailDatabase<GmailStatus>(identity.claims, 'status', { address: config.address });
    return context.respond({ configured: true, enabled: config.enabled, redirectUri: config.redirectUri, approvedAddress: config.address, options, connection: status });
}
catch (error) {
    return context.apply(gmailFailure(error));
} }
export async function gmailStart(request: NextRequest) { const context = authContext(request); try {
    const config = gmailConfig();
    requireSameOrigin(request, config.origin);
    const identity = await administrator(context);
    await throttle(request, 'gmail-oauth', identity.user.email);
    const input = startInput.parse(await smallJson(request));
    const old = await gmailDatabase<GmailStatus>(identity.claims, 'status', { address: config.address });
    const connectionId = old.id ?? randomUUID(), state = randomBytes(32).toString('base64url'), verifier = randomBytes(48).toString('base64url'), stateHash = hash(state);
    await gmailDatabase(identity.claims, 'begin', { ...input, connectionId, address: config.address, stateHash, verifierCiphertext: seal({ verifier }, config.tokenKey, 'synapse:gmail:state:' + stateHash), redirectUri: config.redirectUri });
    const response = context.respond({ authorizationUrl: authorizationUrl(config, state, verifier) });
    response.cookies.set(GMAIL_COOKIE, state, { path: '/', secure: true, httpOnly: true, sameSite: 'lax', maxAge: 600 });
    return response;
}
catch (error) {
    return context.apply(gmailFailure(error));
} }
export async function gmailCallback(request: NextRequest) {
    let context: ReturnType<typeof authContext> | undefined;
    let origin: string;
    try {
        origin = gmailConfig().origin;
    }
    catch (error) {
        return gmailFailure(error);
    }
    let result = 'failed';
    try {
        context = authContext(request);
        const config = gmailConfig(), params = request.nextUrl.searchParams, state = params.get('state');
        if (params.getAll('state').length !== 1 || !matchesState(request.cookies.get(GMAIL_COOKIE)?.value, state))
            throw new GmailError('GMAIL_STATE_INVALID', 400);
        const identity = await administrator(context), stateHash = hash(state!);
        const pending = await gmailDatabase<{
            connectionId: string;
            address: string;
            redirectUri: string;
            verifierCiphertext: string;
        }>(identity.claims, 'consume', { stateHash });
        if (params.has('error')) {
            result = 'cancelled';
        }
        else {
            const code = params.get('code');
            if (params.getAll('code').length !== 1 || !code || code.length > 4096 || pending.redirectUri !== config.redirectUri || pending.address !== config.address)
                throw new GmailError('GMAIL_CALLBACK_INVALID', 400);
            const { verifier } = open<{
                verifier: string;
            }>(pending.verifierCiphertext, config.tokenKey, 'synapse:gmail:state:' + stateHash), tokens = await exchangeCode(config, code, verifier);
            await verifyMailbox(tokens.accessToken, config.address);
            await gmailDatabase(identity.claims, 'complete', { stateHash, tokensCiphertext: seal(tokens, config.tokenKey, 'synapse:gmail:' + pending.connectionId + ':' + config.address) });
            result = 'connected';
        }
    }
    catch { /* Never return provider bodies, codes, OAuth state, or tokens in a redirect/log. */ }
    const response = NextResponse.redirect(origin + '/settings?gmail=' + result, 303);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.cookies.set(GMAIL_COOKIE, '', { path: '/', secure: true, httpOnly: true, sameSite: 'lax', maxAge: 0 });
    return context ? context.apply(response) : response;
}
export async function gmailAction(request: NextRequest, action: 'disconnect' | 'verify' | 'sync') {
    const context = authContext(request);
    try {
        const config = gmailConfig();
        requireSameOrigin(request, config.origin);
        const identity = await administrator(context);
        await throttle(request, 'gmail-' + action, identity.user.email);
        if (action === 'disconnect')
            return context.respond(await gmailDatabase(identity.claims, 'disconnect', { address: config.address }));
        return context.respond(await runGmailSync({ verification: action === 'verify', retryFailed: true }));
    }
    catch (error) {
        return context.apply(gmailFailure(error));
    }
}
