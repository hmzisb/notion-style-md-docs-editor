import { defineConfig, devices } from '@playwright/test';
import type { Options } from './e2e/fixtures.js';

/**
 * docs/10 section 5. The budgets are about what a host ships, and `pnpm dev` is not that: the
 * dev server serves React's development build, and `main.tsx` wraps the app in `StrictMode`,
 * which renders every component twice. Both are honest for correctness runs and misleading for
 * a stopwatch, so the perf spec has a server of its own - the production build, previewed.
 */
export default defineConfig<Options>({
  testDir: './e2e',
  testMatch: /perf\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: true,
  // A budget that only passes on the second try is not met; a flake here is a finding.
  retries: 0,
  // One page at a time: measurements taken while three other tabs are busy are noise.
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4319',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'demo', use: { ...devices['Desktop Chrome'], mode: 'demo' } },
    { name: 'opfs', use: { ...devices['Desktop Chrome'], mode: 'opfs' } },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview --port 4319',
    url: 'http://localhost:4319',
    reuseExistingServer: process.env.CI === undefined,
    stdout: 'ignore',
    timeout: 180_000,
  },
});
