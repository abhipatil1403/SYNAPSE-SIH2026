import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-26T09:00:00Z"));
});
test("quick calendar navigates months, selects a day, opens an event and preserves full Calendar selection", async ({
  page,
}) => {
  await page.goto("/dashboard");
  const calendar = page.locator(".quick-calendar-card");
  await expect(
    calendar.getByRole("heading", { name: "October 2026" }),
  ).toBeVisible();
  await calendar
    .getByRole("button", { name: "Previous month", exact: true })
    .click();
  await expect(
    calendar.getByRole("heading", { name: "September 2026" }),
  ).toBeVisible();
  await calendar
    .getByRole("button", { name: "Next month", exact: true })
    .click();
  await calendar.getByRole("button", { name: "Today", exact: true }).click();
  await expect(
    calendar.getByRole("button", { name: /^26 October 2026,/ }),
  ).toHaveAttribute("aria-current", "date");
  await expect(
    calendar.getByRole("button", { name: /^26 October 2026,/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(calendar.locator(".quick-agenda")).toContainText(
    "No events scheduled",
  );
  await calendar.getByRole("button", { name: /^27 October 2026,/ }).click();
  await expect(calendar.locator(".quick-agenda")).toContainText(
    "Unapproved intake expansion",
  );
  await calendar
    .locator(".quick-agenda")
    .getByRole("link", { name: /Unapproved intake expansion/ })
    .click();
  await expect(page).toHaveURL(/complaints\/SYN-2026-1041/);
  await page.goto("/dashboard");
  await calendar.getByRole("button", { name: /^27 October 2026,/ }).click();
  await calendar
    .getByRole("link", { name: "Open Full Calendar", exact: true })
    .click();
  await expect(page).toHaveURL(/calendar\?date=2026-10-27/);
  await expect(page.locator(".calendar-toolbar h2")).toHaveText("October 2026");
  await expect(
    page.locator(".calendar-day[aria-pressed=true]"),
  ).toHaveAttribute("data-calendar-day", "2026-10-27");
  await expect(page.locator(".calendar-rail .card").first()).toContainText(
    "Unapproved intake expansion",
  );
});
test("calendar date arithmetic crosses December and supports keyboard navigation", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-12-31T09:00:00Z"));
  await page.goto("/dashboard");
  const calendar = page.locator(".quick-calendar-card");
  await calendar
    .getByRole("button", { name: "Next month", exact: true })
    .click();
  await expect(
    calendar.getByRole("heading", { name: "January 2027" }),
  ).toBeVisible();
  const selected = calendar.locator(".quick-calendar-day[aria-pressed=true]");
  await expect(selected).toHaveAttribute("data-calendar-day", "2027-01-01");
  await selected.focus();
  await selected.press("ArrowRight");
  await expect(calendar.locator(".quick-calendar-day:focus")).toHaveAttribute(
    "data-calendar-day",
    "2027-01-02",
  );
  await calendar.getByRole("button", { name: "Today", exact: true }).click();
  await expect(
    calendar.getByRole("heading", { name: "December 2026" }),
  ).toBeVisible();
});
test("Overview calendar honors role scope and chart filters reconcile without artificial zero bars", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await page
    .getByRole("combobox", { name: "Demo role" })
    .selectOption("Case Officer");
  const calendar = page.locator(".quick-calendar-card");
  await calendar.getByRole("button", { name: /^28 October 2026,/ }).click();
  await expect(calendar.locator(".quick-agenda")).not.toContainText(
    "SYN-2026-1042",
  );
  await page
    .getByRole("combobox", { name: "Dashboard chart period" })
    .selectOption("7D");
  await expect(page.locator(".bar-chart")).toHaveAttribute("aria-label", /7D/);
  await page
    .getByRole("combobox", { name: "Dashboard chart series" })
    .selectOption("Resolved");
  await expect(page.locator(".bar-chart")).toHaveAttribute(
    "aria-label",
    /^Resolved counts/,
  );
  await page.getByRole("combobox", { name: "Demo role" }).selectOption("Admin");
  await expect(calendar.locator(".quick-agenda-event")).toHaveCount(0);
});
test("refined Overview is readable, compact and responsive, with reduced-motion support", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [width, height] of [
    [1763, 1163],
    [1536, 1024],
    [1366, 900],
    [1440, 900],
    [768, 1024],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/dashboard");
    await expect(page.locator(".quick-calendar-card")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState("networkidle");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Overflow at ${width}`,
    ).toBeTruthy();
    if (width <= 760) {
      const widths = await page
        .locator(".overview-dashboard .dashboard-grid > .card")
        .evaluateAll((cards) =>
          cards.map((card) => card.getBoundingClientRect().width),
        );
      expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(2);
    }
    expect(
      await page
        .locator(".overview-dashboard .metric > strong")
        .first()
        .evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
    ).toBeGreaterThanOrEqual(40);
    await expect(page.locator(".overview-dashboard .metric").first()).toHaveCSS(
      "animation-name",
      "none",
    );
    if (width >= 1366) {
      expect(
        await page
          .locator(".recharts-bar-rectangle path")
          .evaluateAll((paths) =>
            Math.max(...paths.map((p) => p.getBoundingClientRect().width)),
          ),
      ).toBeGreaterThan(45);
      expect(
        await page
          .locator(".overview-dashboard")
          .evaluate((e) => e.getBoundingClientRect().height),
      ).toBeLessThan(1450);
    }
    await page.screenshot({
      path: `docs/screenshots/overview-refined-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
});
