import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

// Default: test the delivered locked app and provider denials without enabling any gate.
// --approved-preview is reserved for a future explicitly approved preview; this script never enables it.
const base = process.env.SYNAPSE_PHASE1_TEST_ORIGIN ?? "http://localhost:3000";
const origin = new URL(base);
if (!["localhost", "127.0.0.1"].includes(origin.hostname))
  throw new Error("HTTP verification accepts loopback only.");
const checks = [];
async function check(
  name,
  path,
  { method = "GET", headers = {}, body, status = 401 } = {},
) {
  const response = await fetch(new URL(path, base), {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(25000),
  });
  assert.equal(
    response.status,
    status,
    `${name}: expected ${status}, got ${response.status}`,
  );
  if (method === "GET" && response.status !== 405)
    assert.match(
      response.headers.get("cache-control") ?? "",
      /private.*no-store/,
    );
  const text = await response.text();
  assert.doesNotMatch(
    text,
    /access_token|refresh_token|storage_key|sha256_hex|SELECT .* FROM/i,
    `${name}: response must not expose sessions or SQL`,
  );
  checks.push({ name, status: response.status });
}
if (!process.argv.includes("--approved-preview")) {
  await check("Case list gate remains locked", "/api/phase1/cases", {
    status: 503,
  });
  await check("Identity gate remains locked", "/api/phase1/session", {
    status: 503,
  });
  await check("Demo cookie cannot unlock preview", "/api/phase1/cases", {
    status: 503,
    headers: { Cookie: "synapse.demo.role=Supervisor" },
  });
  await check(
    "Browser role and gate headers cannot unlock preview",
    "/api/phase1/cases",
    {
      status: 503,
      headers: {
        "x-role": "Supervisor",
        "x-synapse-phase1-read-enabled": "true",
      },
    },
  );
  await check("Forged session cannot unlock preview", "/api/phase1/session", {
    status: 503,
    headers: { Cookie: "synapse-phase1-session=forged" },
  });
  await check(
    "Filters do not bypass locked gate",
    "/api/phase1/cases?actor=admin&status=NEW",
    { status: 503 },
  );
  await check("Case POST unavailable", "/api/phase1/cases", {
    method: "POST",
    status: 405,
  });
  await check("Case PATCH unavailable", "/api/phase1/cases", {
    method: "PATCH",
    status: 405,
  });
  await check(
    "Auth POST remains unavailable while locked",
    "/api/phase1/sign-in",
    {
      method: "POST",
      status: 503,
      headers: { Origin: origin.origin, "Content-Type": "application/json" },
      body: "{}",
    },
  );
  await check("Sign-in GET unavailable", "/api/phase1/sign-in", {
    status: 405,
  });
  const project = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!project || !key?.startsWith("sb_publishable_"))
    throw new Error(
      "Load publishable project configuration for provider checks.",
    );
  async function provider(name, path, expected, headers = {}, method = "GET") {
    const response = await fetch(new URL(path, project), {
      method,
      headers: { apikey: key, ...headers },
      ...(method === "POST" ? { body: "{}" } : {}),
      signal: AbortSignal.timeout(20000),
    });
    assert.ok(
      expected.includes(response.status),
      `${name}: unexpected status ${response.status}`,
    );
    checks.push({
      name,
      status: response.status,
      scope: "real Supabase provider",
    });
    if (name === "Auth provider rejects forged JWT") {
      const body = await response.json();
      assert.equal(body.error_code, "bad_jwt", "Auth denial must identify an invalid JWT");
      checks[checks.length - 1].errorCode = body.error_code;
    } else await response.body?.cancel();
  }
  const invalidJwt = [
    { alg: "HS256", typ: "JWT" },
    {
      sub: "742f14ec-f904-4d63-9ce9-13e82e128b30",
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    "invalid-signature",
  ]
    .map((x) =>
      Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString(
        "base64url",
      ),
    )
    .join(".");
  await provider("Auth provider reachable", "/auth/v1/health", [200]);
  await provider("Auth provider rejects forged JWT", "/auth/v1/user", [401, 403], {
    Authorization: `Bearer ${invalidJwt}`,
  });
  await provider(
    "Private schema remains unexposed",
    "/rest/v1/cases?select=case_id&limit=1",
    [406],
    { "Accept-Profile": "synapse" },
  );
  await provider(
    "Anonymous cannot execute registry RPC",
    "/rest/v1/rpc/synapse_phase1_cases",
    [401, 403],
    { "Content-Type": "application/json" },
    "POST",
  );
  await provider(
    "Data API rejects forged JWT",
    "/rest/v1/rpc/synapse_phase1_cases",
    [401],
    {
      "Content-Type": "application/json",
      Authorization: `Bearer ${invalidJwt}`,
    },
    "POST",
  );
  await mkdir("docs/phase1", { recursive: true });
  await writeFile(
    "docs/phase1/http-results.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        environment:
          "delivered app gate disabled; real provider negative probes; no activation performed",
        positiveAuthSessionVerified: false,
        enabledPreviewHttpVerified: false,
        checks,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `${checks.length} locked-app/provider checks passed. Enabled-preview HTTP and positive issued-JWT sessions remain unverified.`,
  );
  process.exit(0);
}
await check("Unauthenticated case list", "/api/phase1/cases");
await check("Unauthenticated identity", "/api/phase1/session");
await check("Demo role cookie cannot authenticate", "/api/phase1/cases", {
  headers: { Cookie: "synapse.demo.role=Supervisor; synapse.demo.v1=forged" },
});
await check("Browser actor headers cannot authenticate", "/api/phase1/cases", {
  headers: {
    "x-user-id": "administrator",
    "x-role": "Supervisor",
    Authorization: "Bearer invalid-browser-token",
  },
});
const fakeJwt = [
  { alg: "HS256", typ: "JWT" },
  {
    sub: "742f14ec-f904-4d63-9ce9-13e82e128b30",
    role: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
  },
  "not-a-valid-signature",
]
  .map((x) =>
    Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString(
      "base64url",
    ),
  )
  .join(".");
const session = {
  access_token: fakeJwt,
  refresh_token: "invalid-test-only-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: "742f14ec-f904-4d63-9ce9-13e82e128b30",
    user_metadata: { role: "Supervisor" },
  },
};
const cookie =
  "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
await check("Forged Auth cookie is rejected", "/api/phase1/cases", {
  headers: { Cookie: `synapse-phase1-session=${cookie}` },
});
for (const query of [
  "actor=admin",
  "role=Supervisor",
  "page=1&page=2",
  "pageSize=1000",
  "status=RESOLUTION_REVIEW",
  "priority=Medium",
])
  await check(
    `Invalid query rejected: ${query}`,
    "/api/phase1/cases?" + query,
    { status: 400 },
  );
await check("Case POST unavailable", "/api/phase1/cases", {
  method: "POST",
  status: 405,
});
await check("Case PATCH unavailable", "/api/phase1/cases", {
  method: "PATCH",
  status: 405,
});
await check("Cross-origin sign-in denied", "/api/phase1/sign-in", {
  method: "POST",
  headers: {
    Origin: "https://untrusted.example",
    "Content-Type": "application/json",
  },
  body: "{}",
  status: 403,
});
await check("Missing-origin sign-in denied", "/api/phase1/sign-in", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
  status: 403,
});
await check("Non-JSON sign-in denied", "/api/phase1/sign-in", {
  method: "POST",
  headers: { Origin: origin.origin, "Content-Type": "text/plain" },
  body: "{}",
  status: 415,
});
await check("Malformed sign-in denied", "/api/phase1/sign-in", {
  method: "POST",
  headers: { Origin: origin.origin, "Content-Type": "application/json" },
  body: "{invalid",
  status: 400,
});
await check("Oversized sign-in denied", "/api/phase1/sign-in", {
  method: "POST",
  headers: { Origin: origin.origin, "Content-Type": "application/json" },
  body: JSON.stringify({ password: "x".repeat(5000) }),
  status: 413,
});
await check("Client-selected sign-in role denied", "/api/phase1/sign-in", {
  method: "POST",
  headers: { Origin: origin.origin, "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "invalid-test@example.invalid",
    password: "not-a-real-password",
    role: "Supervisor",
  }),
  status: 400,
});
await check("Cross-origin sign-out denied", "/api/phase1/sign-out", {
  method: "POST",
  headers: { Origin: "https://untrusted.example" },
  status: 403,
});
await check("Sign-in GET unavailable", "/api/phase1/sign-in", { status: 405 });
await mkdir("docs/phase1", { recursive: true });
const report = {
  checkedAt: new Date().toISOString(),
  environment:
    "read-preview HTTP test process; app mode unchanged; database gate remains false",
  positiveAuthSessionVerified: false,
  checks,
};
await writeFile(
  "docs/phase1/http-results.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  `${checks.length} HTTP security checks passed. No positive issued-JWT session is claimed.`,
);
