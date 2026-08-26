import { defineConfig, devices } from '@playwright/test';

/** Against `vite preview`, so what is measured is the build, not a dev server. */
export default defineConfig({
  testDir: './e2e',
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4332', trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm preview --port 4332',
    url: 'http://localhost:4332',
    reuseExistingServer: false,
    stdout: 'ignore',
    timeout: 60_000,
  },
});
