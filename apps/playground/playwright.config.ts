import { defineConfig, devices } from '@playwright/test';
import type { Options } from './e2e/fixtures.js';

/** docs/11 section 9 and docs/10 section 4. */
export default defineConfig<Options>({
  testDir: './e2e',
  // The budgets run against the production build, from `playwright.perf.config.ts`.
  // `DOCS_E2E_NO_VISUAL` drops the baselines too: they are rasterised on one OS
  // (`__screenshots__/*-darwin.png`), so a shared runner has nothing to compare against.
  // CI sets it; everything else in this directory is portable and runs there.
  testIgnore:
    process.env.DOCS_E2E_NO_VISUAL === undefined ? /perf\.spec\.ts/ : /(perf|visual)\.spec\.ts/,
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
  // docs/09 P3-T14 asks for the baselines here rather than beside the spec. The platform is in
  // the name because font rasterising is not the same on two operating systems: another OS
  // writes its own set instead of failing against this one.
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}-{projectName}-{platform}{ext}',
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
