import { test, expect } from "@playwright/test";

test("officer auth forms are separate from Demo Mode and usable at desktop/mobile widths", async ({ page }) => {
  for (const [path, title] of [["login", "Welcome back"], ["signup", "Officer registration"], ["forgot-password", "Reset your password"], ["reset-password", "Choose a new password"]]) {
    await page.goto("/" + path); await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Demo role" })).toHaveCount(0);
    await expect(page.getByText("An email account does not grant complaint access.", { exact: false })).toBeVisible();
    for (const width of [1440, 768, 390]) { await page.setViewportSize({ width, height: 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); }
  }
});
test("real unauthenticated routes, CSRF, malformed identity and recovery replay are rejected", async ({ request }) => {
  const protectedPage = await request.get("/officer/dashboard", { maxRedirects: 0 });
  expect(protectedPage.status()).toBe(307); expect(protectedPage.headers().location).toMatch(/\/login$/);
  expect((await request.get("/api/auth/session")).status()).toBe(401);
  const invalidSession = await request.post("/api/auth/refresh", { headers: { Origin: "http://localhost:3000", Cookie: "synapse-auth-session=malformed-test-cookie" }, data: {} });
  expect(invalidSession.status()).toBe(401);
  expect((await invalidSession.json()).error.message).toContain("Sign in again");
  expect(invalidSession.headersArray().filter(h => h.name.toLowerCase() === "set-cookie").map(h => h.value).join("\n")).toMatch(/synapse-auth-session=;[^\n]*Max-Age=0/i);
  expect((await request.get("/api/auth/roles")).status()).toBe(401);
  expect((await request.post("/api/auth/role", { headers: { Origin: "http://localhost:3000" }, data: {
    requestId: "50000000-0000-4000-8000-000000000011", assignmentId: "50000000-0000-4000-8000-000000000012",
    expectedRole: "CASE_OFFICER", expectedUntil: null, revoke: true, reason: "Anonymous role management must be denied",
  } })).status()).toBe(401);
  expect((await request.post("/api/auth/login", { headers: { Origin: "https://attacker.invalid" }, data: {} })).status()).toBe(403);
  expect((await request.post("/api/auth/login", { headers: { Origin: "http://localhost:3000" }, data: { email: "local@example.invalid", password: "not-submitted-to-provider", role: "SYSTEM_ADMIN" } })).status()).toBe(400);
  expect((await request.post("/api/auth/reset-password", { headers: { Origin: "http://localhost:3000" }, data: { password: "unapplied-local-password" } })).status()).toBe(401);
  const callback = await request.get("/auth/callback?next=https://attacker.invalid&type=recovery", { maxRedirects: 0 });
  expect(callback.status()).toBe(303); expect(callback.headers().location).toBe("http://localhost:3000/login?callback=failed");
  expect(callback.headers()["x-synapse-auth-stage"]).toBe("validation");
});
test("client reset confirmation validates locally; provider errors are displayed without false success", async ({ page }) => {
  await page.goto("/reset-password");
  await page.getByLabel("Password", { exact: true }).fill("local-password-one"); await page.getByLabel("Confirm password", { exact: true }).fill("local-password-two");
  await page.getByRole("button", { name: "Update password" }).click(); await expect(page.locator(".auth-card").getByRole("alert")).toHaveText("The passwords do not match.");
  await page.getByLabel("Confirm password", { exact: true }).fill("local-password-one"); await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.locator(".auth-card").getByRole("alert")).toContainText("Sign in with your email and password.");
});
