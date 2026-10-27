import "server-only";
import { NextRequest } from "next/server";
import { authContext } from "../auth/server";
import { gateway } from "../auth/gateway";
import { PlatformError, snapshotSchema } from "./contracts";
import { PlatformQueries, type PlatformRepository } from "./repository";
import {accountWorkspaceSnapshot,hostedReadPreviewAllowed} from './account-workspace';

export function hostedReadonlyServer(request: NextRequest) {
  const context=authContext(request);
  const repository:PlatformRepository={
    snapshot:async()=>{
      const identity=await context.account();
      if(identity.account.status!=="APPROVED"||!identity.profile)
        throw new PlatformError(403,"approval_required","Current officer approval is required.");
      // Preserve the existing server preview allowlist. An empty list never
      // makes case access global, even if a database lease is active.
      if(!hostedReadPreviewAllowed(identity.claims.sub,process.env.SYNAPSE_PHASE1_READ_ENABLED,context.config.allowedAuthIds))return accountWorkspaceSnapshot(identity.profile);
      return snapshotSchema.parse(await gateway("workspace",identity.claims,"snapshot"));
    },
    command:async()=>{throw new PlatformError(503,"business_writes_locked","Hosted complaint writes are disabled. This workspace provides account access and a reviewed read-only projection only.");},
  };
  return {repository,queries:new PlatformQueries(repository),respond:(body:unknown,status=200)=>{
    const response=context.respond(body,status);
    response.headers.set("X-Synapse-Data-Source","Supabase / authenticated read-only workspace / business writes OFF");
    return response;
  }};
}
