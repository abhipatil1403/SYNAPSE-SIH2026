"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast, Spinner } from './feedback';
import { useOperational } from './operational-provider';
type Status = {
    configured: boolean;
    enabled: boolean;
    configurationCode?: string;
    approvedAddress?: string;
    redirectUri?: string;
    connection?: {
        status: string;
        lastSyncAt?: string;
        lastIngestedAt?: string;
        errorCode?: string;
        pending?: number;
        failed?: number;
        ingested?: number;
    };
    options?: {
        operationsReleased: boolean;
        bureaus: {
            id: string;
            name: string;
        }[];
        officers: {
            id: string;
            name: string;
            bureauId: string;
        }[];
    };
};
export function GmailConnection() {
    const { snapshot } = useOperational(), admin = snapshot?.me?.roles.includes('SYSTEM_ADMIN'), { notify } = useToast(), [data, setData] = useState<Status>(), [loading, setLoading] = useState(true), loadLock = useRef(false), [error, setError] = useState(''), [busy, setBusy] = useState(''), lock = useRef(false), [bureau, setBureau] = useState(''), [officer, setOfficer] = useState('');
    const load = useCallback(async () => { if (loadLock.current)
        return; loadLock.current = true; setLoading(true); try {
        const response = await fetch('/api/integrations/gmail/status', { cache: 'no-store' }), result = await response.json();
        if (!response.ok)
            throw Error(result.error?.message ?? 'Gmail status is unavailable.');
        setData(result);
        setError('');
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Gmail status is unavailable.');
    }
    finally {
        loadLock.current = false;
        setLoading(false);
    } }, []);
    useEffect(() => { if (!admin)
        return; queueMicrotask(() => void load()); const result = new URLSearchParams(location.search).get('gmail'); if (result) {
        notify(result === 'connected' ? 'Dedicated mailbox connected. Scheduled intake remains separately controlled.' : result === 'cancelled' ? 'Gmail authorization cancelled.' : 'Gmail authorization could not be completed. Check the selected mailbox, current administrator session and redirect configuration.', result === 'connected' ? 'success' : 'error');
        const url = new URL(location.href);
        url.searchParams.delete('gmail');
        history.replaceState(null, '', url);
    } }, [admin, load, notify]);
    async function action(name: string) { if (lock.current)
        return; lock.current = true; setBusy(name); let navigating = false; try {
        const response = await fetch('/api/integrations/gmail/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(name === 'oauth/start' ? { bureauId: bureau, reviewOwnerId: officer, label: 'INBOX' } : {}) }), result = await response.json();
        if (!response.ok)
            throw Error(result.error?.message ?? 'Gmail action failed.');
        if (result.authorizationUrl) {
            location.assign(result.authorizationUrl);
            navigating = true;
            return;
        }
        notify(name === 'disconnect' ? 'Mailbox disconnected. Historical intake records are retained.' : result.ingested ? `${result.ingested} actual email ingested as a draft for human review.` : result.failed ? 'Email processing failed. Review intake status.' : 'No new email was ingested. Send a test complaint to the approved mailbox and verify again.', result.failed ? 'error' : result.ingested ? 'success' : 'info');
        await load();
    }
    catch (e) {
        notify(e instanceof Error ? e.message : 'Gmail action failed.', 'error');
    }
    finally {
        if (!navigating) {
            lock.current = false;
            setBusy('');
        }
    } }
    if (!admin)
        return null;
    const connected = data?.connection?.status === 'AUTHORIZED';
    return <section className="card gmail-connection"><p className="eyebrow">EMAIL INTAKE</p><h2>Complaint mailbox</h2><p>Connect the dedicated Gmail account. Each email becomes an unregistered draft; an authorized officer must review it before registration.</p>{error && <p role="alert">{error}</p>}{!data && !error && <p><Spinner />Checking connection…</p>}{data && !data.configured && <p>Deployment configuration required: {data.configurationCode}. The deployment guide lists the server-only settings.</p>}{data?.configured && <><p><strong>{data.approvedAddress}</strong> · {data.connection?.status.replaceAll('_', ' ')}</p><p>Scheduled intake: {data.enabled ? 'Enabled' : 'Disabled'} · {data.connection?.ingested ?? 0} ingested · {data.connection?.pending ?? 0} queued · {data.connection?.failed ?? 0} failed</p>{data.connection?.lastSyncAt && <p>Last sync: {new Date(data.connection.lastSyncAt).toLocaleString()}</p>}{data.connection?.errorCode && <p role="alert">Last intake error: {data.connection.errorCode}</p>}<div className="platform-filters"><label>Intake Bureau<select value={bureau} onChange={e => { setBureau(e.target.value); setOfficer(''); }} disabled={!!busy}><option value="">Select a Bureau</option>{data.options?.bureaus.map(b => <option value={b.id} key={b.id}>{b.name}</option>)}</select></label><label>Reviewing Case Officer<select value={officer} onChange={e => setOfficer(e.target.value)} disabled={!!busy || !bureau}><option value="">Select an approved officer</option>{data.options?.officers.filter(o => o.bureauId === bureau).map(o => <option value={o.id} key={o.id}>{o.name}</option>)}</select></label></div><p className="muted">{data.options?.operationsReleased ? 'Hosted intake writes have release approval.' : 'Mailbox authorization is available. Email-to-complaint writes await the independent hosted release review.'}</p><div className="button-row"><button className="btn primary" disabled={!!busy || !bureau || !officer} onClick={() => void action('oauth/start')}>{busy === 'oauth/start' && <Spinner />}{connected ? 'Reconnect mailbox' : 'Authorize dedicated Gmail'}</button>{connected && <><button className="btn" disabled={!!busy || !data.options?.operationsReleased} onClick={() => void action('verify')}>{busy === 'verify' && <Spinner />}Verify one real email</button><button className="btn" disabled={!!busy || !data.enabled || !data.connection?.lastIngestedAt} onClick={() => void action('sync')}>{busy === 'sync' && <Spinner />}Sync now</button><button className="btn" disabled={!!busy} onClick={() => void action('disconnect')}>Disconnect</button></>}</div><p className="muted">The verification action reads the approved INBOX and persists one real email only after the hosted write release is approved. Binary attachments remain quarantined until scanned.</p></>}<button className="btn" disabled={!!busy || loading} onClick={() => void load()}>{loading && <Spinner />}{loading ? 'Checking connection…' : 'Refresh connection status'}</button></section>;
}
