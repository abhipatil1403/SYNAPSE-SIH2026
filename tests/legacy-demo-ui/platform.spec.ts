import { test, expect } from "@playwright/test";
import { PlatformEngine, MemoryTransactionStore } from "../../lib/platform/engine";
import { PlatformError } from "../../lib/platform/contracts";
import { platformFixture, principal, fixtureId, now } from "../fixtures/platform";

test("platform stays locked, rejects live writes and never hydrates Demo identity", async ({ page, request }) => {
  await page.goto("/platform");
  await expect(page.getByRole("heading", { name: "Platform activation is blocked" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("synapse.demo.v1"))).toBeNull();
  expect(await page.getByRole("combobox", { name: "Demo role" }).count()).toBe(0);
  for (const path of ["snapshot", "dashboard", "calendar", "cases", "cases/" + fixtureId(21), "reports"])
    expect((await request.get("/api/phase1/platform/" + path)).status()).toBe(503);
  const write = await request.post("/api/phase1/platform/commands", { data: { actor: "Admin", type: "dispose" }, headers: { "x-enable-live": "true" } });
  expect(write.status()).toBe(503); expect((await write.json()).error.code).toBe("business_writes_locked");
  await page.getByRole("link", { name: "Open working Demo Mode" }).click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
});

test("MOCKED platform UI uses the real isolated engine for filtering, detail commands, shared calendar and dashboard refresh", async ({ page }) => {
  await page.clock.setFixedTime(new Date(now));
  const engine = new PlatformEngine(new MemoryTransactionStore(platformFixture()), () => now);
  await page.route("**/api/phase1/platform/**", async (route) => {
    try {
      const body = route.request().method() === "POST" ? await engine.execute(principal(), route.request().postDataJSON()) : await engine.snapshot(principal());
      await route.fulfill({ json: body, headers: { "X-Synapse-Data-Source": "MOCKED - isolated engine fixture", "Cache-Control": "no-store" } });
    } catch (error) {
      await route.fulfill({ status: error instanceof PlatformError ? error.status : 400, json: { error: { message: error instanceof Error ? error.message : "Isolated contract failure" } } });
    }
  });
  await page.goto("/platform/cases");
  await expect(page.getByText("MOCKED - isolated engine fixture")).toBeVisible();
  await expect(page.getByText("Isolated complaint 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Isolated complaint 2", { exact: true })).toHaveCount(0);
  await page.getByLabel("Search cases").fill("no-match");
  await expect(page.getByText("No authorized cases match these filters.")).toBeVisible();
  await page.getByLabel("Search cases").fill("");
  await page.getByRole("link", { name: "Isolated complaint 1", exact: true }).click();
  await page.getByLabel("Add accountable comment").fill("Isolated browser review persisted");
  await page.getByRole("button", { name: "Submit", exact: true }).first().click();
  await expect(page.getByText("Isolated browser review persisted", { exact: true })).toBeVisible();
  await expect(page.getByText("Priority: Medium · Version 2", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.getByText("Total Complaints", { exact: true })).toBeVisible();
  await expect(page.getByText("comment.add", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Calendar", exact: true }).click();
  await expect(page).toHaveURL(/\/platform\/calendar$/);
  await expect(page.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next month" }).click();
  await page.getByRole("button", { name: "Previous month" }).click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.getByRole("button", { name: "2026-10-28", exact: true }).click();
  await expect(page.getByRole("link", { name: "Isolated complaint 1", exact: true })).toBeVisible();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});

test("MOCKED verified intake registration updates the registry and Overview from one committed engine", async ({ page }) => {
  await page.clock.setFixedTime(new Date(now));
  const engine = new PlatformEngine(new MemoryTransactionStore(platformFixture()), () => now);
  await page.route("**/api/phase1/platform/**", async (route) => {
    try {
      const data = route.request().method() === "POST" ? await engine.execute(principal(3), route.request().postDataJSON()) : await engine.snapshot(principal(3));
      await route.fulfill({ json: data, headers: { "X-Synapse-Data-Source": "MOCKED - isolated intake engine" } });
    } catch (error) {
      await route.fulfill({ status: error instanceof PlatformError ? error.status : 400, json: { error: { message: error instanceof Error ? error.message : "Fixture validation failed" } } });
    }
  });
  await page.goto("/platform/intake");
  await page.getByLabel("Source reference", { exact: true }).fill("isolated-browser-source-1");
  await page.getByLabel("Original subject", { exact: true }).fill("Browser verified complaint");
  await page.getByLabel("Original complaint", { exact: true }).fill("Original multilingual complaint retained for review");
  await page.getByRole("combobox", { name: "Review Bureau", exact: true }).selectOption(fixtureId(11));
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("combobox", { name: "Draft", exact: true }).selectOption({ label: "Browser verified complaint · DRAFT" });
  await page.getByRole("combobox", { name: "Verified institution", exact: true }).selectOption(fixtureId(13));
  await page.getByRole("button", { name: "Confirm verification", exact: true }).click();
  await expect(page.getByText("en · version 2 · Verified", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Accountable officer", exact: true }).selectOption(fixtureId(1));
  await page.getByRole("combobox", { name: "Case category", exact: true }).selectOption(fixtureId(14));
  await page.getByRole("button", { name: "Register verified complaint", exact: true }).click();
  await page.getByRole("link", { name: "Case registry", exact: true }).click();
  await expect(page.getByRole("link", { name: "Browser verified complaint", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.locator(".platform-kpis .card").filter({ hasText: "Total Complaints" }).getByText("3", { exact: true })).toBeVisible();
});

test("MOCKED platform clears prior records after authorization is lost", async ({ page }) => {
  let revoked = false;
  const engine = new PlatformEngine(new MemoryTransactionStore(platformFixture()), () => now);
  await page.route("**/api/phase1/platform/snapshot", async (route) => {
    if (revoked) await route.fulfill({ status: 401, json: { error: { message: "Authorization revoked" } } });
    else await route.fulfill({ json: await engine.snapshot(principal()) });
  });
  await page.goto("/platform/cases");
  await expect(page.getByText("Isolated complaint 1", { exact: true })).toBeVisible();
  revoked = true; await page.getByRole("button", { name: "Refresh data" }).click();
  await expect(page.getByRole("heading", { name: "Authorized data unavailable" })).toBeVisible();
  await expect(page.getByText("Isolated complaint 1", { exact: true })).toHaveCount(0);
});

test("MOCKED Kanban transition commits through the engine and scoped graph supports filtering and navigation", async ({ page }) => {
  await page.clock.setFixedTime(new Date(now));
  const engine = new PlatformEngine(new MemoryTransactionStore(platformFixture()), () => now);
  await page.route("**/api/phase1/platform/**", async (route) => {
    try { await route.fulfill({ json: route.request().method() === "POST" ? await engine.execute(principal(), route.request().postDataJSON()) : await engine.snapshot(principal()), headers: { "X-Synapse-Data-Source": "MOCKED - isolated workflow fixture" } }); }
    catch { await route.fulfill({ status: 409, json: { error: { message: "Isolated command rejected" } } }); }
  });
  await page.goto("/platform/kanban");
  const card = page.locator("article").filter({ hasText: "Isolated complaint 1" });
  await card.getByLabel("Transition reason").fill("Explicit isolated workflow review");
  await card.getByRole("button", { name: "Apply transition" }).click();
  await expect(card.getByText("NORMAL · Version 2", { exact: true })).toBeVisible();
  expect((await engine.snapshot(principal())).cases.find((c) => c.id === fixtureId(21))?.status).toBe("ASSIGNED");
  await page.getByRole("link", { name: "Relationship graph", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Authorized case relationship graph" })).toBeVisible();
  await expect(page.locator(".react-flow__node").filter({ hasText: "Isolated complaint 2" })).toHaveCount(0);
  await page.locator(".react-flow__node").filter({ hasText: "Isolated complaint 1" }).click();
  await expect(page.getByRole("link", { name: "Open authorized case" })).toHaveAttribute("href", "/platform/cases/" + fixtureId(21));
  await page.getByLabel("Filter graph").fill("no matching case");
  await expect(page.getByText("No authorized graph nodes match this filter.")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
