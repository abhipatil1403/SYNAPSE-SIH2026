import "server-only";
import {verifyCurrentSession} from "./live-session";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { phase1Config } from "../live/config";
import { Phase1Error } from "../live/service";
import { accountSchema } from "./policy";
import { gateway } from "./gateway";
import {passwordSignUp} from './password-signup';
import {privateProfileSchema} from './profile';

export function authContext(request: NextRequest) {
  const config = phase1Config({ requirePreview: false });
  const pending = new Map<string, { name: string; value: string; options: CookieOptions }>();
  let clearLegacy = false;
  const headers: Record<string, string> = {};
  const client = createServerClient(config.url, config.key, {
    auth: { experimental: { appendPkceFlowIdToRedirects: true } },
    cookieOptions: { name: "synapse-auth-session", path: "/", httpOnly: true, secure: config.secureCookies, sameSite: "lax" },
    cookies: { getAll: () => request.cookies.getAll(), setAll: (values, authHeaders) => {
      for (const value of values) { pending.set(value.name, value); request.cookies.set(value.name, value.value); } Object.assign(headers, authHeaders);
    } },
    global: { fetch: (url, init) => fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15000) }) },
  });
  const apply = (response: NextResponse) => {
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    response.headers.set("Cache-Control", "private, no-store, max-age=0"); response.headers.set("Vary", "Cookie");
    response.headers.set("Referrer-Policy", "no-referrer"); response.headers.set("X-Content-Type-Options", "nosniff");
    for (const cookie of pending.values()) response.cookies.set(cookie.name, cookie.value, { ...cookie.options, path: "/", httpOnly: true, secure: config.secureCookies, sameSite: "lax" });
    if (clearLegacy) for (const name of ["synapse-phase1-session", ...Array.from({ length: 8 }, (_, i) => `synapse-phase1-session.${i}`)]) response.cookies.set(name, "", { path: "/api/phase1", maxAge: 0, httpOnly: true, secure: config.secureCookies, sameSite: "lax" });
    return response;
  };
  const verified = () => verifyCurrentSession(client.auth,config.url);
  const account = async () => {
    const identity = await verified();
    const resolved=accountSchema.parse(await gateway('read',identity.claims,'account'));
    // An interrupted signup/login can retry this idempotent pending request.
    // Email/name come from online Auth, never browser identity/role selection.
    if(resolved.status==='PENDING_APPROVAL')await gateway('account',identity.claims,'request',{email:identity.user.email,name:String(identity.user.user_metadata?.display_name??'Officer applicant').slice(0,150),confirmed:Boolean(identity.user.email_confirmed_at)});
    const review=await gateway('applicants',identity.claims,'self') as {application?:OfficerApplication;profile?:unknown};
    return {...identity,account:accountSchema.parse({...resolved,...(review.application?{application:review.application}:{})}),profile:review.profile?privateProfileSchema.parse(review.profile):undefined};
  };
  type OfficerApplication=NonNullable<ReturnType<typeof accountSchema.parse>['application']>;
  const passwordSignup=async(input:{email:string;password:string;name?:string})=>{
    // SSR forces PKCE, which Supabase does not support for autoconfirm signup.
    // This transient server client never persists a password/session in storage.
    const result=await passwordSignUp(config,input,(url,init)=>fetch(url,{...init,cache:'no-store',signal:AbortSignal.timeout(15000)}));
    if(result.data.session&&!result.error){const adopted=await client.auth.setSession({access_token:result.data.session.access_token,refresh_token:result.data.session.refresh_token});if(adopted.error)throw new Phase1Error(503,'session_unavailable','The account session could not be established. Try signing in.');}
    return result;
  };
  const clear = () => { clearLegacy = true; for (const name of new Set([...request.cookies.getAll().map((c) => c.name), ...pending.keys()])) if (/^synapse-auth-session(?:[.-][A-Za-z0-9_-]+)*$/.test(name)) pending.set(name, { name, value: "", options: { maxAge: 0 } }); };
  return { client, config, verified, account, passwordSignup, apply, clear, respond: (body: unknown, status = 200) => apply(NextResponse.json(body, { status })) };
}
