// apps/web/playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  // `process.env` is an index signature, so the repo's
  // `noPropertyAccessFromIndexSignature` rule requires bracket access.
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:5173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
    // The app's Supabase client is created at module scope and throws when
    // the URL is empty, so the SPA never boots without these. They are
    // deliberately fake: `getSession()` reads from empty storage and returns
    // null without a network call, so the app lands on `/login`. Supplying
    // them here keeps the suite hermetic — `apps/web/.env` is gitignored and
    // absent in CI.
    env: {
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_ANON_KEY: "playwright-dummy-anon-key",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
