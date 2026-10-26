import { createHash } from "node:crypto";
import { z } from "zod";

export const attachmentSchema = z.object({ name: z.string().min(1).max(250), mediaType: z.string().max(150),
  size: z.number().int().nonnegative().max(10 * 1024 * 1024), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  // Queue payloads are private and never rendered as HTML or marked scan-safe.
  content: z.string().max(14 * 1024 * 1024), scan: z.literal("PENDING"),
}).strict();
export const messageSchema = z.object({ externalId: z.string().min(1).max(500), internetId: z.string().max(1000),
  sender: z.string().min(1).max(500), subject: z.string().max(2000), body: z.string().max(20000),
  originalMime: z.string().max(20 * 1024 * 1024), receivedAt: z.iso.datetime({ offset: true }),
  institutionId: z.uuid().nullable(), categoryId: z.uuid().nullable(), course: z.string().max(200), issue: z.string().max(200),
  attachments: z.array(attachmentSchema).max(20),
}).strict().superRefine((m, ctx) => {
  if (m.attachments.reduce((sum, a) => sum + a.size, 0) > 10 * 1024 * 1024)
    ctx.addIssue({ code: "custom", message: "Attachment total exceeds quarantine limit." });
  for (const a of m.attachments) {
    const bytes = Buffer.from(a.content, "base64");
    if (bytes.length !== a.size || digest(bytes) !== a.sha256) ctx.addIssue({ code: "custom", message: "Attachment integrity mismatch." });
  }
});
export type InboundMessage = z.infer<typeof messageSchema>;
export const NORMALIZER_VERSION = "synapse-normalizer/1";
export function digest(text: string | Buffer) { return createHash("sha256").update(text).digest("hex"); }
export function normalizeText(text: string, subject = false) {
  let clean = text.normalize("NFKC").replace(/\r\n?/g, "\n");
  if (subject) clean = clean.replace(/^(?:(?:re|fw|fwd)\s*:\s*)+/i, "");
  // Strip only an explicit signature delimiter. Original MIME/body remain durable.
  const signature = clean.search(/^-- \s*$/m);
  if (signature >= 0) clean = clean.slice(0, signature);
  clean = clean.replace(/^-{2,}\s*(?:forwarded|original) message\s*-{2,}$/gim, "")
    .replace(/^(?:from|sent|to|subject):[^\n]*$/gim, "");
  return clean.toLocaleLowerCase("en-IN").replace(/\s+/gu, " ").trim();
}
export function fingerprints(m: InboundMessage) {
  const content = { version: NORMALIZER_VERSION, institution: m.institutionId,
    subject: normalizeText(m.subject, true), body: normalizeText(m.body),
    attachments: m.attachments.map((a) => a.sha256).sort() };
  return { content: digest(JSON.stringify(content)), sender: digest(JSON.stringify({ ...content, sender: m.sender.trim().toLowerCase() })),
    normalized: `${content.subject}\n${content.body}` };
}
export function cosine(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length || a.some((n) => !Number.isFinite(n)) || b.some((n) => !Number.isFinite(n))) throw Error("INVALID_EMBEDDING");
  const normA = Math.hypot(...a), normB = Math.hypot(...b);
  if (!normA || !normB) throw Error("ZERO_EMBEDDING");
  return Math.max(-1, Math.min(1, a.reduce((sum, n, i) => sum + n / normA * (b[i] / normB), 0)));
}
export function lexicalSupport(a: string, b: string) {
  const tokens = (s: string) => new Set(s.match(/[\p{L}\p{N}]{3,}/gu) ?? []), left = tokens(a), right = tokens(b);
  return [...left].filter((word) => right.has(word)).slice(0, 12);
}
