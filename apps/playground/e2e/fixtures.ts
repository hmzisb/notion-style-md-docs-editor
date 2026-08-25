import { test as base, expect, type Locator, type Page } from '@playwright/test';

export type Mode = 'demo' | 'opfs';

/** Per-project options, set in `playwright.config.ts`. */
export interface Options {
  mode: Mode;
}

/**
 * Known upstream console noise, docs/10 section 4. Every entry needs a link and an owner;
 * anything else fails the run.
 */
const ALLOWED: RegExp[] = [
  // The browser logs a failed request before any handler sees it, so a test that provokes one
  // (offline, a refused backend) would fail on its own fixture. What the app does about it is
  // asserted in the test itself.
  /^Failed to load resource: net::ERR_/,
];

interface Fixtures {
  /** Installed for every test: a console error or warning is a failure. */
  quietConsole: undefined;
}

export const test = base.extend<Options & Fixtures>({
  mode: ['demo', { option: true }],

  quietConsole: [
    async ({ page }, use) => {
      const noise: string[] = [];
      page.on('console', (message) => {
        const type = message.type();
        if (type !== 'error' && type !== 'warning') return;
        const text = message.text();
        if (!ALLOWED.some((pattern) => pattern.test(text))) noise.push(`${type}: ${text}`);
      });
      page.on('pageerror', (error) => {
        noise.push(`pageerror: ${error.message}`);
      });

      await use(undefined);
      expect(noise, 'the console must stay clean (docs/10 section 4)').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Starts every test from the landing, with nothing remembered and no browser workspace. */
export async function freshVisit(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('workspace', { recursive: true });
    } catch {
      // Nothing to remove, or an engine whose OPFS refuses to open (WebKit under Playwright).
    }
  });
  await page.reload();
}

/** Opens a workspace through the landing, the way a user does. */
export async function openWorkspace(page: Page, mode: Mode): Promise<void> {
  const label = mode === 'demo' ? 'Open demo' : 'Open browser storage';
  await page.getByRole('button', { name: label }).click();
}

export const tree = (page: Page): Locator => page.getByRole('tree');
