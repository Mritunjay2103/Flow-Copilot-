import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const SCREENSHOT_DIR = path.join(process.cwd(), "docs", "screenshots");

async function shot(page: Page, name: string) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, name),
    fullPage: false,
  });
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 1;
  });
  expect(overflow, "unexpected horizontal scroll").toBe(false);
}

async function skipOnboardingIfPresent(page: Page) {
  const skip = page.getByTestId("onboarding-skip");
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
  }
}

async function sendCopilot(page: Page, message: string) {
  await page.getByRole("tab", { name: "Copilot" }).click().catch(() => {});
  const composer = page.getByTestId("copilot-composer");
  await expect(composer).toBeVisible({ timeout: 10_000 });
  await composer.fill(message);
  await page.getByTestId("copilot-send").click();
  await expect(page.getByTestId("copilot-loading")).toBeHidden({
    timeout: 30_000,
  });
}

test.describe("final recruiter demo audit", () => {
  test("desktop 1440×900 full path", async ({ page, context, browser }) => {
    test.setTimeout(180_000);
    await context.clearCookies();
    await page.addInitScript(() => {
      try {
        if (!sessionStorage.getItem("__hexflow_audit_cleared")) {
          localStorage.clear();
          sessionStorage.setItem("__hexflow_audit_cleared", "1");
        }
      } catch {
        /* ignore */
      }
    });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.getByTestId("mode-badge")).toContainText(/Demo engine/i, {
      timeout: 20_000,
    });
    await skipOnboardingIfPresent(page);
    await shot(page, "01-desktop-empty-demo-engine.png");
    await assertNoHorizontalOverflow(page);

    await page.getByTestId("create-from-brief").click();
    await expect(page.getByTestId("brief-composer")).toBeVisible();
    await page.getByTestId("sample-sneaker-launch").click();
    await shot(page, "02-desktop-brief-pulse-x1.png");
    await page.getByTestId("plan-workflow").click();
    await expect(page.getByTestId("brief-composer")).toBeHidden({
      timeout: 30_000,
    });
    await expect(page.getByTestId("workflow-canvas")).toBeVisible();
    await expect(page.getByTestId("flow-node-brief_input")).toBeVisible();
    await expect(page.getByTestId("flow-node-script_writer")).toBeVisible();
    // After fitView, more than a couple of nodes should be in the viewport.
    await page.waitForTimeout(200);
    const visibleNodes = await page.locator("[data-testid^=flow-node-]").evaluateAll((els) =>
      els.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
      }).length,
    );
    expect(visibleNodes).toBeGreaterThanOrEqual(3);
    await shot(page, "03-desktop-planned-graph.png");

    const nodeCountBefore = await page.locator("[data-testid^=flow-node-]").count();
    expect(nodeCountBefore).toBeGreaterThan(5);

    await sendCopilot(page, "Add three hook variants before the script.");
    await expect(page.getByTestId("flow-node-hook_variants")).toBeVisible({
      timeout: 15_000,
    });
    await shot(page, "04-desktop-after-hooks-edit.png");

    await sendCopilot(page, "Replace voice-over with subtitles.");
    await expect(page.getByTestId("flow-node-subtitle")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("flow-node-voiceover")).toHaveCount(0);
    await shot(page, "05-desktop-after-subtitle-edit.png");

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByTestId("flow-node-voiceover")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(page.getByTestId("flow-node-voiceover")).toHaveCount(0);

    await page.getByRole("button", { name: /Run workflow/i }).click();
    await expect(page.getByTestId("execution-drawer")).toBeVisible();
    await page.getByTestId("execution-drawer-toggle").click().catch(() => {});
    // Ensure expanded
    if (!(await page.getByTestId("execution-timeline").isVisible().catch(() => false))) {
      await page.getByTestId("execution-drawer-toggle").click();
    }
    await expect(page.getByTestId("execution-strip-summary")).not.toHaveText(
      /Idle — run a workflow/i,
      { timeout: 90_000 },
    );
    await expect
      .poll(async () => page.getByTestId("execution-strip-summary").innerText(), {
        timeout: 90_000,
      })
      .toMatch(/completed|provider|failed|cancelled/i);

    await shot(page, "06-desktop-execution.png");

    const providerRow = page.locator(
      '[data-testid^=execution-row-][data-status="needs_provider"]',
    );
    await expect(providerRow.first()).toBeVisible({ timeout: 30_000 });
    await expect(providerRow.first()).toContainText(/Needs provider|Simulated/i);

    await page.getByTestId("flow-node-scene_planner").click();
    await page.getByRole("tab", { name: "Inspector" }).click();
    await page.getByTestId("inspector-tab-output").click();
    await expect(page.getByTestId("inspector-output-panel")).toBeVisible({
      timeout: 10_000,
    });
    await shot(page, "07-desktop-scene-planner-output.png");

    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
    await page.getByRole("button", { name: "Export workflow JSON" }).click();
    await expect(page.getByTestId("export-dialog")).toBeVisible();
    await shot(page, "08-desktop-export.png");
    await page.getByTestId("export-download").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/i);

    // Debounced localStorage writer (300ms) — wait before refresh persistence check.
    await page.waitForTimeout(600);
    const persisted = await page.evaluate(() =>
      Boolean(localStorage.getItem("hexflow-copilot:v1")),
    );
    expect(persisted).toBe(true);

    await page.reload();
    await expect(page.getByTestId("mode-badge")).toContainText(/Demo engine/i, {
      timeout: 20_000,
    });
    await expect(page.getByTestId("workflow-canvas")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("flow-node-subtitle")).toBeVisible();
    await shot(page, "09-desktop-after-refresh-persistence.png");

    await page.getByRole("button", { name: "Share workflow" }).click();
    await expect(page.getByTestId("share-dialog")).toBeVisible();
    await page.getByTestId("share-copy").click();
    await expect(page.getByTestId("share-copied")).toBeVisible({
      timeout: 10_000,
    });
    const shareUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(shareUrl).toMatch(/#wf=/);

    const shareContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    await shareContext.addInitScript(() => {
      try {
        localStorage.clear();
      } catch {
        /* ignore */
      }
    });
    const sharePage = await shareContext.newPage();
    await sharePage.goto(shareUrl);
    await expect(sharePage.getByTestId("workflow-canvas")).toBeVisible({
      timeout: 20_000,
    });
    await expect(sharePage.getByTestId("flow-node-subtitle")).toBeVisible();
    await shot(sharePage, "10-desktop-share-url-fresh-context.png");
    await shareContext.close();

    await assertNoHorizontalOverflow(page);
  });

  test("narrow 390×844 layout remains operable", async ({ page, context }) => {
    test.setTimeout(120_000);
    await context.clearCookies();
    await page.addInitScript(() => {
      try {
        if (!sessionStorage.getItem("__hexflow_audit_cleared")) {
          localStorage.clear();
          sessionStorage.setItem("__hexflow_audit_cleared", "1");
        }
      } catch {
        /* ignore */
      }
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByTestId("mode-badge")).toContainText(/Demo engine/i, {
      timeout: 20_000,
    });
    await skipOnboardingIfPresent(page);
    await shot(page, "11-narrow-empty.png");
    await assertNoHorizontalOverflow(page);

    await expect(page.getByTestId("mobile-left-toggle")).toBeVisible();
    await expect(page.getByTestId("mobile-right-toggle")).toBeVisible();

    await page.getByTestId("empty-sample-sneaker-launch").click();
    await expect(page.getByTestId("brief-composer")).toBeVisible();
    await page.getByTestId("plan-workflow").click();
    await expect(page.getByTestId("brief-composer")).toBeHidden({
      timeout: 30_000,
    });
    await expect(page.getByTestId("workflow-canvas")).toBeVisible();
    await shot(page, "12-narrow-planned-graph.png");

    await page.getByTestId("mobile-right-toggle").click();
    await expect(page.getByTestId("mobile-right-drawer")).toBeVisible();
    await expect(
      page.getByTestId("mobile-right-drawer").getByTestId("copilot-panel"),
    ).toBeVisible();
    await shot(page, "13-narrow-copilot-drawer.png");

    await page.getByTestId("mobile-right-drawer").getByLabel("Close panel").click();
    await page.getByRole("button", { name: /Run workflow/i }).click();
    await expect(page.getByTestId("execution-drawer")).toBeVisible();
    await shot(page, "14-narrow-execution.png");
    await assertNoHorizontalOverflow(page);
  });
});
