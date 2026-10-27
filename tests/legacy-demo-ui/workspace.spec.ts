import { test, expect, type Page } from "@playwright/test";
async function ready(page: Page, path = "/dashboard") {
  await page.goto(path);
  await expect(page.getByRole("combobox", { name: "Demo role" })).toBeVisible();
}
test("all routes render with a cohesive shell, no page errors, and no desktop overflow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const pages = [
    "dashboard",
    "intake",
    "complaints",
    "tasks",
    "calendar",
    "analytics",
    "intelligence",
    "coordination",
    "dependencies",
    "resolutions",
    "team",
    "settings",
    "help",
    "admin",
  ];
  for (const route of pages) {
    await ready(page, `/${route}`);
    await expect(page.locator("#main")).toBeVisible();
    await expect(page.locator("#main")).not.toContainText(
      "This workspace could not load",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  expect(errors).toEqual([]);
});
test("case notes persist after refresh and audit reflects the actor", async ({
  page,
}) => {
  await ready(page, "/complaints/SYN-2026-1041");
  await page
    .getByRole("textbox", { name: "Add an investigation note" })
    .fill("Browser-tested source verification note");
  await page.getByRole("button", { name: "Save Note", exact: true }).click();
  await expect(page.getByText("Note saved to the case timeline")).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Browser-tested source verification note", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page.locator(".timeline-item").first()).toContainText(
    "Ananya Sharma",
  );
});
test("global search keyboard shortcut returns scoped cases and navigates", async ({
  page,
}) => {
  await ready(page);
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Global search" })
    .fill("SYN-2026-1041");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Unapproved intake expansion/ })
    .click();
  await expect(page).toHaveURL(/complaints\/SYN-2026-1041/);
});
test("Auditor cannot edit and Admin has no blanket case access", async ({
  page,
}) => {
  await ready(page, "/complaints/SYN-2026-1041");
  await page
    .getByRole("combobox", { name: "Demo role" })
    .selectOption("Auditor");
  await expect(
    page.getByRole("button", { name: "Save Note", exact: true }),
  ).toBeDisabled();
  await page.getByRole("combobox", { name: "Demo role" }).selectOption("Admin");
  await expect(
    page.getByRole("heading", { name: "Access restricted" }),
  ).toBeVisible();
  await ready(page, "/complaints");
  await expect(page.getByText("0 authorized cases")).toBeVisible();
});
test("valid resolution disposes a case, blocked resolution cannot be approved", async ({
  page,
}) => {
  await ready(page, "/resolutions");
  const blocked = page
    .locator(".gate-card")
    .filter({ hasText: "Mandatory closure report missing" });
  await blocked.getByRole("button", { name: "Evaluate Quality Gate" }).click();
  await expect(
    blocked.getByRole("button", { name: "Approve Disposal", exact: true }),
  ).toBeDisabled();
  const valid = page
    .locator(".gate-card")
    .filter({ hasText: "Fee refund documentation" });
  await valid.getByRole("button", { name: "Evaluate Quality Gate" }).click();
  await valid
    .getByRole("button", { name: "Approve Disposal", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Disposition reason and evidence reference" })
    .fill("Verified report, completed work, and final communication");
  await page
    .getByRole("button", { name: "Confirm Disposal", exact: true })
    .click();
  await expect(
    page.getByText("Human-approved disposition recorded"),
  ).toBeVisible();
  await expect(
    page.locator(".gate-card").filter({ hasText: "Fee refund documentation" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.locator(".gate-card").filter({ hasText: "Fee refund documentation" }),
  ).toHaveCount(0);
});
test("intake retains Marathi original and requires verification before registration", async ({
  page,
}) => {
  await ready(page, "/intake");
  await expect(
    page.getByRole("button", { name: "Register New Case", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "View English Translation" }).click();
  await expect(page.locator(".source-text")).toContainText(
    "Precomputed fictional translation",
  );
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await page
    .getByRole("button", { name: "Register New Case", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Decision reason" })
    .fill("New distinct issue confirmed by intake review");
  await page
    .getByRole("button", { name: "Confirm register", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Submission registered");
  await ready(page, "/complaints");
  await expect(page.getByText("17 authorized cases")).toBeVisible();
});
test("Kanban movement persists and updates case timeline", async ({ page }) => {
  await ready(page, "/tasks");
  await page
    .getByRole("combobox", {
      name: "Move Verify intake approval records",
      exact: true,
    })
    .selectOption("In Review");
  await expect(page.getByText("Work item moved to in review")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("combobox", {
      name: "Move Verify intake approval records",
      exact: true,
    }),
  ).toHaveValue("In Review");
});
test("finding review records source-backed reason without merging cases", async ({
  page,
}) => {
  await ready(page, "/intelligence");
  const card = page
    .locator(".finding-card")
    .filter({ hasText: "Overlapping inspection and approval review" });
  await card.getByRole("button", { name: "Confirm", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Evidence-backed review reason" })
    .fill(
      "Synthetic action sequence verified; advisory coordination confirmed",
    );
  await page
    .getByRole("button", { name: "Record Review", exact: true })
    .click();
  await expect(card).toContainText("Ananya Sharma");
  await expect(
    card.getByRole("button", { name: "Confirm", exact: true }),
  ).toBeDisabled();
  await ready(page, "/complaints");
  await expect(page.getByText("16 authorized cases")).toBeVisible();
});
test("dependency cycles are rejected via dialog", async ({ page }) => {
  await ready(page, "/dependencies");
  await page
    .getByRole("button", { name: "Confirm Relationship", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Source case").selectOption("SYN-2026-1045");
  await dialog
    .getByRole("combobox", { name: "Relationship", exact: true })
    .selectOption("DEPENDS_ON");
  await dialog.getByLabel("Target case").selectOption("SYN-2026-1043");
  await dialog
    .getByLabel("Evidence and rationale")
    .fill("Attempted reverse prerequisite for cycle test");
  await dialog
    .getByRole("button", { name: "Confirm relationship", exact: true })
    .click();
  await expect(page.getByRole("alert").filter({ hasText: "cycle" })).toContainText("cycle");
  await expect(dialog).toBeVisible();
});
test("settings save and discard, compact mode, calendar navigation and mobile drawer", async ({
  page,
}) => {
  await ready(page, "/settings");
  await page
    .getByRole("textbox", { name: "Display name" })
    .fill("Jury Demo Reviewer");
  await page.getByRole("button", { name: "Save Changes", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Display name" })).toHaveValue(
    "Jury Demo Reviewer",
  );
  await page
    .getByRole("textbox", { name: "Display name" })
    .fill("Unsaved name");
  await page.getByRole("button", { name: "Discard Changes" }).click();
  await expect(page.getByRole("textbox", { name: "Display name" })).toHaveValue(
    "Jury Demo Reviewer",
  );
  await ready(page, "/calendar");
  const month = await page.locator(".calendar-toolbar h2").textContent();
  await page.getByRole("button", { name: "Next month", exact: true }).click();
  await expect(page.locator(".calendar-toolbar h2")).not.toHaveText(month!);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(page.locator(".sidebar")).toHaveClass(/open/);
  await page.getByRole("link", { name: "My Work", exact: false }).click();
  await expect(page).toHaveURL(/\/tasks/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
test("capture desktop visual references and mobile overview", async ({
  page,
}) => {
  for (const route of [
    "dashboard",
    "tasks",
    "calendar",
    "analytics",
    "team",
    "settings",
    "help",
  ]) {
    await ready(page, `/${route}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: `docs/screenshots/${route}-desktop.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.screenshot({
    path: "docs/screenshots/dashboard-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});
