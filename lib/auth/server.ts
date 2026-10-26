import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { phase1Config } from "../live/config";
import { Phase1Error } from "../live/service";
import { accountSchema, validatedClaims } from "./policy";
import { gateway } from "./gateway";

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
  const verified = async () => {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user || !data.user.email_confirmed_at) throw new Phase1Error(error?.status && error.status >= 500 ? 503 : 401, "authentication_required", "Sign in with a verified email account.");
    const session = await client.auth.getSession();
    if (!session.data.session) throw new Phase1Error(401, "authentication_required", "Sign in again.");
    return { user: data.user, claims: validatedClaims(session.data.session.access_token, data.user, config.url) };
  };
  const account = async () => {
    const identity = await verified();
    return { ...identity, account: accountSchema.parse(await gateway("read", identity.claims, "account")) };
  };
  const clear = () => { clearLegacy = true; for (const name of new Set([...request.cookies.getAll().map((c) => c.name), ...pending.keys()])) if (/^synapse-auth-session(?:[.-][A-Za-z0-9_-]+)*$/.test(name)) pending.set(name, { name, value: "", options: { maxAge: 0 } }); };
  return { client, config, verified, account, apply, clear, respond: (body: unknown, status = 200) => apply(NextResponse.json(body, { status })) };
}
