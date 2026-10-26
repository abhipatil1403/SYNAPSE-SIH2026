import { z } from "zod";
import { Phase1Error } from "../live/service";
export const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(1024) }).strict();
export const signupSchema = loginSchema.extend({ name: z.string().trim().min(2).max(150).optional(), password: z.string().min(12).max(128) }).strict();
export const resetSchema = z.object({ password: z.string().min(12).max(128) }).strict();
export const emailSchema = z.object({ email: z.email().max(254) }).strict();
export const accountSchema = z.object({ status: z.enum(["APPROVED", "PENDING_APPROVAL"]),
  internalUserId: z.uuid().optional(), displayName: z.string().optional(), roles: z.array(z.string()), memberships: z.array(z.uuid()),
  application: z.object({status:z.enum(['PENDING','APPROVED','REJECTED','SUSPENDED','REVOKED']),requestedAt:z.string(),decidedAt:z.string().nullish()}).optional(),
}).strict();
export type OfficerAccount = z.infer<typeof accountSchema>;
export function validatedClaims(token: string, verifiedUser: { id: string }, projectUrl: string, now = Date.now()) {
  // This decoder is NOT authentication. It is called only AFTER online getUser(token)
  // succeeds; the returned subject must equal that verified provider response.
  let claims: Record<string, unknown>;
  try { claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")); }
  catch { throw new Phase1Error(401, "authentication_required", "Sign in again."); }
  if (claims.sub !== verifiedUser.id || claims.iss !== projectUrl + "/auth/v1" || claims.role !== "authenticated" ||
    claims.aud !== "authenticated" || typeof claims.exp !== "number" || claims.exp * 1000 <= now ||
    !z.uuid().safeParse(claims.sub).success || !z.uuid().safeParse(claims.session_id).success)
    throw new Phase1Error(401, "authentication_required", "The verified session is unavailable.");
  return { sub: claims.sub, session_id: claims.session_id, exp: claims.exp, role: "authenticated", aud: "authenticated" };
}
export function accountDestination(account: OfficerAccount) { return account.status === "APPROVED" ? "/officer/dashboard" : "/pending-approval"; }
export function pkceFlowOptions(params: URLSearchParams) {
  const values = params.getAll("sb_flow_id");
  if (!values.length) return undefined; // Legacy single-flow callback.
  if (values.length !== 1 || !/^[A-Za-z0-9_-]{8,64}$/.test(values[0])) throw new Phase1Error(400, "invalid_callback", "Request a fresh verification link.");
  return { flowId: values[0] };
}
