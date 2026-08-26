import { defineConfig, devices } from '@playwright/test';

/**
 * The smoke runs against `vite preview`, which serves the build `pnpm smoke` just made: a
 * dev server would hide exactly the packaging faults this host exists to catch.
 */
export default defineConfig({
  testDir: './e2e',
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4331', trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm preview --port 4331',
    url: 'http://localhost:4331',
    reuseExistingServer: false,
    stdout: 'ignore',
    timeout: 60_000,
  },
});
