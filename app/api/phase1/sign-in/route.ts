import { NextRequest } from "next/server";
import { z } from "zod";
import { readIdentity, Phase1Error } from "@/lib/live/service";
import {
  phase1Context,
  phase1Failure,
  requireSameOrigin,
} from "@/lib/live/server";
import { smallJson } from "@/lib/live/request";
export const runtime = "nodejs";
const credentials = z
  .object({ email: z.email().max(254), password: z.string().min(1).max(1024) })
  .strict();
export async function POST(request: NextRequest) {
  let context: ReturnType<typeof phase1Context> | undefined;
  try {
    context = phase1Context(request);
    requireSameOrigin(request, context.appOrigin);
    const body = await smallJson(request);
    let input;
    try {
      input = credentials.parse(body);
    } catch {
      throw new Phase1Error(
        400,
        "invalid_credentials",
        "Enter a valid email address and password.",
      );
    }
    const { error } = await context.client.auth.signInWithPassword(input);
    if (error?.status === 429)
      throw new Phase1Error(
        429,
        "rate_limited",
        "Too many sign-in attempts. Try again later.",
      );
    if (error)
      throw new Phase1Error(
        error.status && error.status >= 500 ? 503 : 401,
        "sign_in_failed",
        "Unable to sign in. Check your credentials and try again.",
      );
    try {
      return context.respond({
        identity: await readIdentity(context.transport),
        readOnly: true,
      });
    } catch (error) {
      await context.client.auth.signOut({ scope: "local" });
      context.clearSessionCookies();
      throw error;
    }
  } catch (error) {
    return phase1Failure(error, context?.respond);
  }
}
