import { test, expect } from "@playwright/test";

/**
 * Core demo smoke: empty studio → sample brief → plan → canvas → run.
 * Always runs against AI_MODE=demo (see playwright.config.ts).
 */
test("demo path: plan sample brief, run workflow, see execution", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Flow Copilot" }),
  ).toBeVisible();
  await expect(page.getByTestId("mode-badge")).toContainText(/Demo engine/i, {
    timeout: 20_000,
  });
  await expect(page.getByTestId("app-footer")).toContainText(
    /Creative workflow studio/i,
  );

  await page.getByTestId("empty-sample-sneaker-launch").click();
  await expect(page.getByTestId("brief-composer")).toBeVisible();
  await page.getByTestId("plan-workflow").click();

  await expect(page.getByTestId("brief-composer")).toBeHidden({
    timeout: 30_000,
  });
  await expect(page.getByTestId("workflow-canvas")).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: /Run workflow/i }).click();
  await expect(page.getByTestId("execution-drawer")).toBeVisible();
  await expect(page.getByTestId("execution-strip-summary")).not.toHaveText(
    /Idle — run a workflow/i,
    { timeout: 60_000 },
  );
});
