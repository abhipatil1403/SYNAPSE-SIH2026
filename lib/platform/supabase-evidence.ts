import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PrivateEvidenceTransport } from "./evidence";
import { PlatformError } from "./contracts";

// These two metadata operations must be implemented by reviewed user-JWT RPCs.
// The storage client must be the same request-scoped publishable-key user client.
export interface EvidenceMetadataGateway {
  reserve(input: Parameters<PrivateEvidenceTransport["reserve"]>[0]): Promise<void>;
  authorizedObject(versionId: string): Promise<{ objectKey: string; scan: string } | null>;
}
export class SupabasePrivateEvidenceTransport implements PrivateEvidenceTransport {
  constructor(private client: SupabaseClient, private metadata: EvidenceMetadataGateway) {}
  reserve(input: Parameters<PrivateEvidenceTransport["reserve"]>[0]) { return this.metadata.reserve(input); }
  resolveAuthorizedObject(versionId: string) { return this.metadata.authorizedObject(versionId); }
  async signedUpload(objectKey: string) {
    const { data, error } = await this.client.storage.from("synapse-evidence-private").createSignedUploadUrl(objectKey, { upsert: false });
    if (error || !data) throw new PlatformError(503, "storage_unavailable", "A private upload could not be authorized.");
    // Provider upload signing lifetime is two hours; quarantine prevents read access.
    return { url: data.signedUrl, expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() };
  }
  async signedDownload(objectKey: string, seconds: number) {
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 60) throw new PlatformError(400, "invalid_download_expiry", "Download authorization may last at most sixty seconds.");
    const { data, error } = await this.client.storage.from("synapse-evidence-private").createSignedUrl(objectKey, seconds);
    if (error || !data) throw new PlatformError(404, "not_found", "Authorized evidence is unavailable.");
    return { url: data.signedUrl, expiresAt: new Date(Date.now() + seconds * 1000).toISOString() };
  }
}
