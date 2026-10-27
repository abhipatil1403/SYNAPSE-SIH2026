import { taskSchema, evidenceSchema, PlatformError } from "./contracts";
import type { DatabaseRow } from "./database-shapes";
export function mapTask(row: DatabaseRow<"case_work_items">) {
  const types = ["INVESTIGATION", "REVIEW", "FOLLOW_UP", "APPROVAL"];
  if (!types.includes(row.work_item_type)) throw new PlatformError(503, "unsupported_task_type", "The stored task type requires an approved display mapping.");
  return taskSchema.parse({ id: row.work_item_id, caseId: row.case_id, bureauId: row.bureau_id, assigneeId: row.assigned_to_user_id,
    type: row.work_item_type, title: row.title, status: row.status_code, dueAt: row.due_at, updatedAt: row.updated_at });
}
export function mapEvidence(document: DatabaseRow<"documents">, version: DatabaseRow<"document_versions">, evidence: DatabaseRow<"evidence_items">) {
  if (!document.owner_case_id || document.document_id !== version.document_id || version.document_version_id !== evidence.document_version_id || evidence.case_id !== document.owner_case_id)
    throw new PlatformError(503, "evidence_join_mismatch", "Evidence ownership/provenance could not be verified.");
  const size = BigInt(version.byte_size);
  if (size > BigInt(Number.MAX_SAFE_INTEGER)) throw new PlatformError(503, "precision_loss", "Evidence size exceeds the safe display range.");
  // No storage key, uploader identity, raw extraction or signing data leaves this projection.
  return evidenceSchema.parse({ id: evidence.evidence_item_id, caseId: document.owner_case_id, documentId: document.document_id,
    versionId: version.document_version_id, number: version.version_number, name: version.original_filename,
    mediaType: version.media_type, byteSize: Number(size), sha256: version.sha256_hex,
    scan: version.malware_scan_status, status: evidence.evidence_status, source: evidence.source_description ?? "Source reference not recorded", createdAt: version.uploaded_at });
}
