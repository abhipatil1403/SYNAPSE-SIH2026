import {hostedOperationsActive} from "@/lib/hosted/control";
import { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { authContext } from "@/lib/auth/server";
import { gateway, throttle, authReadiness } from "@/lib/auth/gateway";
import { loginSchema, signupSchema, resetSchema, emailSchema, accountDestination } from "@/lib/auth/policy";
import { phase1Failure } from "@/lib/live/server";
import { Phase1Error } from "@/lib/live/service";
import { parseCaseQuery } from "@/lib/live/contracts";
import { endSession } from "@/lib/live/session";
import { requireSameOrigin, smallJson } from "@/lib/live/request";
import { roleReviewSchema, roleAssignmentsSchema } from "@/lib/auth/administration";
export const runtime = "nodejs";
function providerFailure(error: { status?: number } | null, login = false) {
  if (error) throw new Phase1Error(error.status === 429 ? 429 : error.status && error.status >= 500 ? 503 : login ? 401 : 400,
    "authentication_failed", login?'Email or password is incorrect, or sign-in is unavailable.':'The request could not be completed. Check your information and the password policy, then try again.');
}
export async function GET(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  let ctx: ReturnType<typeof authContext> | undefined;
  try {
    ctx = authContext(request); const { action } = await params;
    if (!["session", "approvals", "memberships", "roles", "cases", "readiness", "profile"].includes(action)) return ctx.respond({ error: { message: "Route unavailable." } }, 404);
    const resolved = await ctx.account();
    if (action === "profile") return ctx.respond({email:resolved.user.email,displayName:resolved.account.displayName??"",status:resolved.account.status,roles:resolved.account.roles,memberships:resolved.account.memberships});
    if (action === "readiness") {if(!resolved.account.roles.includes("SYSTEM_ADMIN"))throw new Phase1Error(403,"configuration_authority_required","System Administrator access is required.");return ctx.respond(await authReadiness(resolved.claims));}
    if (action === "memberships") return ctx.respond(await gateway("memberships", resolved.claims, "list"));
    if (action === "roles") return ctx.respond(roleAssignmentsSchema.parse(await gateway("roles", resolved.claims, "list")));
    if (action === "cases") {
      if (resolved.account.status !== "APPROVED") throw new Phase1Error(403, "approval_required", "Officer approval is required.");
      if (process.env.SYNAPSE_PHASE1_READ_ENABLED !== "true") throw new Phase1Error(503, "preview_locked", "Live case access is awaiting security approval. Your verified account is active.");
      return ctx.respond(await gateway("read", resolved.claims, "cases", parseCaseQuery(request.nextUrl.searchParams)));
    }
    if (action === "session") return ctx.respond({ account: resolved.account, destination: accountDestination(resolved.account), liveEnabled: resolved.account.status==="APPROVED"&&await hostedOperationsActive() });
    const listing = z.object({ requests: z.array(z.object({ auth_user_id: z.uuid(), email: z.email(), display_name: z.string(), status: z.string(), revision: z.string(), requested_at: z.string(),history:z.array(z.object({action:z.string(),at:z.string(),actorId:z.string().nullable(),detail:z.record(z.string(),z.unknown())})) })),
      bureaus: z.array(z.object({ id: z.uuid(), name: z.string() })) }).parse(await gateway("applicants", resolved.claims, "list"));
    return ctx.respond({ ...listing, requests: listing.requests.map((row) => ({ ...row, canDecide: row.auth_user_id !== resolved.claims.sub })) });
  } catch (error) { return phase1Failure(error instanceof Phase1Error?error:new Phase1Error(503,'account_service_unavailable','Secure account access is temporarily unavailable. Please retry.'), ctx?.respond); }
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  let ctx: ReturnType<typeof authContext> | undefined;
  try {
    ctx = authContext(request); requireSameOrigin(request, ctx.config.appOrigin);
    const { action } = await params;
    if (!["login", "signup", "forgot-password", "reset-password", "logout", "refresh", "approval", "membership", "role", "profile"].includes(action)) return ctx.respond({ error: { message: "Route unavailable." } }, 404);
    if (action === "login") {
      const input = loginSchema.parse(await smallJson(request)); await throttle(request, "login", input.email);
      const { error } = await ctx.client.auth.signInWithPassword(input); providerFailure(error, true);
      const resolved = await ctx.account();
      return ctx.respond({ account: resolved.account, destination: accountDestination(resolved.account), liveEnabled: resolved.account.status==="APPROVED"&&await hostedOperationsActive() });
    }
    if (action === "signup") {
      const input = signupSchema.parse(await smallJson(request)); await throttle(request, "signup", input.email);
      if (process.env.SYNAPSE_SIGNUP_ENABLED !== "true") throw new Phase1Error(403, "registration_disabled", "Officer registration currently requires an administrator invitation.");
      const {data,error}=await ctx.passwordSignup(input);
      if(error?.code==='user_already_exists'||error?.code==='email_exists')throw new Phase1Error(409,'registration_unavailable','Unable to create this account. If you already registered, sign in or reset your password.');
      providerFailure(error);
      if(!data.session)throw new Phase1Error(409,'immediate_signup_unavailable','An immediate password session was not issued. Contact the administrator to check signup settings, or try signing in if already registered.');
      const resolved=await ctx.account();
      return ctx.respond({message:'Account created. Administrator approval is required before complaint access.',account:resolved.account,destination:accountDestination(resolved.account),liveEnabled:resolved.account.status==="APPROVED"&&await hostedOperationsActive()});
    }
    if (action === "forgot-password") {
      const input = emailSchema.parse(await smallJson(request)); await throttle(request, "recovery", input.email);
      const { error } = await ctx.client.auth.resetPasswordForEmail(input.email, { redirectTo: ctx.config.appOrigin + "/auth/callback?flow=recovery" }); providerFailure(error);
      return ctx.respond({ message: "The provider accepted the reset request. If the account is eligible, check its inbox for a reset link." });
    }
    if (action === "reset-password") {
      const input = resetSchema.parse(await smallJson(request)), identity = await ctx.verified(); await throttle(request, "reset", identity.user.email);
      await gateway("account", identity.claims, "recovery.consume");
      const { error } = await ctx.client.auth.updateUser({ password: input.password }); providerFailure(error);
      const current = ctx;
      try { await endSession({ verifiedUser: async () => true,
        revokeCurrent: async () => { const r = await current.client.rpc("synapse_phase2_revoke_session"); if (r.error) throw Error("REVOCATION_FAILED"); },
        providerSignOut: async () => { const r = await current.client.auth.signOut({ scope: "global" }); if (r.error) throw Error("SIGNOUT_FAILED"); }, clearCookies: current.clear }); }
      catch { throw new Phase1Error(503, "reset_logout_incomplete", "Your password was updated and local cookies were cleared. Complete server sign-out could not be verified; sign in again or contact your administrator."); }
      return ctx.respond({ message: "Password updated. Sign in again using your new password.", destination: "/login" });
    }
    if (action === "logout") {
      const current = ctx;
      const result = await endSession({
        verifiedUser: async () => { try { await current.verified(); return true; } catch (e) { if (e instanceof Phase1Error && e.status === 401) return false; throw e; } },
        revokeCurrent: async () => { const r = await current.client.rpc("synapse_phase2_revoke_session"); if (r.error) throw Error("REVOCATION_FAILED"); },
        providerSignOut: async () => { const r = await current.client.auth.signOut({ scope: "local" }); if (r.error) throw Error("SIGNOUT_FAILED"); }, clearCookies: current.clear,
      });
      return ctx.respond({ ...result, destination: "/login" });
    }
    if (action === "refresh") {
      const { error } = await ctx.client.auth.refreshSession();
      if (error) { ctx.clear(); throw new Phase1Error(error.status === 429 ? 429 : error.status && error.status >= 500 ? 503 : 401, "session_refresh_failed", "Your session could not be refreshed. Sign in again."); }
      const resolved = await ctx.account(); return ctx.respond({ account: resolved.account, destination: accountDestination(resolved.account), liveEnabled: resolved.account.status==="APPROVED"&&await hostedOperationsActive() });
    }
    if (action === "profile") {
      const input=z.object({name:z.string().trim().min(2).max(150)}).strict().parse(await smallJson(request)),identity=await ctx.account();
      if(identity.account.status!=="APPROVED")throw new Phase1Error(403,"approval_required","Current approval is required to edit a profile.");
      await throttle(request,"profile",identity.user.email);return ctx.respond(await gateway("profile",identity.claims,"update",input));
    }
    if (action === "role") {
      const input = roleReviewSchema.parse(await smallJson(request)), identity = await ctx.verified();
      return ctx.respond(await gateway("roles", identity.claims, "decide", input));
    }
    if (action === "membership") {
      const input = z.object({ requestId: z.uuid(), membershipId: z.uuid(), expectedUntil: z.iso.datetime({ offset: true }).nullable(),
        until: z.iso.datetime({ offset: true }).optional(), revoke: z.boolean(), reason: z.string().trim().min(5).max(1000) }).strict().superRefine((v, c) => { if (!v.revoke && !v.until) c.addIssue({ code: "custom", message: "Expiry required." }); }).parse(await smallJson(request));
      const identity = await ctx.verified(); return ctx.respond(await gateway("memberships", identity.claims, "decide", input));
    }
    const input = z.object({ authId: z.uuid(), revision: z.string().regex(/^[1-9][0-9]*$/), decision: z.enum(["APPROVED", "REJECTED", "SUSPENDED", "REVOKED"]),
      bureauId: z.uuid().optional(), role: z.enum(["CASE_OFFICER", "BUREAU_HEAD", "AUDITOR", "REVIEWER"]).optional(), until: z.iso.datetime({ offset: true }).optional(), reason: z.string().trim().min(5).max(1000),
    }).strict().superRefine((input, ctx) => { if (input.decision === "APPROVED" && (!input.bureauId || !input.role || !input.until)) ctx.addIssue({ code: "custom", message: "Approval requires a Bureau, role and expiry." }); }).parse(await smallJson(request));
    const identity = await ctx.verified(); return ctx.respond(await gateway("account", identity.claims, "decide", input));
  } catch (error) {
    return phase1Failure(error instanceof ZodError ? new Phase1Error(400, "invalid_input", "Check the form fields. New passwords need at least 12 characters.") : error instanceof Phase1Error?error:new Phase1Error(503,'account_service_unavailable','Secure account access is temporarily unavailable. Please retry.'), ctx?.respond);
  }
}
