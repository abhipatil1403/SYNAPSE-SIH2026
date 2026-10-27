import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { PlatformError, type State, type Command } from '../platform/contracts';
type Row = Record<string, unknown>;
function identifier(value: string) { if (!/^[a-z_][a-z0-9_]*$/.test(value))
    throw Error('STATIC_SQL_IDENTIFIER_REQUIRED'); return '"' + value + '"'; }
function table(value: string) { return value.split('.').map(identifier).join('.'); }
export async function insert(c: PoolClient, target: string, row: Row) { const fields = Object.keys(row), values = Object.values(row); await c.query(`INSERT INTO ${table(target)}(${fields.map(identifier).join(',')}) ${target === 'synapse.cases' ? 'OVERRIDING SYSTEM VALUE ' : ''}VALUES(${fields.map((_, i) => '$' + (i + 1)).join(',')})`, values); }
export async function update(c: PoolClient, target: string, key: string, id: unknown, row: Row) { const fields = Object.keys(row), values = Object.values(row); const r = await c.query(`UPDATE ${table(target)} SET ${fields.map((f, i) => identifier(f) + '=$' + (i + 1)).join(',')} WHERE ${identifier(key)}=$${fields.length + 1}`, [...values, id]); if (r.rowCount !== 1)
    throw new PlatformError(409, 'concurrent_record', 'The record or your current authorization changed. Reload before another action.'); }
const changed = <T>(before: T | undefined, after: T) => !before || JSON.stringify(before) !== JSON.stringify(after);
export async function persistCanonicalState(c: PoolClient, before: State, s: State, command: Command, actor: string) {
    const now = s.generatedAt, reason = 'reason' in command ? command.reason : 'Authorized workflow';
    for (const p of s.policies) {
        if (before.policies.some(v => v.id === p.id))
            continue;
        await insert(c, 'synapse.policy_sources', { policy_source_id: p.id, source_code: 'SYNAPSE-' + p.id, title: p.label, issuing_authority: 'Authorized SYNAPSE administrator', source_type: 'INTERNAL_POLICY' });
        await insert(c, 'synapse.policy_versions', { policy_version_id: p.id, policy_source_id: p.id, version_label: p.label, effective_from: p.from.slice(0, 10), effective_until: p.until?.slice(0, 10) ?? null, approved_by_user_id: actor, approved_at: now, status: 'APPROVED' });
        await insert(c, 'synapse.closure_checklists', { closure_checklist_id: p.id, checklist_code: 'SYNAPSE-' + p.id, checklist_name: p.label, is_active: true });
        await insert(c, 'synapse.closure_checklist_versions', { closure_checklist_version_id: p.id, closure_checklist_id: p.id, version_number: 1, policy_version_id: p.id, effective_from: p.from, effective_until: p.until, approved_by_user_id: actor, approved_at: now, status: 'APPROVED' });
        for (const [sort, code] of p.requirements.entries())
            await insert(c, 'synapse.closure_requirements', { closure_requirement_id: randomUUID(), closure_checklist_version_id: p.id, requirement_code: code, requirement_text: code, requirement_type: ['EVIDENCE', 'APPROVAL', 'DEPENDENCY'].includes(code) ? code : 'OTHER', is_mandatory: true, blocks_disposal: true, sort_order: sort });
    }
    for (const k of s.categories)
        if (!before.categories.some(v => v.id === k.id))
            await insert(c, 'synapse.case_categories', { category_id: k.id, category_code: 'SYNAPSE-' + k.id, category_name: k.name, is_active: true });
    for (const i of s.institutions) {
        const prior = before.institutions.find(v => v.id === i.id);
        if (!changed(prior, i))
            continue;
        const fields = { canonical_name: i.name, state_name: i.state ?? '', region_label: i.region ?? '', row_version: i.version ?? '1', updated_at: now };
        if (prior)
            await update(c, 'synapse.institutions', 'institution_id', i.id, fields);
        else {
            await insert(c, 'synapse.institutions', { institution_id: i.id, ...fields });
            if (i.permanentId)
                await insert(c, 'synapse.institution_identifiers', { institution_identifier_id: randomUUID(), institution_id: i.id, identifier_type: 'AICTE_PERMANENT_ID', identifier_value: i.permanentId, issuing_authority: 'AICTE', is_primary: true });
        }
    }
    for (const record of s.cases) {
        const prior = before.cases.find(v => v.id === record.id);
        if (!changed(prior, record))
            continue;
        if (!prior) {
            await insert(c, 'synapse.cases', { case_id: record.id, case_number: record.caseNumber, institution_id: record.institutionId, category_id: record.categoryId, current_status_code: record.status, lead_bureau_id: record.bureauId, accountable_officer_id: record.officerId, title: record.subject, summary: record.summary, priority_code: record.priority, received_at: record.receivedAt, created_by_user_id: actor, discoverable: record.discoverable ?? false });
        }
        else {
            const action = record.status === 'DISPOSED' ? 'DISPOSE' : record.bureauId !== prior.bureauId || record.officerId !== prior.officerId ? 'TRANSFER' : 'STATUS_TRANSITION';
            await c.query("SELECT set_config('synapse.workflow_action',$1,true)", [action]);
            await update(c, 'synapse.cases', 'case_id', record.id, { current_status_code: record.status, lead_bureau_id: record.bureauId, accountable_officer_id: record.officerId, title: record.subject, summary: record.summary, priority_code: record.priority, disposed_at: record.disposedAt, discoverable: record.discoverable ?? false });
            await c.query("SELECT set_config('synapse.workflow_action','',true)");
            if (prior.status !== record.status)
                await insert(c, 'synapse.case_status_history', { case_status_history_id: randomUUID(), case_id: record.id, from_status_code: prior.status, to_status_code: record.status, changed_by_user_id: actor, change_reason: reason, changed_at: now });
        }
    }
    for (const d of s.drafts) {
        const prior = before.drafts.find(v => v.id === d.id);
        if (!changed(prior, d))
            continue;
        const fields = { institution_id: d.institutionId, submission_status: d.state, human_verified: d.verified, reviewed_by_user_id: d.reviewerId, reviewed_at: ['DRAFT', 'UNDER_REVIEW'].includes(d.state) ? null : now, review_reason: reason, row_version: d.version, original_language_code: d.language, course_hint: d.course ?? null, issue_hint: d.issue ?? null, category_hint: d.categoryHint ?? null };
        if (prior)
            await update(c, 'synapse.case_submissions', 'submission_id', d.id, fields);
        else
            await insert(c, 'synapse.case_submissions', { submission_id: d.id, source_type: d.source, source_reference: d.sourceReference, submitted_by_user_id: actor, intake_bureau_id: d.bureauId, original_subject: d.subject, original_body: d.body, received_at: d.receivedAt, ...fields });
        if (d.linkedCaseId && d.linkedCaseId !== prior?.linkedCaseId)
            await insert(c, 'synapse.submission_case_links', { submission_id: d.id, case_id: d.linkedCaseId, link_type: d.state === 'ACCEPTED' ? 'CREATED' : 'EVIDENCE_FOR', confirmed_by_user_id: actor, confirmed_at: now });
        if (d.linkedCaseId && d.linkedCaseId !== prior?.linkedCaseId && d.source === 'EMAIL') {
            const files = (await c.query('SELECT name,media_type,sha256,bytes,scan FROM synapse_gateway.gmail_attachments WHERE submission_id=$1', [d.id])).rows;
            for (const file of files) {
                if (!['text/plain', 'application/pdf', 'image/png', 'image/jpeg'].includes(file.media_type))
                    continue;
                const document = randomUUID(), version = randomUUID();
                await insert(c, 'synapse.documents', { document_id: document, document_type: 'EVIDENCE', owner_case_id: d.linkedCaseId, uploaded_by_user_id: actor });
                await insert(c, 'synapse.document_versions', { document_version_id: version, document_id: document, version_number: 1, storage_key: 'private-postgres:' + version, original_filename: file.name, media_type: file.media_type, byte_size: file.bytes.length, sha256_hex: file.sha256, uploaded_by_user_id: actor, malware_scan_status: file.scan, uploaded_at: now });
                await insert(c, 'synapse.evidence_items', { evidence_item_id: randomUUID(), document_version_id: version, case_id: d.linkedCaseId, evidence_type: 'DOCUMENT', evidence_status: 'SUBMITTED', source_description: 'Original Gmail submission ' + d.id + '; human registration, no automatic verification', received_at: d.receivedAt });
                await insert(c, 'synapse_gateway.document_bytes', { version_id: version, case_id: d.linkedCaseId, bytes: file.bytes });
            }
        }
        if (!prior || prior.language !== d.language || prior.institutionId !== d.institutionId) {
            for (const kind of ['MATCH', ...(d.language !== 'en' ? ['TRANSLATE'] : [])])
                await c.query("INSERT INTO synapse_gateway.processing_jobs(submission_id,actor_id,kind,source_version) VALUES($1,$2,$3,$4) ON CONFLICT(submission_id,kind,source_version) DO NOTHING", [d.id, actor, kind, d.version]);
        }
    }
    for (const t of s.tasks) {
        const prior = before.tasks.find(v => v.id === t.id);
        if (!changed(prior, t))
            continue;
        const fields = { title: t.title, status_code: t.status, due_at: t.dueAt, completed_at: t.status === 'COMPLETED' ? now : null, updated_at: now };
        if (prior)
            await update(c, 'synapse.case_work_items', 'work_item_id', t.id, fields);
        else
            await insert(c, 'synapse.case_work_items', { work_item_id: t.id, case_id: t.caseId, bureau_id: t.bureauId, assigned_to_user_id: t.assigneeId, work_item_type: t.type, created_by_user_id: actor, ...fields });
    }
    for (const comment of s.comments)
        if (!before.comments.some(v => v.id === comment.id))
            await insert(c, 'synapse.case_comments', { case_comment_id: comment.id, case_id: comment.caseId, author_user_id: actor, comment_body: comment.body, visibility: 'CASE_AUTHORIZED', created_at: comment.at });
    for (const e of s.events) {
        const prior = before.events.find(v => v.id === e.id);
        if (!changed(prior, e))
            continue;
        const fields = { title: e.title, at: e.at, cancelled_at: e.cancelledAt ?? null, cancelled_by: e.cancelledBy ?? null };
        if (prior)
            await update(c, 'synapse_gateway.calendar_events', 'id', e.id, fields);
        else
            await insert(c, 'synapse_gateway.calendar_events', { id: e.id, case_id: e.caseId, kind: e.type, created_by: actor, ...fields });
    }
    for (const r of s.relationships) {
        const prior = before.relationships.find(v => v.id === r.id);
        if (!changed(prior, r))
            continue;
        const fields = { relationship_status: r.status, reviewed_by_user_id: r.reviewerId, rationale: r.reason, reviewed_at: r.status === 'PROPOSED' ? null : now };
        if (prior)
            await update(c, 'synapse.case_relationships', 'case_relationship_id', r.id, fields);
        else
            await insert(c, 'synapse.case_relationships', { case_relationship_id: r.id, source_case_id: r.sourceId, target_case_id: r.targetId, relationship_type: r.type, proposed_by_user_id: actor, ...fields });
    }
    for (const r of s.accessRequests) {
        const prior = before.accessRequests.find(v => v.id === r.id);
        if (!changed(prior, r))
            continue;
        const fields = { request_status: r.status, approver_user_id: r.reviewerId, decided_at: r.status === 'PENDING' ? null : now, decision_reason: r.status === 'PENDING' ? null : reason };
        if (prior)
            await update(c, 'synapse.case_access_requests', 'case_access_request_id', r.id, fields);
        else
            await insert(c, 'synapse.case_access_requests', { case_access_request_id: r.id, case_id: r.caseId, requester_user_id: r.requesterId, requested_scope: r.scope, reason: r.reason, expires_at: r.until, ...fields });
        if (prior && r.status !== 'PENDING')
            await insert(c, 'synapse.case_access_grant_approvals', { case_access_grant_approval_id: randomUUID(), case_access_request_id: r.id, case_id: r.caseId, approver_user_id: actor, approving_bureau_id: s.cases.find(v => v.id === r.caseId)!.bureauId, decision: r.status, decision_reason: reason, decided_at: now });
    }
    for (const g of s.grants) {
        const prior = before.grants.find(v => v.caseId === g.caseId && v.userId === g.userId && v.scope === g.scope && v.until === g.until);
        if (!changed(prior, g))
            continue;
        if (prior) {
            const result = await c.query('UPDATE synapse.case_access_grants SET revoked_at=$1,revoke_reason=$2 WHERE case_id=$3 AND user_id=$4 AND granted_scope=$5 AND revoked_at IS NULL', [now, reason, g.caseId, g.userId, g.scope]);
            if (!result.rowCount)
                throw new PlatformError(409, 'grant_changed', 'The grant changed.');
        }
        else
            await insert(c, 'synapse.case_access_grants', { case_access_grant_id: randomUUID(), case_id: g.caseId, user_id: g.userId, granted_scope: g.scope, granted_by_user_id: actor, source_request_id: s.accessRequests.find(r => r.caseId === g.caseId && r.requesterId === g.userId && r.scope === g.scope && r.status === 'APPROVED')?.id ?? null, valid_from: now, valid_until: g.until });
    }
    for (const t of s.transfers) {
        const prior = before.transfers.find(v => v.id === t.id);
        if (!changed(prior, t))
            continue;
        if (prior) {
            await update(c, 'synapse.case_transfers', 'case_transfer_id', t.id, { transfer_status: t.status, approved_by_user_id: actor, decided_at: now, completed_at: t.status === 'COMPLETED' ? now : null });
            await insert(c, 'synapse.case_transfer_approvals', { case_transfer_approval_id: randomUUID(), case_transfer_id: t.id, approval_side: 'TARGET', approver_user_id: actor, decision: t.status === 'COMPLETED' ? 'APPROVED' : 'REJECTED', decision_reason: reason, decided_at: now });
        }
        else {
            await insert(c, 'synapse.case_transfers', { case_transfer_id: t.id, case_id: t.caseId, from_bureau_id: t.fromBureauId, to_bureau_id: t.toBureauId, from_officer_id: before.cases.find(v => v.id === t.caseId)?.officerId ?? null, to_officer_id: t.officerId, requested_by_user_id: actor, transfer_status: 'REQUESTED', reason: t.reason, requested_case_version: t.expectedVersion });
            await insert(c, 'synapse.case_transfer_approvals', { case_transfer_approval_id: randomUUID(), case_transfer_id: t.id, approval_side: 'SOURCE', approver_user_id: actor, decision: 'APPROVED', decision_reason: t.reason, decided_at: now });
        }
    }
    for (const e of s.evaluations) {
        if (before.evaluations.some(v => v.id === e.id))
            continue;
        await insert(c, 'synapse.closure_evaluations', { closure_evaluation_id: e.id, case_id: e.caseId, closure_checklist_version_id: e.policyId, evaluation_status: e.passed ? 'PASS' : 'BLOCKED', evaluated_by_user_id: actor, evaluated_at: e.at, evaluation_summary: 'Authorized workflow checklist', is_final: false });
        await insert(c, 'synapse_gateway.evaluation_fingerprints', { evaluation_id: e.id, case_id: e.caseId, fingerprint: e.fingerprint, checks: JSON.stringify(e.checks) });
        const requirements = (await c.query('SELECT closure_requirement_id,requirement_code FROM synapse.closure_requirements WHERE closure_checklist_version_id=$1', [e.policyId])).rows;
        for (const check of e.checks) {
            const requirement = requirements.find(v => v.requirement_code === check.code);
            if (!requirement)
                throw Error('CHECKLIST_REQUIREMENT_MISSING');
            await insert(c, 'synapse.closure_evaluation_items', { closure_evaluation_id: e.id, closure_requirement_id: requirement.closure_requirement_id, result_code: check.pass ? 'SATISFIED' : 'UNSATISFIED', notes: 'Checked against current authorized records' });
        }
    }
    if (command.type === 'closure.dispose')
        await insert(c, 'synapse.closure_approvals', { closure_approval_id: randomUUID(), case_id: command.caseId, closure_evaluation_id: command.evaluationId, approver_user_id: actor, decision: 'APPROVED', decision_reason: command.reason, decided_at: now });
    for (const clock of s.sla) {
        const prior = before.sla.find(v => v.id === clock.id);
        if (!changed(prior, clock))
            continue;
        if (prior)
            await update(c, 'synapse.sla_instances', 'sla_instance_id', clock.id, { sla_status: clock.status === 'COMPLETED' ? 'MET' : clock.status, completed_at: ['MET', 'COMPLETED', 'CANCELLED'].includes(clock.status) ? now : null });
        else {
            const exists = (await c.query('SELECT sla_policy_version_id FROM synapse.sla_policy_versions WHERE sla_policy_version_id=$1', [clock.id])).rowCount;
            if (!exists) {
                const policy = s.policies.find(p => p.id === clock.policyVersionId)!;
                await insert(c, 'synapse.sla_policies', { sla_policy_id: clock.id, policy_code: 'SYNAPSE-' + clock.id, policy_name: policy.label, is_active: true });
                await insert(c, 'synapse.sla_policy_versions', { sla_policy_version_id: clock.id, sla_policy_id: clock.id, version_number: 1, policy_version_id: policy.id, start_event_code: 'AUTHORIZED_MANUAL_DEADLINE', duration_minutes: Math.max(1, Math.ceil((Date.parse(clock.dueAt) - Date.parse(now)) / 60000)), effective_from: policy.from, effective_until: policy.until, approved_by_user_id: actor, approved_at: now });
            }
            await insert(c, 'synapse.sla_instances', { sla_instance_id: clock.id, sla_policy_version_id: clock.id, case_id: clock.caseId, work_item_id: clock.taskId, cycle_number: Math.max(0, ...s.sla.filter(v => v.caseId === clock.caseId).map((_, i) => i)) + 1, started_at: now, original_due_at: clock.originalDueAt, current_due_at: clock.dueAt, sla_status: clock.status });
            await insert(c, 'synapse.sla_events', { sla_event_id: randomUUID(), sla_instance_id: clock.id, event_type: 'STARTED', actor_user_id: actor, reason, occurred_at: now, new_due_at: clock.dueAt, policy_version_id: clock.id });
        }
    }
    for (const action of s.actions ?? []) {
        if (before.actions?.some(v => v.id === action.id))
            continue;
        const record = s.cases.find(v => v.id === action.caseId)!;
        await insert(c, 'synapse.regulatory_actions', { regulatory_action_id: action.id, institution_id: record.institutionId, case_id: record.id, lead_bureau_id: record.bureauId, action_type: action.type, action_title: action.topic, action_status: 'PLANNED', planned_start_at: action.from, planned_end_at: action.until, created_by_user_id: actor });
    }
    for (const f of s.conflicts ?? []) {
        const prior = before.conflicts?.find(v => v.id === f.id);
        if (!changed(prior, f))
            continue;
        const fields = { finding_status: f.status, reviewed_by_user_id: f.reviewerId, reviewed_at: f.reviewerId ? now : null, review_reason: f.reason };
        if (prior)
            await update(c, 'synapse.conflict_findings', 'conflict_finding_id', f.id, fields);
        else {
            await insert(c, 'synapse.conflict_findings', { conflict_finding_id: f.id, institution_id: s.cases.find(v => v.id === f.caseIds[0])!.institutionId, severity_code: 'MEDIUM', explanation: f.explanation, triggering_facts: JSON.stringify({ caseIds: f.caseIds, actionIds: f.actionIds, ruleVersion: f.ruleVersion }), ...fields });
            for (const id of f.actionIds)
                await insert(c, 'synapse.conflict_finding_actions', { conflict_finding_id: f.id, regulatory_action_id: id, relation_to_finding: 'RECORDED_OVERLAP' });
        }
    }
    for (const f of s.findings) {
        const prior = before.findings.find(v => v.id === f.id);
        if (prior && changed(prior, f)) {
            if (f.kind !== 'CONTRADICTION')
                throw new PlatformError(409, 'finding_kind', 'Use the regulatory action review for this finding.');
            await update(c, 'synapse.contradiction_findings', 'contradiction_finding_id', f.id, { finding_status: f.status, reviewed_by_user_id: f.reviewerId, reviewed_at: now, review_reason: f.reviewReason });
        }
    }
    for (const t of s.translations ?? []) {
        const prior = before.translations?.find(v => v.id === t.id);
        if (prior && changed(prior, t))
            await update(c, 'synapse.submission_translations', 'translation_id', t.id, { translated_subject: t.subject, translated_body: t.body, reviewed_by_user_id: t.correctedBy, reviewed_at: now, provenance: JSON.stringify({ reviewReason: t.reason, machineSubject: t.machineSubject ?? prior.subject, machineBody: t.machineBody ?? prior.body, originalProvider: t.provider }) });
    }
    for (const m of s.matches) {
        const prior = before.matches.find(v => v.id === m.id);
        if (prior && changed(prior, m))
            await update(c, 'synapse.match_candidates', 'match_candidate_id', m.id, { match_classification: m.decision === 'DUPLICATE' ? 'LIKELY_DUPLICATE' : m.decision === 'RELATED' ? 'RELATED_CASE' : 'SEPARATE_CASE', review_status: 'CONFIRMED', reviewed_by_user_id: m.reviewerId, reviewed_at: now, review_reason: m.reason });
    }
    for (const e of s.evidence) {
        const prior = before.evidence.find(v => v.id === e.id);
        if (!changed(prior, e))
            continue;
        if (prior)
            await update(c, 'synapse.evidence_items', 'evidence_item_id', e.id, { evidence_status: e.status, verified_by_user_id: e.status === 'VERIFIED' ? actor : null, verified_at: e.status === 'VERIFIED' ? now : null });
        else {
            if (!before.evidence.some(v => v.documentId === e.documentId))
                await insert(c, 'synapse.documents', { document_id: e.documentId, document_type: 'EVIDENCE', owner_case_id: e.caseId, uploaded_by_user_id: actor });
            await insert(c, 'synapse.document_versions', { document_version_id: e.versionId, document_id: e.documentId, version_number: e.number, storage_key: 'private-postgres:' + e.versionId, original_filename: e.name, media_type: e.mediaType, byte_size: e.byteSize, sha256_hex: e.sha256, uploaded_by_user_id: actor, malware_scan_status: e.scan, uploaded_at: e.createdAt });
            await insert(c, 'synapse.evidence_items', { evidence_item_id: e.id, document_version_id: e.versionId, case_id: e.caseId, evidence_type: 'DOCUMENT', evidence_status: e.status, source_description: e.source, received_at: now });
        }
    }
    for (const n of s.notifications) {
        const prior = before.notifications.find(v => v.id === n.id);
        if (!changed(prior, n))
            continue;
        if (prior)
            await update(c, 'synapse.notifications', 'notification_id', n.id, { read_at: n.readAt });
        else
            await insert(c, 'synapse.notifications', { notification_id: n.id, recipient_user_id: n.userId, notification_type: 'CASE_UPDATED', subject: n.title, body: 'An authorized case record changed.', related_case_id: n.caseId, created_at: n.at, read_at: n.readAt });
    }
    for (const a of s.activity)
        if (!before.activity.some(v => v.id === a.id))
            await insert(c, 'synapse.audit_events', { audit_event_id: a.id, actor_user_id: actor, event_type: a.type, entity_type: a.caseId ? 'case' : 'workflow', entity_id: a.caseId ?? a.id, occurred_at: a.at, reason: a.reason });
    for (const [key, receipt] of Object.entries(s.receipts)) {
        if (before.receipts[key])
            continue;
        const [user, request] = key.split(':');
        if (user !== actor)
            throw Error('RECEIPT_ACTOR_MISMATCH');
        await insert(c, 'synapse_gateway.operation_receipts', { user_id: actor, request_id: request, input: receipt.input, result: JSON.stringify(receipt.result) });
    }
    if (s.revision !== before.revision)
        await update(c, 'synapse_gateway.operations_control', 'singleton', true, { revision: s.revision });
}
