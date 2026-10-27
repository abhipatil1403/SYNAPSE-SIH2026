"use client";
import { useEffect, useState } from 'react';
import { Spinner } from './feedback';
type Attachment = {
    id: string;
    name: string;
    mediaType: string;
    size: number;
    scan: string;
};
export function GmailDraftAttachments({ draftId }: {
    draftId: string;
}) { const [files, setFiles] = useState<Attachment[]>(), [error, setError] = useState(''); useEffect(() => { const abort = new AbortController(); fetch('/api/integrations/gmail/drafts/' + draftId + '/attachments', { cache: 'no-store', signal: abort.signal }).then(async (response) => { const body = await response.json(); if (!response.ok)
    throw Error(body.error?.message ?? 'Attachments unavailable.'); setFiles(body); }).catch(e => { if (!abort.signal.aborted)
    setError(e instanceof Error ? e.message : 'Attachments unavailable.'); }); return () => abort.abort(); }, [draftId]); return <div><h3>Original email attachments</h3>{error && <p role="alert">{error}</p>}{!files && !error && <p><Spinner />Loading authorized attachments…</p>}{files?.map(file => <p key={file.id}>{file.name} · {file.size} bytes · {file.scan} {file.scan === 'CLEAN' || file.scan === 'NOT_REQUIRED' && file.mediaType === 'text/plain' ? <a className="btn" href={'/api/integrations/gmail/drafts/' + draftId + '/attachments?id=' + file.id}>Download</a> : <span>Quarantined</span>}</p>)}{files?.length === 0 && <p>No attachments.</p>}</div>; }
