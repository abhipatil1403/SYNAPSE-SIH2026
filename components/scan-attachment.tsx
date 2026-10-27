"use client";
import { useRef, useState } from 'react';
import { Spinner, useToast } from './feedback';
import { useOperational } from './operational-provider';
export function ScanAttachment({ id, caseId, draftId, onScanned }: {
    id: string;
    caseId?: string;
    draftId?: string;
    onScanned?: () => void;
}) {
    const { source, load } = useOperational(), { notify } = useToast(), [busy, setBusy] = useState(false), lock = useRef(false);
    if (!source.includes('canonical'))
        return null;
    return <button className="btn" disabled={busy} onClick={async () => {
            if (lock.current)
                return;
            lock.current = true;
            setBusy(true);
            try {
                const response = await fetch('/api/workspace/attachments/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(caseId ? { kind: 'DOCUMENT', id, caseId } : { kind: 'GMAIL_ATTACHMENT', id, draftId }), signal: AbortSignal.timeout(45000) }), body = await response.json();
                if (!response.ok)
                    throw Error(body.error?.message ?? 'The file remains quarantined.');
                notify(body.message, body.cleared ? 'success' : 'error');
                onScanned?.();
                await load();
            }
            catch (error) {
                notify(error instanceof Error ? error.message : 'The private scanner could not clear the attachment.', 'error');
            }
            finally {
                lock.current = false;
                setBusy(false);
            }
        }}>{busy && <Spinner />}{busy ? 'Scanning actual bytes…' : 'Scan with private ClamAV'}</button>;
}
