import { test, expect } from "@playwright/test";

test("view-output during run does not throw", async ({ page }) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error" && /Maximum update depth/i.test(msg.text())) {
      pageErrors.push(msg.text());
    }
  });

  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("mode-badge")).toContainText(/Demo engine/i, {
    timeout: 20_000,
  });
  const dismiss = page.getByTestId("onboarding-dismiss");
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click();
  }

  await page.getByTestId("create-from-brief").click();
  await page.getByTestId("sample-sneaker-launch").click();
  await page.getByTestId("plan-workflow").click();
  await expect(page.getByTestId("workflow-canvas")).toBeVisible({
    timeout: 30_000,
  });

  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Run workflow/i }).click();
  await expect(page.getByTestId("execution-drawer")).toBeVisible();
  if (!(await page.getByTestId("execution-timeline").isVisible().catch(() => false))) {
    await page.getByTestId("execution-drawer-toggle").click();
  }

  await expect(page.locator("[data-testid^=execution-view-]").first()).toBeVisible({
    timeout: 60_000,
  });

  // Click the same View output twice quickly while the run may still be updating.
  const first = page.locator("[data-testid^=execution-view-]").first();
  await first.click({ timeout: 5_000 });
  await page.waitForTimeout(150);
  await first.click({ timeout: 5_000 });
  await page.waitForTimeout(300);

  const second = page.locator("[data-testid^=execution-view-]").nth(1);
  if (await second.isVisible().catch(() => false)) {
    await second.click({ timeout: 5_000 });
    await page.waitForTimeout(200);
    await second.click({ timeout: 5_000 });
  }

  await expect(page.getByTestId("workflow-canvas")).toBeVisible();
  expect(pageErrors, pageErrors.join("\n---\n")).toEqual([]);
});
