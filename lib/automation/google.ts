import { z } from "zod";
import { providerJson, IntegrationError, type Fetcher, type SemanticProvider, type TranslationProvider, type Translation } from "./providers";
/** Approved development provider. No model/score result is synthesized. */
export class GeminiEmbeddings implements SemanticProvider {
  readonly version: string;
  constructor(private key: string, private model = "gemini-embedding-001", private fetcher: Fetcher = fetch) {
    if (!key || !/^[a-z0-9-]+$/.test(model)) throw new IntegrationError("GEMINI_CONFIGURATION_REQUIRED", false);
    this.version = `Google Gemini/${model}/SEMANTIC_SIMILARITY/768`;
  }
  async embed(texts: string[]) {
    if (!texts.length || texts.length > 50 || texts.some((t) => !t.trim() || t.length > 20000)) throw new IntegrationError("EMBED_INPUT_LIMIT", false);
    const data = z.object({ embeddings: z.array(z.object({ values: z.array(z.number().finite()).length(768) })).length(texts.length) }).parse(await providerJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:batchEmbedContents`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": this.key },
        body: JSON.stringify({ requests: texts.map((text) => ({ model: "models/" + this.model, content: { parts: [{ text }] }, taskType: "SEMANTIC_SIMILARITY", outputDimensionality: 768 })) }),
      }, this.fetcher));
    return data.embeddings.map((e) => { const norm = Math.hypot(...e.values); if (!norm) throw new IntegrationError("ZERO_EMBEDDING", false); return e.values.map((v) => v / norm); });
  }
}
type GmailPart = { mimeType?: string; filename?: string; body?: { data?: string; attachmentId?: string; size?: number }; parts?: GmailPart[]; headers?: { name: string; value: string }[] };
export class GmailReadOnly {
  private token?: string;
  private expires = 0;
  private verified = false;
  constructor(private config: { approvedAddress: string; clientId: string; clientSecret: string; refreshToken: string; label: string; enabled: boolean; accessToken?:()=>Promise<string> }, private fetcher: Fetcher = fetch) {
    if (!config.enabled || !z.email().safeParse(config.approvedAddress).success || !config.clientId || !config.clientSecret || !config.refreshToken || !config.label)
      throw new IntegrationError("APPROVED_GMAIL_OAUTH_REQUIRED", false);
  }
  private async accessToken() {
    if(this.config.accessToken)return this.config.accessToken();
    if (this.token && this.expires > Date.now() + 60000) return this.token;
    const result = z.object({ access_token: z.string(), expires_in: z.number().positive(), scope: z.string().min(1) }).parse(await providerJson("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret, refresh_token: this.config.refreshToken, grant_type: "refresh_token" }).toString(),
    }, this.fetcher));
    if (!result.scope.split(' ').every(scope=>scope==='https://www.googleapis.com/auth/gmail.readonly')) throw new IntegrationError("GMAIL_READONLY_SCOPE_REQUIRED", false);
    this.token = result.access_token; this.expires = Date.now() + result.expires_in * 1000; return this.token;
  }
  private async raw(path: string, query = new URLSearchParams()) {
    return providerJson("https://gmail.googleapis.com/gmail/v1/users/me/" + path + (query.size ? "?" + query : ""), { headers: { Authorization: "Bearer " + await this.accessToken() } }, this.fetcher);
  }
  async profile() {
    const profile = z.object({ emailAddress: z.email(), historyId: z.string() }).parse(await this.raw("profile"));
    if (profile.emailAddress.toLowerCase() !== this.config.approvedAddress.toLowerCase()) throw new IntegrationError("OAUTH_MAILBOX_APPROVAL_MISMATCH", false);
    this.verified = true; return profile;
  }
  private async verifiedRead(path: string, query?: URLSearchParams) { if (!this.verified) await this.profile(); return this.raw(path, query); }
  async list(pageToken = "") {
    const query = new URLSearchParams({ labelIds: this.config.label, maxResults: "50" }); if (pageToken) query.set("pageToken",pageToken);
    return z.object({ messages: z.array(z.object({ id: z.string() })).optional(), nextPageToken: z.string().optional() }).parse(await this.verifiedRead("messages",query));
  }
  async history(start: string, pageToken = "") {
    const query = new URLSearchParams({ startHistoryId: start, historyTypes: "messageAdded", labelId:this.config.label, maxResults: "50" }); if (pageToken) query.set("pageToken",pageToken);
    return z.object({ historyId: z.string(), history: z.array(z.object({ messagesAdded: z.array(z.object({ message: z.object({ id: z.string(), labelIds: z.array(z.string()).optional() }) })).optional() })).optional(), nextPageToken: z.string().optional() }).parse(await this.verifiedRead("history",query));
  }
  async message(id: string) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new IntegrationError("INVALID_GMAIL_MESSAGE_ID", false);
    const result = z.object({ id: z.string(), internalDate: z.string(), payload: z.custom<GmailPart>((v) => !!v && typeof v === "object") }).parse(await this.verifiedRead("messages/"+id,new URLSearchParams({ format: "full" })));
    const headers = new Map((result.payload.headers ?? []).map((h) => [h.name.toLowerCase(),h.value])); let body = "", html = "";
    const attachments: { name: string; mediaType: string; bytes: Buffer }[] = []; let size = 0;
    const walk = async (part: GmailPart) => {
      let bytes = part.body?.data ? Buffer.from(part.body.data,"base64url") : null;
      if (part.body?.attachmentId) { if ((part.body.size ?? 0) > 10485760) throw new IntegrationError("EMAIL_ATTACHMENT_TOO_LARGE",false);
        const data = z.object({ data: z.string() }).parse(await this.verifiedRead("messages/"+id+"/attachments/"+encodeURIComponent(part.body.attachmentId))); bytes = Buffer.from(data.data,"base64url"); }
      if (bytes) { size += bytes.length; if (size > 20*1024*1024) throw new IntegrationError("EMAIL_SIZE_LIMIT",false);
        if (part.filename || part.body?.attachmentId || !['text/plain','text/html'].includes(part.mimeType??'')) attachments.push({ name: (part.filename||'attachment').slice(0,250), mediaType: part.mimeType ?? "application/octet-stream", bytes });
        else if (part.mimeType === "text/plain") body += bytes.toString("utf8"); else if (part.mimeType === "text/html") html += bytes.toString("utf8"); }
      for (const child of part.parts ?? []) await walk(child);
    };
    await walk(result.payload);
    if (!body && html) body = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,"").replace(/<[^>]*>/g," ");
    if (!body.trim()) throw new IntegrationError("EMAIL_NO_READABLE_BODY",false);
    const raw=z.object({raw:z.string()}).parse(await this.verifiedRead("messages/"+id,new URLSearchParams({format:"raw"})));
    if(Buffer.from(raw.raw,"base64url").length>20*1024*1024)throw new IntegrationError("EMAIL_SIZE_LIMIT",false);
    return { id: result.id, subject: headers.get("subject") ?? "", internetMessageId:headers.get("message-id")??null, sender: headers.get("from") ?? "Unknown sender", receivedAt: new Date(Number(result.internalDate)).toISOString(), body, originalMimeBase64:raw.raw, originalHtml: html, attachments };
  }
}

/** Cloud Translation Basic v2; original text stays in the canonical submission. */
export class GoogleCloudTranslation implements TranslationProvider {
 constructor(private key:string,private fetcher:Fetcher=fetch){if(!key)throw new IntegrationError('GOOGLE_TRANSLATION_CONFIGURATION_REQUIRED',false);}
 async translate(subject:string,body:string,sourceLanguage?:string,targetLanguage='en'):Promise<Translation>{
  if(!body.trim()||subject.length+body.length>30000||!/^([a-z]{2,3})(-[A-Za-z]{2,4})?$/.test(targetLanguage))throw new IntegrationError('TRANSLATION_INPUT_LIMIT',false);
  const source=sourceLanguage&&sourceLanguage!=='und'?sourceLanguage:undefined;
  const schema=z.object({data:z.object({translations:z.array(z.object({translatedText:z.string().max(200000),detectedSourceLanguage:z.string().optional(),model:z.string().optional()})).length(2)})});
  const result=schema.parse(await providerJson('https://translation.googleapis.com/language/translate/v2',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':this.key},body:JSON.stringify({q:[subject||body.slice(0,100),body],format:'text',target:targetLanguage,model:'nmt',...(source?{source}:{})})},this.fetcher));
  return {language:source??result.data.translations[1].detectedSourceLanguage??'und',score:null,subject:result.data.translations[0].translatedText,body:result.data.translations[1].translatedText,provider:'Google Cloud Translation',version:'Basic v2 / NMT; underlying model revision not reported',targetLanguage,detector:source?'Human-selected source language':'Google automatic language detection'};
 }
}
