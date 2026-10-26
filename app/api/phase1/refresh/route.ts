import { NextRequest } from "next/server";
import {
  phase1Context,
  phase1Failure,
  requireSameOrigin,
} from "@/lib/live/server";
import { databaseError, readIdentity } from "@/lib/live/service";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  let context: ReturnType<typeof phase1Context> | undefined;
  try {
    context = phase1Context(request);
    requireSameOrigin(request, context.appOrigin);
    const { error } = await context.client.auth.refreshSession();
    if (error) {
      context.clearSessionCookies();
      throw databaseError("28000");
    }
    return context.respond({
      identity: await readIdentity(context.transport),
      readOnly: true,
    });
  } catch (error) {
    return phase1Failure(error, context?.respond);
  }
}
