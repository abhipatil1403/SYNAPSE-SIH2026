import { NextRequest } from "next/server";
import {
  phase1Context,
  phase1Failure,
  requireSameOrigin,
} from "@/lib/live/server";
import { databaseError } from "@/lib/live/service";
import { endSession } from "@/lib/live/session";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  let context: ReturnType<typeof phase1Context> | undefined;
  try {
    // Logout must remain available after an operator locks the read preview.
    context = phase1Context(request, { requirePreview: false });
    requireSameOrigin(request, context.appOrigin);
    const current = context;
    const result = await endSession({
      verifiedUser: async () =>
        Boolean(await current.transport.verifiedAuthUser()),
      revokeCurrent: async () => {
        const { error } = await current.client.rpc(
          "synapse_phase2_revoke_session",
        );
        if (error) throw databaseError(error.code);
      },
      providerSignOut: async () => {
        const { error } = await current.client.auth.signOut({ scope: "local" });
        if (error) throw databaseError(error.code);
      },
      clearCookies: current.clearSessionCookies,
    });
    return context.respond(result);
  } catch (error) {
    return phase1Failure(error, context?.respond);
  }
}
