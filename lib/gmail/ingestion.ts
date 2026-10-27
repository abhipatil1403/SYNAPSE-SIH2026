import { randomBytes } from 'node:crypto';
import { GmailReadOnly } from '../automation/google';
import { normalizeText } from '../automation/normalization';
import { IntegrationError } from '../automation/providers';
import { inspectAttachment } from '../workbench/attachments';
import { GmailError, gmailConfig, hash, open, seal } from './security';
import { refreshTokens, verifyMailbox, type OAuthTokens } from './oauth';
export type GmailDatabase = <T = Record<string, unknown>>(claims: unknown, operation: string, input?: unknown) => Promise<T>;
type Cursor = {
    mode?: 'list' | 'history';
    anchor?: string;
    page?: string;
};
type Lease = {
    blocked?: string;
    id: string;
    address: string;
    label: string;
    tokensCiphertext: string;
    cursor: Cursor;
    previouslyVerified: boolean;
};
function safeCode(error: unknown) { return error instanceof GmailError || error instanceof IntegrationError ? error.code : 'GMAIL_INGESTION_FAILED'; }
/** Bounded real API reads; every provider response is persisted through the private transaction gateway. */
export async function ingestGmail(config: ReturnType<typeof gmailConfig>, db: GmailDatabase, verification = false, fetcher: typeof fetch = fetch, retryFailed = false) {
    if (!verification && !config.enabled)
        throw new GmailError('GMAIL_NOT_ENABLED', 409);
    const leaseHash = hash(randomBytes(32).toString('base64url')), lease = await db<Lease>({}, 'worker.acquire', { address: config.address, leaseHash });
    if (lease.blocked)
        throw new GmailError(lease.blocked, 409);
    const input = { connectionId: lease.id, leaseHash }, aad = 'synapse:gmail:' + lease.id + ':' + config.address;
    const deadline = AbortSignal.timeout(45000), bounded: typeof fetch = (url, init) => fetcher(url, { ...init, signal: init?.signal ? AbortSignal.any([deadline, init.signal]) : deadline });
    let lastError: string | undefined, ingested = 0, duplicates = 0, failed = 0;
    try {
        if (!verification && !lease.previouslyVerified)
            throw new GmailError('GMAIL_VERIFY_REQUIRED', 409);
        const previous = open<OAuthTokens>(lease.tokensCiphertext, config.tokenKey, aad), tokens = await refreshTokens(config, previous, bounded);
        if (tokens !== previous)
            await db({}, 'worker.credentials', { ...input, tokensCiphertext: seal(tokens, config.tokenKey, aad) });
        if (retryFailed)
            await db({}, 'worker.retry', input);
        const profile = await verifyMailbox(tokens.accessToken, config.address, bounded), gmail = new GmailReadOnly({ approvedAddress: config.address, clientId: config.clientId, clientSecret: config.clientSecret, refreshToken: tokens.refreshToken, label: lease.label, enabled: true, accessToken: async () => tokens.accessToken }, bounded);
        let cursor = lease.cursor, ids: string[] = [];
        if (cursor.mode === 'history' && cursor.anchor) {
            try {
                const page = await gmail.history(cursor.anchor, cursor.page);
                ids = [...new Set((page.history ?? []).flatMap(h => (h.messagesAdded ?? []).map(m => m.message.id)))];
                cursor = page.nextPageToken ? { mode: 'history', anchor: cursor.anchor, page: page.nextPageToken } : { mode: 'history', anchor: page.historyId };
            }
            catch (error) {
                if (!(error instanceof IntegrationError) || error.code !== 'PROVIDER_HTTP_404' && error.code !== 'PROVIDER_HTTP_410')
                    throw error;
                cursor = { mode: 'list', anchor: profile.historyId };
            }
        }
        if (cursor.mode !== 'history') {
            const page = await gmail.list(cursor.page);
            ids = (page.messages ?? []).map(m => m.id);
            const anchor = cursor.anchor ?? profile.historyId;
            cursor = page.nextPageToken ? { mode: 'list', anchor, page: page.nextPageToken } : { mode: 'history', anchor };
        }
        // Durable queue insert and cursor advancement are one transaction: an interrupted run cannot lose mail.
        if (ids.length > 2500)
            throw new GmailError('GMAIL_HISTORY_BATCH_LIMIT', 422);
        for (let offset = 0; offset < Math.max(1, ids.length); offset += 50)
            await db({}, 'worker.enqueue', { ...input, messageIds: ids.slice(offset, offset + 50), cursor: offset + 50 >= ids.length ? cursor : lease.cursor });
        for (let n = 0; n < (verification ? 1 : 3) && !deadline.aborted; n++) {
            const next = await db<{
                id?: string;
                messageId?: string;
            }>({}, 'worker.next', input);
            if (!next.id || !next.messageId)
                break;
            try {
                const message = await gmail.message(next.messageId), raw = Buffer.from(message.originalMimeBase64, 'base64url');
                if (message.id !== next.messageId || raw.length > 8388608 || message.body.length > 200000 || message.subject.length > 4000 || message.attachments.length > 20)
                    throw new GmailError('GMAIL_MESSAGE_LIMIT', 422);
                const attachments = message.attachments.map(a => { if (!a.bytes.length || a.bytes.length > 2097152)
                    throw new GmailError('GMAIL_ATTACHMENT_LIMIT', 422); let checked; try {
                    checked = inspectAttachment(a.bytes, a.name);
                }
                catch {
                    checked = { name: a.name.replace(/[\\/\r\n\x00]/g, '_').slice(0, 250), mediaType: 'application/octet-stream', sha256: hashBytes(a.bytes), scan: 'PENDING' as const };
                } return { ...checked,scan:'PENDING' as const,bytes: a.bytes.toString('base64') }; });
                const fingerprint = hash(JSON.stringify({ version: 'synapse-gmail-normalizer/1', subject: normalizeText(message.subject, true), body: normalizeText(message.body), attachments: attachments.map(a => a.sha256).sort() }));
                const result = await db<{
                    duplicate?: boolean;
                    draftId?: string;
                }>({}, 'worker.ingest', { ...input, queueId: next.id, messageId: next.messageId, subject: message.subject, body: message.body, sender: message.sender, internetMessageId: message.internetMessageId, receivedAt: message.receivedAt, rawMime: raw.toString('base64'), fingerprint, attachments });
                if (result.duplicate)
                    duplicates++;
                if (result.draftId)
                    ingested++;
            }
            catch (error) {
                lastError = safeCode(error);
                failed++;
                await db({}, 'worker.fail', { ...input, queueId: next.id, code: lastError });
            }
        }
        return { ingested, duplicates, failed, verified: ingested > 0 || lease.previouslyVerified, scheduledEnabled: config.enabled };
    }
    catch (error) {
        lastError = safeCode(error);
        throw error;
    }
    finally {
        await db({}, 'worker.finish', { ...input, errorCode: lastError ?? null });
    }
}
import { createHash } from 'node:crypto';
function hashBytes(bytes: Buffer) { return createHash('sha256').update(bytes).digest('hex'); }
