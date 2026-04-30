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
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html']] : 'html',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm dev:test:api',
    url: `${BASE_URL}/api/v1/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
