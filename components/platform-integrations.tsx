"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Spinner, useToast } from './feedback';
import { useOperational } from './operational-provider';
type Health = {
    environment?: string;
    jobs: {
        kind: string;
        status: string;
        count: number;
    }[];
    recent?: {
        id: string;
        draftId: string;
        kind: string;
        status: string;
        errorCode?: string;
    }[];
    gmail: string;
    semantic: string;
    translation: string;
    scanner?: string;
    externalProcessingApproved?: boolean;
};
export function PlatformIntegrations({ draftId }: {
    draftId?: string;
}) {
    const { source, load } = useOperational(), hosted = source.includes('canonical'), { notify } = useToast(), [status, setStatus] = useState<Health>(), [busy, setBusy] = useState(''), lock = useRef(false);
    const refresh = useCallback(async () => {
        const response = await fetch(hosted ? '/api/workspace/processing/status' : '/api/workbench/status', { cache: 'no-store' }), body = await response.json();
        if (!response.ok)
            throw Error(body.error?.message ?? 'Processing status unavailable.');
        setStatus(body);
    }, [hosted]);
    async function action(kind: 'status' | 'run' | 'retry') {
        if (lock.current)
            return;
        lock.current = true;
        setBusy(kind);
        try {
            if (kind === 'status') {
                await refresh();
                return;
            }
            const url = hosted ? '/api/workspace/processing/' + kind : '/api/workbench/jobs', response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(kind === 'run' && draftId ? { draftId } : {}) }), body = await response.json();
            if (!response.ok)
                throw Error(body.error?.message ?? 'Processing could not be completed.');
            notify(kind === 'retry' ? `${body.queued ?? 0} authorized jobs queued.` : !body.processed ? 'No current job is waiting.' : body.status === 'COMPLETED' ? `${body.kind} completed and recorded.` : body.status === 'SUPERSEDED' ? 'The source changed. The older job was superseded.' : `${body.kind}: ${body.errorCode ?? body.status}.`, body.status === 'FAILED' || body.status === 'BLOCKED' ? 'error' : body.status === 'COMPLETED' ? 'success' : 'info');
            await Promise.all([refresh(), load()]);
        }
        catch (error) {
            notify(error instanceof Error ? error.message : 'Processing unavailable.', 'error');
        }
        finally {
            lock.current = false;
            setBusy('');
        }
    }
    useEffect(() => { queueMicrotask(() => void refresh().catch(() => { })); }, [refresh]);
    return <section className="card"><h2>{draftId ? 'Source processing' : 'Processing and integration health'}</h2><p>{hosted ? 'Google Cloud Translation and Gemini matching run on the server against your currently authorized source. Results retain provider provenance and require human review.' : 'The configured development worker processes the isolated database; its results remain separate from hosted data.'}</p><div className="button-row"><button className="btn" disabled={!!busy} onClick={() => void action('status')}>{busy === 'status' && <Spinner />}Refresh processing status</button>{hosted && <button className="btn primary" disabled={!!busy} onClick={() => void action('run')}>{busy === 'run' && <Spinner />}{busy === 'run' ? 'Processing actual source…' : 'Process next authorized job'}</button>}<button className="btn" disabled={!!busy} onClick={() => void action('retry')}>{busy === 'retry' && <Spinner />}Retry failed processing</button></div>{status && <><p>Mailbox: {status.gmail}</p><p>Matching: {status.semantic}</p><p>Translation: {status.translation}</p>{status.scanner && <p>Attachments: {status.scanner}</p>}{status.jobs.map(row => <p key={row.kind + row.status}>{row.kind} · {row.status} · {row.count}</p>)}{!status.jobs.length && <p>No authorized processing jobs.</p>}{status.recent?.filter(j => !draftId || j.draftId === draftId).map(job => <p key={job.id}>{job.kind} · {job.status}{job.errorCode ? ' · ' + job.errorCode : ''}</p>)}</>}</section>;
}
