import { test, expect } from "@playwright/test";
test("readiness reports unresolved security evidence without revealing identities", async ({
  page,
  request,
}) => {
  const r = await request.get("/api/phase1/readiness");
  expect(r.status()).toBe(200);
  expect(r.headers()["cache-control"]).toContain("no-store");
  const body = await r.json();
  expect(body.safeToActivateReadPreview).toBe(false);
  const unresolved = body.checks.find((c: { id: string; status: string }) => c.status !== "pass");
  expect(unresolved).toBeTruthy();
  expect(JSON.stringify(body)).not.toMatch(
    /gmail|access_token|refresh_token|postgresql:\/\//i,
  );
  await page.goto("/live-preview");
  await page.getByText("Live-readiness checklist", { exact: true }).click();
  await page.getByRole("button", { name: "Run readiness checks" }).click();
  await expect(
    page.getByText(`${unresolved.status.toUpperCase()} · ${unresolved.id.replaceAll("_", " ")}`, { exact: true }),
  ).toBeVisible();
  await page.screenshot({path:'docs/screenshots/phase2-readiness.png',fullPage:true,animations:'disabled'});
});
test("session refresh is protected and logout can clear an absent session while preview is locked", async ({
  request,
}) => {
  expect(
    (
      await request.post("/api/phase1/refresh", {
        headers: { Origin: "http://localhost:3000" },
      })
    ).status(),
  ).toBe(503);
  expect((await request.get("/api/phase1/refresh")).status()).toBe(405);
  const cross = await request.post("/api/phase1/sign-out", {
    headers: { Origin: "https://attacker.invalid" },
  });
  expect(cross.status()).toBe(403);
  const logout = await request.post("/api/phase1/sign-out", {
    headers: { Origin: "http://localhost:3000" },
  });
  expect(logout.status()).toBe(200);
  expect((await logout.json()).signedOut).toBe(true);
  const cookies = logout
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value)
    .join("\n");
  expect(cookies).toMatch(/HttpOnly/i);
  expect(cookies).toMatch(/Max-Age=0/i);
  expect(cookies).toMatch(/Path=\/api\/phase1/i);
});
