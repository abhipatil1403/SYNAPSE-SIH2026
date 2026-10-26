import {test} from "node:test";
import assert from "node:assert/strict";
import {createClient} from "@supabase/supabase-js";
import {pkceFlowOptions} from "../lib/auth/policy";
test("MOCKED installed SDK contract: callback selects its sb_flow_id verifier after a second recovery overwrites the legacy pointer", async () => {
  const storage = new Map<string,string>(), redirects: URL[] = []; let submitted = "";
  const client = createClient("https://pkce-contract.example.invalid", "local-publishable-contract", { auth: { flowType: "pkce", persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, experimental: { appendPkceFlowIdToRedirects: true },
    storage: { getItem: (k) => storage.get(k) ?? null, setItem: (k,v) => { storage.set(k,v); }, removeItem: (k) => { storage.delete(k); } } },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/recover")) { redirects.push(new URL(url.searchParams.get("redirect_to")!)); return Response.json({}); }
      if (url.pathname.endsWith("/token")) { submitted = JSON.parse(String(init?.body)).code_verifier; return Response.json({ code: "isolated_probe", msg: "Contract probe stops before session creation" }, { status: 400 }); }
      throw Error("Unexpected simulated provider request");
    } } });
  await client.auth.resetPasswordForEmail("first@example.invalid", { redirectTo: "http://localhost:3000/auth/callback?flow=recovery" });
  const firstId = redirects[0].searchParams.get("sb_flow_id")!;
  const firstKey = [...storage.keys()].find((k) => k.endsWith(`-flow-${firstId}-code-verifier`))!;
  const first = JSON.parse(storage.get(firstKey)!) as string;
  await client.auth.resetPasswordForEmail("second@example.invalid", { redirectTo: "http://localhost:3000/auth/callback?flow=recovery" });
  assert.notEqual(redirects[1].searchParams.get("sb_flow_id"), firstId);
  await client.auth.exchangeCodeForSession("isolated-not-a-real-auth-code", pkceFlowOptions(redirects[0].searchParams));
  assert.equal(submitted, first.split("/")[0]);
  assert.throws(() => pkceFlowOptions(new URLSearchParams("sb_flow_id=bad")));
  assert.throws(() => pkceFlowOptions(new URLSearchParams("sb_flow_id=validflow1&sb_flow_id=validflow2")));
});
