import { NextRequest, NextResponse } from "next/server";
import { authContext } from "@/lib/auth/server";
import { gateway } from "@/lib/auth/gateway";
import { accountDestination, pkceFlowOptions } from "@/lib/auth/policy";
import { z } from "zod";
import { Phase1Error } from "@/lib/live/service";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  let ctx: ReturnType<typeof authContext> | undefined;
  let exchanged = false;
  let failure = "failed";
  let diagnostic = "callback_failed";
  let callbackStage = "validation";
  try {
    ctx = authContext(request);
    const p = request.nextUrl.searchParams, code = p.get("code"), tokenHash = p.get("token_hash"), type = p.get("type");
    const allowed = ["email", "signup", "invite", "recovery"] as const;
    let recovery = false;
    if (code && !tokenHash) { callbackStage = "code_exchange"; const result = await ctx.client.auth.exchangeCodeForSession(code, pkceFlowOptions(p)); if (result.error) { if (["pkce_code_verifier_not_found", "flow_state_expired", "flow_state_not_found", "bad_code_verifier"].includes(result.error.code ?? "")) diagnostic = result.error.code!; if (result.error.code === "pkce_code_verifier_not_found") failure = p.get("flow") === "recovery" ? "recovery-session" : "session"; throw Error("INVALID_CALLBACK"); } recovery = z.object({ redirectType: z.string().nullable().optional() }).parse(result.data).redirectType === "recovery"; }
    else if (tokenHash && allowed.includes(type as typeof allowed[number])) {
      callbackStage = "otp_verification"; const result = await ctx.client.auth.verifyOtp({ token_hash: tokenHash, type: type as typeof allowed[number] }); if (result.error) throw Error("INVALID_CALLBACK"); recovery = type === "recovery" || type === "invite";
    } else throw Error("INVALID_CALLBACK");
    exchanged = true;
    callbackStage = "provider_identity"; const identity = await ctx.verified();
    // A code exchange is bound to the HttpOnly PKCE verifier. OTP recovery is a
    // one-use provider verification. Neither a query flag nor an existing cookie
    // alone can mint recovery authorization.
    if (recovery) {
      callbackStage = "recovery_authorization";
      await gateway("account", identity.claims, "recovery.begin");
      return ctx.apply(NextResponse.redirect(new URL("/reset-password", ctx.config.appOrigin), 303));
    }
    callbackStage = "onboarding_request"; await gateway("account", identity.claims, "request", { email: identity.user.email, name: String(identity.user.user_metadata?.display_name ?? "Officer").slice(0, 150), confirmed: true });
    callbackStage = "account_resolution";
    const resolved = await ctx.account();
    return ctx.apply(NextResponse.redirect(new URL(accountDestination(resolved.account), ctx.config.appOrigin), 303));
  } catch (error) {
    if (error instanceof Phase1Error) diagnostic = error.code;
    if (ctx) { if (exchanged) { await ctx.client.auth.signOut({ scope: "local" }).catch(() => {}); ctx.clear(); }
      const response = ctx.apply(NextResponse.redirect(new URL("/login?callback=" + failure, ctx.config.appOrigin), 303)); response.headers.set("X-Synapse-Auth-Error", diagnostic); response.headers.set("X-Synapse-Auth-Stage", callbackStage); return response; }
    return NextResponse.json({ error: { message: "Authentication callback is unavailable." } }, { status: 503, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
}
