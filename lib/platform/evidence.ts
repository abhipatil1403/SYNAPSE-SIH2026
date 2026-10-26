import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PlatformError, type Snapshot } from "./contracts";

export interface PrivateEvidenceTransport {
  reserve(input: { caseId: string; documentId: string; versionId: string; objectKey: string; name: string; mediaType: string; size: number; sha256: string }): Promise<void>;
  signedUpload(key: string): Promise<{ url: string; expiresAt: string }>;
  resolveAuthorizedObject(versionId: string): Promise<{ objectKey: string; scan: string } | null>;
  signedDownload(key: string, seconds: number): Promise<{ url: string; expiresAt: string }>;
}
export const uploadSchema = z.object({ caseId: z.uuid(), name: z.string().min(1).max(180).refine((n) => !/[\\/\x00-\x1f]/.test(n) && !n.includes("..")),
  mediaType: z.enum(["application/pdf", "text/plain", "image/png", "image/jpeg"]), size: z.number().int().min(1).max(10 * 1024 * 1024), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export class PrivateEvidenceService {
  constructor(private transport: PrivateEvidenceTransport, private writesApproved: boolean) {}
  async prepareUpload(input: unknown, authorizeDocuments: (caseId: string) => Promise<void>) {
    const data = uploadSchema.parse(input);
    if (!this.writesApproved) throw new PlatformError(503, "evidence_upload_locked", "Private storage policies, malware scanning and business writes require approval.");
    await authorizeDocuments(data.caseId);
    const documentId = randomUUID(), versionId = randomUUID();
    const objectKey = `cases/${data.caseId}/${documentId}/${versionId}`; // Never use client filenames as paths.
    await this.transport.reserve({ ...data, documentId, versionId, objectKey });
    const upload = await this.transport.signedUpload(objectKey);
    // Metadata stays quarantined until trusted worker verifies bytes/hash and CLEAN status.
    return { documentId, versionId, upload, state: "PENDING_VERIFICATION" as const };
  }
  async download(versionId: string, snapshot: Snapshot) {
    z.uuid().parse(versionId);
    const metadata = snapshot.evidence.find((e) => e.versionId === versionId);
    if (!metadata || metadata.scan !== "CLEAN") throw new PlatformError(404, "not_found", "Authorized clean evidence is unavailable.");
    const row = await this.transport.resolveAuthorizedObject(versionId);
    if (!row || row.scan !== "CLEAN" || !row.objectKey.startsWith(`cases/${metadata.caseId}/${metadata.documentId}/`))
      throw new PlatformError(404, "not_found", "Evidence unavailable.");
    return this.transport.signedDownload(row.objectKey, 60);
  }
}
