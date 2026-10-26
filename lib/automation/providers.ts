import { z } from "zod";

export class IntegrationError extends Error {
  constructor(public code: string, public retryable = true, public retryAfter = 0) { super(code); }
}
export type Fetcher = typeof fetch;
export async function providerJson(url: string, init: RequestInit, fetcher: Fetcher = fetch) {
  let response: Response;
  try { response = await fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(30000) }); }
  catch { throw new IntegrationError("PROVIDER_UNREACHABLE"); }
  if (!response.ok) {
    const raw = response.headers.get("Retry-After"), seconds = raw && /^\d+$/.test(raw) ? Number(raw) : raw ? (Date.parse(raw) - Date.now()) / 1000 : 0;
    throw new IntegrationError(`PROVIDER_HTTP_${response.status}`, response.status === 429 || response.status >= 500, Math.max(0, Math.min(3600, seconds || 0)));
  }
  const reader = response.body?.getReader();
  if (!reader) throw new IntegrationError("PROVIDER_EMPTY_BODY");
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length;
    if (length > 24 * 1024 * 1024) { await reader.cancel(); throw new IntegrationError("PROVIDER_RESPONSE_LIMIT", false); } chunks.push(part.value); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new IntegrationError("PROVIDER_INVALID_JSON"); }
}
export interface SemanticProvider { version: string; embed(texts: string[]): Promise<number[][]> }
export class OllamaEmbeddings implements SemanticProvider {
  readonly version: string;
  private origin: string;
  constructor(private config: { url: string; model: string; digest: string }, private fetcher: Fetcher = fetch) {
    const url = new URL(config.url);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      !(url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new IntegrationError("SEMANTIC_ENDPOINT_INVALID", false);
    if (!/^(sha256:)?[a-f0-9]{64}$/.test(config.digest) || !config.model.trim()) throw new IntegrationError("SEMANTIC_MODEL_PIN_REQUIRED", false);
    this.origin = url.origin; this.version = `${config.model}@${config.digest}`;
  }
  async embed(texts: string[]) {
    if (!texts.length || texts.length > 26 || texts.some((t) => !t.trim() || t.length > 22000)) throw new IntegrationError("EMBED_INPUT_LIMIT", false);
    const tags = z.object({ models: z.array(z.object({ name: z.string(), digest: z.string() })) }).parse(await providerJson(this.origin + "/api/tags", {}, this.fetcher));
    if (!tags.models.some((m) => m.name === this.config.model && m.digest.replace(/^sha256:/, "") === this.config.digest.replace(/^sha256:/, ""))) throw new IntegrationError("MODEL_DIGEST_MISMATCH", false);
    const result = z.object({ model: z.string(), embeddings: z.array(z.array(z.number().finite()).min(8).max(8192)) }).parse(await providerJson(this.origin + "/api/embed", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: this.config.model, input: texts, truncate: false }),
    }, this.fetcher));
    if (result.model !== this.config.model || result.embeddings.length !== texts.length || new Set(result.embeddings.map((r) => r.length)).size !== 1) throw new IntegrationError("EMBEDDING_SHAPE_MISMATCH", false);
    return result.embeddings;
  }
}
export type Translation = { language: string; score: number | null; subject: string; body: string; provider: string; version: string };
export interface TranslationProvider { translate(subject: string, body: string): Promise<Translation> }
export class AzureTranslation implements TranslationProvider {
  constructor(private key: string, private region: string, private fetcher: Fetcher = fetch) {
    if (!key || !region) throw new IntegrationError("TRANSLATION_CONFIGURATION_REQUIRED", false);
  }
  async translate(subject: string, body: string): Promise<Translation> {
    const schema = z.array(z.object({ detectedLanguage: z.object({ language: z.string(), score: z.number().min(0).max(1) }),
      translations: z.array(z.object({ text: z.string().max(50000), to: z.string() })).min(1) })).length(2);
    const result = schema.parse(await providerJson("https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=en&textType=plain", {
      method: "POST", headers: { "Ocp-Apim-Subscription-Key": this.key, "Ocp-Apim-Subscription-Region": this.region, "Content-Type": "application/json" },
      body: JSON.stringify([{ Text: subject || body.slice(0, 100) }, { Text: body }]),
    }, this.fetcher));
    if (!result.every((r) => r.translations.some((t) => t.to === "en"))) throw new IntegrationError("TRANSLATION_TARGET_MISSING");
    return { language: result[1].detectedLanguage.language, score: result[1].detectedLanguage.score,
      subject: result[0].translations.find((t) => t.to === "en")!.text, body: result[1].translations.find((t) => t.to === "en")!.text,
      provider: "Azure Translator", version: "API 3.0; underlying model version not reported" };
  }
}
