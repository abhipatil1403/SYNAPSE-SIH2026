import { writeFile } from "node:fs/promises";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key)
  throw new Error(
    "Load verified project URL and publishable key through .env.local.",
  );
if (!key.startsWith("sb_publishable_"))
  throw new Error("This diagnostic accepts a publishable key only.");
const checks = [];
for (const [name, path, headers] of [
  ["auth-health", "/auth/v1/health", {}],
  [
    "private-schema-access",
    "/rest/v1/cases?select=case_id&limit=1",
    { "Accept-Profile": "synapse" },
  ],
]) {
  try {
    const response = await fetch(new URL(path, url), {
      headers: { apikey: key, ...headers },
      signal: AbortSignal.timeout(15000),
    });
    let code;
    try {
      code = (await response.json()).code;
    } catch {}
    checks.push({ name, status: response.status, code: code ?? null });
  } catch (e) {
    checks.push({ name, error: e.message });
  }
}
const result = {
  checkedAt: new Date().toISOString(),
  project: "SYNAPSE",
  checks,
  liveWorkflowsEnabled: false,
};
await writeFile(
  "docs/supabase-network-check.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
