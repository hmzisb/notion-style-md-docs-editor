import { defineConfig, devices } from '@playwright/test';
import type { Options } from './e2e/fixtures.js';

/** docs/11 section 9 and docs/10 section 4. */
export default defineConfig<Options>({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: process.env.CI === undefined ? 0 : 2,
  reporter: process.env.CI === undefined ? [['list']] : [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, threshold: 0.2 },
  },
  projects: [
    { name: 'demo', use: { ...devices['Desktop Chrome'], mode: 'demo' } },
    { name: 'opfs', use: { ...devices['Desktop Chrome'], mode: 'opfs' } },
    // Safari has no directory picker, and no usable OPFS under Playwright: the smoke run is
    // what proves the landing adapts to what the browser can actually do.
    { name: 'opfs-webkit', grep: /@smoke/, use: { ...devices['Desktop Safari'], mode: 'opfs' } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: process.env.CI === undefined,
    stdout: 'ignore',
  },
});
