import { test } from "node:test";
import assert from "node:assert/strict";
import { fingerprints, messageSchema, digest, cosine } from "../lib/automation/normalization";
import { OllamaEmbeddings, AzureTranslation, IntegrationError, providerJson } from "../lib/automation/providers";
test("fingerprints preserve original messages, collapse repeats, and separate senders and issues", () => {
  const input = messageSchema.parse({ externalId: "local-1", internetId: "", sender: "a@example.invalid", subject: "Re: Fees", body: " Fees   withheld.\n-- \nSignature", originalMime: "", receivedAt: "2026-10-26T12:00:00Z", institutionId: null, categoryId: null, course: "", issue: "", attachments: [] });
  const original = JSON.stringify(input), first = fingerprints(input);
  assert.equal(first.content, fingerprints({ ...input, externalId: "local-2", subject: "FW: Fees", body: "Fees withheld." }).content);
  assert.equal(first.content, fingerprints({ ...input, sender: "b@example.invalid" }).content);
  assert.notEqual(first.sender, fingerprints({ ...input, sender: "b@example.invalid" }).sender);
  assert.notEqual(first.content, fingerprints({ ...input, body: "Laboratory safety issue" }).content);
  assert.equal(JSON.stringify(input), original);
  assert.equal(messageSchema.safeParse({ ...input, attachments: [{ name: "x.txt", mediaType: "text/plain", size: 3, content: "eA==", sha256: digest("x"), scan: "PENDING" }] }).success, false);
});
test("provider contract simulation validates model pin, vectors, retry hints and translation provenance", async () => {
  const pin = "a".repeat(64), calls: string[] = [];
  const fetcher: typeof fetch = async (url) => { calls.push(String(url)); return Response.json(String(url).endsWith("/api/tags") ? { models: [{ name: "test-model", digest: pin }] } : { model: "test-model", embeddings: [Array(8).fill(1), Array(8).fill(0.5)] }); };
  const provider = new OllamaEmbeddings({ url: "http://127.0.0.1:11434", model: "test-model", digest: pin }, fetcher);
  const vectors = await provider.embed(["Original Hindi", "Original Marathi"]); assert.equal(vectors.length, 2); assert.equal(calls.length, 2); assert.ok(cosine(vectors[0], vectors[1]) > 0.999);
  assert.throws(() => new OllamaEmbeddings({ url: "http://attacker.invalid", model: "x", digest: pin }));
  await assert.rejects(providerJson("https://example.invalid", {}, async () => new Response("private-detail", { status: 429, headers: { "Retry-After": "17" } })), (e: unknown) => e instanceof IntegrationError && e.retryAfter === 17 && !e.message.includes("private-detail"));
  const translator = new AzureTranslation("local-fake-key", "local-region", async () => Response.json(["Subject", "Translated body"].map((text) => ({ detectedLanguage: { language: "mr", score: 0.9 }, translations: [{ to: "en", text }] }))));
  assert.equal((await translator.translate("Original", "Original text")).language, "mr");
});
