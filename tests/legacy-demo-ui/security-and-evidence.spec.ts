import { test, expect } from "@playwright/test";
test("separate DETAILS and DOCUMENTS access requests enforce document isolation", async ({
  page,
}) => {
  await page.goto("/coordination");
  const role = page.getByRole("combobox", { name: "Demo role" });
  await role.selectOption("Case Officer");
  let row = page
    .locator(".access-panel .coord-case")
    .filter({ hasText: "SYN-2026-1042" });
  await row
    .getByRole("button", { name: "Request Access", exact: true })
    .click();
  await page
    .getByLabel("Purpose and justification")
    .fill("Review related institutional context without documents");
  await page
    .getByRole("button", { name: "Submit Request", exact: true })
    .click();
  await role.selectOption("Supervisor");
  let request = page
    .locator(".access-panel .transfer-item")
    .filter({ hasText: "SYN-2026-1042 · DETAILS" });
  await request
    .getByRole("button", { name: "Approve Scope", exact: true })
    .click();
  await page
    .getByLabel("Decision reason", { exact: true })
    .fill("Purpose verified, details scope approved");
  await page
    .getByRole("button", { name: "Record Decision", exact: true })
    .click();
  await role.selectOption("Case Officer");
  await page.goto("/complaints/SYN-2026-1042");
  await page.getByRole("button", { name: "Evidence", exact: true }).click();
  await expect(
    page.getByText("Case details do not grant document access.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Read Source", exact: true }),
  ).toHaveCount(0);
  await page.goto("/coordination");
  row = page
    .locator(".access-panel .coord-case")
    .filter({ hasText: "SYN-2026-1042" });
  await row.getByRole("button", { name: "Request Scope", exact: true }).click();
  await page.getByLabel("Access scope").selectOption("DOCUMENTS");
  await page
    .getByLabel("Purpose and justification")
    .fill("Review the two versioned faculty source documents");
  await page
    .getByRole("button", { name: "Submit Request", exact: true })
    .click();
  await role.selectOption("Supervisor");
  request = page
    .locator(".access-panel .transfer-item")
    .filter({ hasText: "SYN-2026-1042 · DOCUMENTS" });
  await request
    .getByRole("button", { name: "Approve Scope", exact: true })
    .click();
  await page
    .getByLabel("Decision reason", { exact: true })
    .fill("Source review approved with expiry");
  await page
    .getByRole("button", { name: "Record Decision", exact: true })
    .click();
  await role.selectOption("Case Officer");
  await page.goto("/complaints/SYN-2026-1042");
  await page.getByRole("button", { name: "Evidence", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Read Source", exact: true }),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Read Source", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText("24 full-time faculty");
});
test("text evidence is hashed, retained across refresh and downloadable", async ({
  page,
}) => {
  await page.goto("/complaints/SYN-2026-1041");
  await page.getByRole("button", { name: "Evidence", exact: true }).click();
  await page.getByRole("button", { name: "Add Evidence", exact: true }).click();
  await page
    .getByLabel("Evidence file")
    .setInputFiles({
      name: "jury-investigation.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "Fictional jury evidence with source context and human verification.",
      ),
    });
  await page.getByLabel("This is the mandatory investigation report").check();
  await page
    .getByRole("button", { name: "Confirm Action", exact: true })
    .click();
  await expect(
    page.getByText("Evidence version saved locally; prior versions preserved"),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Evidence", exact: true }).click();
  const row = page
    .locator(".evidence-row")
    .filter({ hasText: "jury-investigation.txt" });
  await row.getByRole("button", { name: "Read Source", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Fictional jury evidence",
  );
  await expect(page.locator(".evidence-meta")).toContainText(/[a-f0-9]{64}/);
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download Text", exact: true })
    .click();
  expect((await downloaded).suggestedFilename()).toBe("jury-investigation.txt");
});
test("desktop breakpoints and mobile routes avoid document overflow", async ({
  page,
}) => {
  for (const width of [1366, 1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1024 });
    for (const route of [
      "dashboard",
      "complaints",
      "calendar",
      "dependencies",
      "resolutions",
    ]) {
      await page.goto(`/${route}`);
      await expect(
        page.getByRole("combobox", { name: "Demo role" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${route} at ${width}`,
      ).toBeTruthy();
    }
  }
});
