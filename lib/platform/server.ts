import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { phase1Context } from "../live/server";
import { activation, SupabasePlatformRepository, PlatformQueries, type AuthenticatedRpcTransport } from "./repository";
import { PlatformError } from "./contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Phase1Database, Json } from "../live/contracts";
import { ZodError } from "zod";
type PlatformDatabase = { public: Omit<Phase1Database["public"], "Functions"> & { Functions: Phase1Database["public"]["Functions"] & {
  synapse_platform_snapshot: { Args: Record<PropertyKey, never>; Returns: Json };
  synapse_platform_command: { Args: { p_envelope: Json }; Returns: Json };
} } };

export function platformServer(request: NextRequest) {
  if (!activation.reads) throw new PlatformError(503, "platform_locked", activation.reason);
  const context = phase1Context(request);
  // Narrow declared pending RPC surface only; no service client or direct private tables.
  const client = context.client as unknown as SupabaseClient<PlatformDatabase>;
  const transport: AuthenticatedRpcTransport = {
    verifiedIdentity: async () => {
      const user = await context.transport.verifiedAuthUser();
      if (!user) return null;
      const value = await context.transport.identity() as { internalUserId?: string };
      return value.internalUserId ? { authId: user.id, userId: value.internalUserId } : null;
    },
    rpc: async (name, args) => {
      const response = name === "synapse_platform_snapshot"
        ? await client.rpc("synapse_platform_snapshot", {})
        : await client.rpc("synapse_platform_command", { p_envelope: args.p_envelope as Json });
      return { data: response.data, code: response.error?.code };
    },
  };
  const repository = new SupabasePlatformRepository(transport);
  return { repository, queries: new PlatformQueries(repository), respond: context.respond };
}
export function platformFailure(error: unknown) {
  const e = error instanceof PlatformError ? error : error instanceof ZodError
    ? new PlatformError(400, "invalid_command", "Review required fields and supported record values.")
    : new PlatformError(503, "service_unavailable", "The protected platform service is unavailable.");
  return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status,
    headers: { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" } });
}
