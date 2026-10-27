import { test, expect } from "@playwright/test";

test("Phase 1 is locked by default, never hydrates Demo Mode, and accepts no case writes", async ({
  page,
  request,
}) => {
  await page.goto("/live-preview");
  await expect(
    page.getByRole("heading", { name: "Read-only preview is locked" }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Demo role" })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(() => localStorage.getItem("synapse.demo.v1")),
  ).toBeNull();
  const cases = await request.get("/api/phase1/cases");
  expect(cases.status()).toBe(503);
  expect(cases.headers()["cache-control"]).toContain("no-store");
  expect((await cases.json()).error.code).toBe("preview_locked");
  expect(
    (
      await request.post("/api/phase1/cases", { data: { actor: "Supervisor" } })
    ).status(),
  ).toBe(405);
  await page.screenshot({
    path: "docs/screenshots/phase1-preview-locked.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("link", { name: "Demo workspace", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
});

// UI-only contract fixtures. These do not substitute for Auth/RLS/database verification.
test("read-only registry UI handles authenticated contract, filters, pagination and sign-out", async ({
  page,
}) => {
  let signedIn = false;
  const identity = {
    internalUserId: "742f14ec-f904-4d63-9ce9-13e82e128b30",
    displayName: "UI contract fixture",
    roleCodes: ["CASE_OFFICER"],
    readOnly: true,
  };
  const requests: string[] = [];
  await page.route("**/api/phase1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/sign-in")) {
      signedIn = true;
      await route.fulfill({ json: { identity, readOnly: true } });
      return;
    }
    if (url.pathname.endsWith("/sign-out")) {
      signedIn = false;
      await route.fulfill({ json: { signedOut: true } });
      return;
    }
    if (!signedIn) {
      await route.fulfill({
        status: 401,
        json: {
          error: {
            code: "authentication_required",
            message: "Sign in to the read-only preview.",
          },
        },
      });
      return;
    }
    requests.push(url.search);
    const pageNumber = Number(url.searchParams.get("page") ?? 1);
    const empty = url.searchParams.get("q") === "no-match";
    const rows = empty
      ? []
      : Array.from({ length: pageNumber === 1 ? 20 : 1 }, (_, i) => ({
          id: `742f14ec-f904-4d63-9ce9-${String(i + pageNumber * 100).padStart(12, "0")}`,
          caseNumber: String(1000 + pageNumber * 20 + i),
          subject: `Contract test complaint ${pageNumber}-${i + 1}`,
          statusCode: "UNDER_REVIEW",
          priorityCode: "URGENT",
          institution: "UI fixture institution",
          city: null,
          bureau: "Authorized Bureau",
          category: "Compliance",
          officerId: identity.internalUserId,
          receivedAt: "2026-10-26T09:00:00Z",
          updatedAt: "2026-10-26T09:00:00Z",
          version: "1",
          dueAt: null,
        }));
    await route.fulfill({
      json: {
        identity,
        items: rows,
        total: empty ? 0 : 21,
        page: pageNumber,
        pageSize: 20,
        readOnly: true,
      },
    });
  });
  await page.goto("/live-preview");
  await page
    .getByLabel("Email", { exact: true })
    .fill("ui-fixture@example.invalid");
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-only-not-a-real-account");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "21 authorized cases" }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Under review", exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Urgent", exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Not configured", exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Register|Dispose|Export/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: /Contract test complaint 2-1/ }),
  ).toBeVisible();
  expect(requests.some((q) => q.includes("page=2"))).toBeTruthy();
  await page
    .getByRole("combobox", { name: "Priority", exact: true })
    .selectOption("URGENT");
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("UNDER_REVIEW");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(
    page.getByText("Contract test complaint 1-1", { exact: true }),
  ).toBeVisible();
  expect(
    requests.some(
      (q) =>
        q.includes("priority=URGENT") &&
        q.includes("status=UNDER_REVIEW") &&
        q.includes("page=1"),
    ),
  ).toBeTruthy();
  await page.getByLabel("Search cases", { exact: true }).fill("no-match");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(
    page.getByRole("heading", { name: "No authorized cases match" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to your account" }),
  ).toBeVisible();
  await expect(
    page.getByText("UI contract fixture", { exact: true }),
  ).toHaveCount(0);
});

test("registry UI clears private results when subsequent authorization is revoked", async ({
  page,
}) => {
  let revoked = false;
  await page.route("**/api/phase1/cases**", async (route) => {
    if (revoked) {
      await route.fulfill({
        status: 403,
        json: {
          error: {
            code: "account_not_enabled",
            message: "Your account is not enabled for this preview.",
          },
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        identity: {
          internalUserId: "742f14ec-f904-4d63-9ce9-13e82e128b30",
          displayName: "UI contract fixture",
          roleCodes: ["AUDITOR"],
          readOnly: true,
        },
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        readOnly: true,
      },
    });
  });
  await page.goto("/live-preview");
  await expect(
    page.getByRole("heading", { name: "0 authorized cases" }),
  ).toBeVisible();
  revoked = true;
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(
    page.getByRole("heading", { name: "Case access unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Authorized case registry" }),
  ).toHaveCount(0);
});
