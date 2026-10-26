import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import type { Phase1Database } from "./contracts";
import { phase1Config } from "./config";
import { databaseError, Phase1Error, type ReadOnlyTransport } from "./service";
import { sessionCookieName } from "./session";

export function phase1Context(
  request: NextRequest,
  options: { requirePreview?: boolean } = {},
) {
  const config = phase1Config(options);
  const pending = new Map<
    string,
    { name: string; value: string; options: CookieOptions }
  >();
  const authHeaders: Record<string, string> = {};
  const client = createServerClient<Phase1Database>(config.url, config.key, {
    cookieOptions: {
      name: "synapse-phase1-session",
      path: "/api/phase1",
      httpOnly: true,
      sameSite: "lax",
      secure: config.secureCookies,
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies, headers) => {
        for (const cookie of cookies) {
          pending.set(cookie.name, cookie);
          request.cookies.set(cookie.name, cookie.value);
        }
        Object.assign(authHeaders, headers);
      },
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
          signal: init?.signal
            ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)])
            : AbortSignal.timeout(15000),
        }),
    },
  });
  const transport: ReadOnlyTransport = {
    verifiedAuthUser: async () => {
      // Online validation; never trust getSession(), browser roles or an unsigned cookie payload.
      const { data, error } = await client.auth.getUser();
      if (error && (!error.status || error.status >= 500))
        throw databaseError(undefined);
      if (!error && data.user && !config.allowedAuthIds.includes(data.user.id))
        throw databaseError("42501");
      return error ? null : data.user ? { id: data.user.id } : null;
    },
    identity: async () => {
      const { data, error } = await client.rpc("synapse_phase1_me");
      if (error) throw databaseError(error.code);
      return data;
    },
    cases: async (query) => {
      const { data, error } = await client.rpc("synapse_phase1_cases", {
        p_search: query.q,
        p_status: query.status ?? null,
        p_priority: query.priority ?? null,
        p_page: query.page,
        p_page_size: query.pageSize,
        p_sort: query.sort,
      });
      if (error) throw databaseError(error.code);
      return data;
    },
  };
  const respond = (payload: unknown, status = 200) => {
    const response = NextResponse.json(payload, { status });
    Object.entries(authHeaders).forEach(([name, value]) =>
      response.headers.set(name, value),
    );
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    response.headers.set("Vary", "Cookie");
    response.headers.set("X-Content-Type-Options", "nosniff");
    for (const cookie of pending.values())
      response.cookies.set(cookie.name, cookie.value, {
        ...cookie.options,
        path: "/api/phase1",
        httpOnly: true,
        sameSite: "lax",
        secure: config.secureCookies,
      });
    return response;
  };
  const clearSessionCookies = () => {
    const names = new Set([
      ...request.cookies.getAll().map((c) => c.name),
      ...pending.keys(),
      "synapse-phase1-session",
    ]);
    for (const name of names)
      if (sessionCookieName(name))
        pending.set(name, {
          name,
          value: "",
          options: { maxAge: 0, expires: new Date(0) },
        });
  };
  return {
    client,
    transport,
    respond,
    clearSessionCookies,
    appOrigin: config.appOrigin,
  };
}
export { requireSameOrigin } from "./request";
export function phase1Failure(
  error: unknown,
  respond?: (payload: unknown, status?: number) => NextResponse,
) {
  const safe =
    error instanceof Phase1Error
      ? error
      : new Phase1Error(
          503,
          "service_unavailable",
          "The read-only service is temporarily unavailable.",
        );
  const body = { error: { code: safe.code, message: safe.message } };
  if (respond) return respond(body, safe.status);
  return NextResponse.json(body, {
    status: safe.status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
