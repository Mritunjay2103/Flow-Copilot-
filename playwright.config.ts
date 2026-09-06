import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright smoke config. The webServer always starts in demo mode so e2e
 * does not depend on a local Ollama process.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Always force demo mode so e2e never depends on local Ollama.
    command: "npm run dev -- --port 3000",
    url: "http://127.0.0.1:3000",
    // Do not reuse an existing server — it may not have AI_MODE=demo.
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      AI_MODE: "demo",
    },
  },
});
