import { defineConfig, devices } from '@playwright/test';

const coverageMode = process.env.E2E_COVERAGE === 'true';
const e2ePort = 5555;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: `http://localhost:${e2ePort}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `${coverageMode ? 'E2E_COVERAGE=true ' : ''}VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA VITE_API_URL=http://localhost:8787 npm run dev -- --port ${e2ePort}`,
      url: `http://localhost:${e2ePort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: 'cd api && TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA npm run dev',
      url: 'http://localhost:8787/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: {
        TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
      },
    },
  ],
});
