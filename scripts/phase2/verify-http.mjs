import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import {
  operatorContext,
  approvedPlan,
  safeMain,
  writeReport,
  projectRef,
} from "./operator.mjs";
import { loadVault } from "./vault.mjs";
import { withReadLease } from "./lease.mjs";
safeMain(async () => {
  const base =
    process.env.SYNAPSE_PHASE2_TEST_ORIGIN ?? "http://localhost:3001";
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw Error("Controlled HTTP verifier accepts loopback only.");
  if (!process.argv.includes("--controlled-read"))
    throw Error(
      "Explicit --controlled-read required for the short operator test lease.",
    );
  const { plan, digest } = await approvedPlan();
  const vault = await loadVault(`.local/phase2/${plan.runId}.vault`);
  if (vault.approvalDigest !== digest || !vault.fixtures)
    throw Error("Approved provisioned accounts and fixtures required.");
  const { db } = await operatorContext();
  const checks = [];
  let browser;
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
    await withReadLease(
      db,
      vault.accounts.map((a) => a.authUserId),
      async () => {
        const contexts = [];
        try {
          for (const account of vault.accounts) {
            const context = await browser.newContext({ baseURL: base });
            contexts.push(context);
            const response = await context.request.post("/api/phase1/sign-in", {
              headers: { Origin: new URL(base).origin },
              data: { email: account.email, password: account.password },
            });
            assert.equal(response.status(), 200);
            const body = await response.json();
            assert.equal(body.identity.internalUserId, account.internalUserId);
            assert.ok(!("session" in body));
            const cookies = await context.cookies(base + "/api/phase1/cases");
            assert.ok(
              cookies.length &&
                cookies.every(
                  (c) =>
                    c.httpOnly &&
                    c.sameSite === "Lax" &&
                    c.path === "/api/phase1",
                ),
            );
            const page = await context.newPage();
            await page.goto(base + "/live-preview");
            await page
              .getByRole("region", { name: "Authorized case registry" })
              .waitFor();
            const own = vault.fixtures.cases.find(
                (c) => c.slot === account.slot,
              ),
              other = vault.fixtures.cases.find((c) => c.slot !== account.slot);
            await page.getByText(own.subject, { exact: true }).waitFor();
            assert.equal(
              await page.getByText(other.subject, { exact: true }).count(),
              0,
            );
            const list = await context.request.get("/api/phase1/cases");
            assert.match(list.headers()["cache-control"], /no-store/);
            assert.equal(
              (
                await context.request.post("/api/phase1/cases", {
                  headers: { Origin: new URL(base).origin },
                  data: { type: "dispose" },
                })
              ).status(),
              405,
            );
            assert.equal(
              (
                await context.request.get("/api/phase1/cases?role=Supervisor")
              ).status(),
              400,
            );
            const refresh = await context.request.post("/api/phase1/refresh", {
              headers: { Origin: new URL(base).origin },
            });
            assert.equal(refresh.status(), 200);
            assert.equal(
              (await refresh.json()).identity.internalUserId,
              account.internalUserId,
            );
            assert.equal(
              (
                await context.request.post("/api/phase1/sign-out", {
                  headers: { Origin: "https://attacker.invalid" },
                })
              ).status(),
              403,
            );
          }
          checks.push({
            id: "two_account_cookie_isolation",
            status: "pass",
            detail:
              "Two separate browser cookie jars resolved different approved users and isolated case rows.",
            source: "Actual issued-JWT HTTP and Edge browser test",
          });
          checks.push({
            id: "business_writes_denied",
            status: "pass",
            detail:
              "Business POST returned 405 for both real authenticated officers; browser role injection returned 400.",
            source: "Actual authenticated HTTP checks",
          });
          // Logging out A must not log out B; local cookie cleanup and API protection are checked together.
          const out = await contexts[0].request.post("/api/phase1/sign-out", {
            headers: { Origin: new URL(base).origin },
          });
          assert.equal(out.status(), 200);
          assert.equal(
            (await contexts[0].request.get("/api/phase1/cases")).status(),
            401,
          );
          assert.equal(
            (await contexts[1].request.get("/api/phase1/cases")).status(),
            200,
          );
          await contexts[1].request.post("/api/phase1/sign-out", {
            headers: { Origin: new URL(base).origin },
          });
          checks.push({
            id: "http_refresh_logout",
            status: "pass",
            detail:
              "Both HTTP sessions refreshed; logging out A removed its access while B remained signed in.",
            source: "Actual issued-JWT session Route Handlers",
          });
          for (let i = 0; i < contexts.length; i++) {
            const page = contexts[i].pages()[0];
            const account = vault.accounts[i];
            await page.reload();
            await page.getByLabel("Email", { exact: true }).fill(account.email);
            await page.getByLabel("Password", { exact: true }).fill(account.password);
            await page.getByRole("button", { name: "Sign in", exact: true }).click();
            await page.getByText(vault.fixtures.cases.find((c) => c.slot === account.slot).subject, { exact: true }).waitFor();
            const refreshed = page.waitForResponse((r) => r.url().endsWith("/api/phase1/refresh") && r.request().method() === "POST");
            await page.getByRole("button", { name: "Refresh session", exact: true }).click();
            assert.equal((await refreshed).status(), 200);
            await page.getByRole("button", { name: "Sign out", exact: true }).click();
            await page.getByLabel("Email", { exact: true }).waitFor();
            assert.equal((await contexts[i].request.get("/api/phase1/cases")).status(), 401);
          }
          checks.push({ id: "browser_auth_controls", status: "pass",
            detail: "Both officers signed in using the real form, opened their authorized case list, refreshed and signed out using browser controls.",
            source: "Actual Edge interaction against Supabase-issued sessions" });
        } finally {
          await Promise.allSettled(contexts.map((c) => c.close()));
        }
      },
    );
  } finally {
    await browser?.close();
    await db.end();
    await writeReport("http-session-results.json", {
      version: 1,
      projectRef,
      checkedAt: new Date().toISOString(),
      checks,
    });
  }
  console.log(
    "Actual two-account HTTP/browser session checks passed. No passwords, tokens or private screenshots were written.",
  );
});
