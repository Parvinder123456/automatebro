import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config for AutomateBro.
 *
 * We run a single Next.js app (per engineering plan §3) on test port 4010 —
 * the "API" port from the cc-mastery starter kit's port table — because
 * /api/v1/* lives in the same app. The website (4000) and dashboard (4020)
 * scripts exist for parity but Playwright only spawns the one server we need.
 */
const TEST_API_PORT = 4010;
const BASE_URL = `http://localhost:${TEST_API_PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  // Tests share a single dev server + Supabase project, and our
  // integration suite touches real users + tenants. Parallel runs
  // exhibited race conditions where one test's fetch lookups saw
  // another test's writes. Serial execution keeps the suite stable;
  // total runtime is still under 3 minutes.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html']] : 'html',
  // Dev-server first-render takes ~10s (Next compile) + ~6s (StrictDB
  // schema register + ensureIndexes) before any test can interact.
  // Subsequent tests reuse the warm process. Per-test timeout is generous
  // to absorb both.
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev:test:api',
    url: `${BASE_URL}/api/v1/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
