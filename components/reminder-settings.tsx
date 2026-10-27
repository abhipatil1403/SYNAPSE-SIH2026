"use client";
import { useState, useRef } from 'react';
import { useOperational } from './operational-provider';
import { ActionForm, Spinner, useToast } from './feedback';
export function ReminderSettings() {
    const { snapshot, load } = useOperational(), { notify } = useToast(), [busy, setBusy] = useState(false), lock = useRef(false);
    async function submit(body: unknown) {
        if (lock.current)
            return;
        lock.current = true;
        setBusy(true);
        try {
            const response = await fetch('/api/workspace/reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), result = await response.json();
            if (!response.ok)
                throw Error(result.error?.message ?? 'Reminder review failed.');
            notify(result.saved ? 'Reviewed reminder schedule saved.' : `${result.delivered ?? 0} actual notifications delivered.`, 'success');
            await load();
        }
        catch (error) {
            notify(error instanceof Error ? error.message : 'Reminder service unavailable.', 'error');
        }
        finally {
            lock.current = false;
            setBusy(false);
        }
    }
    return <div><ActionForm className="form-stack" onSubmit={event => { const d = new FormData(event.currentTarget); return submit({ action: 'save', policyId: String(d.get('policy')), minutes: Number(d.get('minutes')), reason: String(d.get('reason')) }); }}><h3>Reviewed deadline reminders</h3><label>Current policy<select name="policy" required>{snapshot?.policies.map(p => <option value={p.id} key={p.id}>{p.label}</option>)}</select></label><label>Minutes before the actual deadline<input name="minutes" type="number" min={1} max={525600} required/></label><label>Review reason<textarea name="reason" minLength={5} maxLength={2000} required/></label><button className="btn" disabled={busy}>Save actual reminder schedule</button></ActionForm><button className="btn" disabled={busy} onClick={() => void submit({ action: 'run' })}>{busy && <Spinner />}Deliver due notifications now</button><p>Only reviewed policies generate reminders. Overdue notices also reach current Bureau Heads. Delivery receipts prevent duplicate notifications.</p></div>;
}
