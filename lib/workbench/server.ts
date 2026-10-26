import "server-only";
import { NextRequest } from "next/server";
import { authContext } from "../auth/server";
import { workbenchConfig } from "./config";
import { makeWorkbenchPool, WorkbenchStore } from "./store";
import { PlatformEngine } from "../platform/engine";
import { PlatformQueries, type PlatformRepository } from "../platform/repository";
import { PlatformError, envelopeSchema, principalSchema } from "../platform/contracts";
let pool: ReturnType<typeof makeWorkbenchPool> | undefined;
export function workbenchServer(request: NextRequest) {
  const config = workbenchConfig(); if (!config || !["localhost", "127.0.0.1"].includes(request.nextUrl.hostname)) throw new PlatformError(503,"isolated_workbench_locked","The isolated development database is not configured for this origin.");
  const ctx = authContext(request); pool ??= makeWorkbenchPool(config.connectionString);
  const resolve = async () => {
    const identity = await ctx.account(); if (identity.account.status !== "APPROVED" || !identity.account.internalUserId) throw new PlatformError(403,"approval_required","Current hosted approval is required for the isolated database too.");
    // The existing gateway account DTO flattens roles. Until it returns reviewed
    // scoped role tuples, do not infer which of several Bureaus owns a role.
    if(identity.account.memberships.length>1)throw new PlatformError(503,'scoped_identity_contract_required','Multi-Bureau identity requires a reviewed scoped gateway contract before isolated access.');
    const principal = principalSchema.parse({ authId: identity.claims.sub, sessionId: identity.claims.session_id, userId: identity.account.internalUserId });
    return { identity, principal, store: new WorkbenchStore(pool!,config.environmentId,{principal,account:identity.account}) };
  };
  const repository: PlatformRepository = {
    snapshot: async () => { const r = await resolve(); return new PlatformEngine(r.store).snapshot(r.principal); },
    command: async (input) => {
      const parsed = envelopeSchema.parse(input), r = await resolve();
      // File bytes and scan provenance must come through the attachment endpoint,
      // never a browser claiming a hash/clean verdict in a generic command.
      if (parsed.command.type === "evidence.attach") throw new PlatformError(400,"attachment_required","Upload through the protected attachment endpoint.");
      if(parsed.command.type==='draft.create'&&parsed.command.source!=='MANUAL')throw new PlatformError(400,'trusted_ingestion_required','Only the approved server ingestion adapter may create external-source drafts.');
      return new PlatformEngine(r.store).execute(r.principal,parsed);
    },
  };
  return { repository, queries: new PlatformQueries(repository), resolve, context: ctx,
    respond: (body: unknown, status = 200) => { const response = ctx.respond(body,status); response.headers.set("X-Synapse-Data-Source","ISOLATED POSTGRES / real Supabase Auth / hosted business writes OFF"); return response; } };
}
