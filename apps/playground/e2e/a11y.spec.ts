import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, freshVisit, openWorkspace, test, tree } from './fixtures.js';

/**
 * docs/09 P1-T13 and docs/10 section 2: axe over the three screens Phase 1 has. P3-T10 widens
 * this to every e2e screen; what is here has to stay clean until then.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** One line per violation, so a failure names the rule and the element instead of an object. */
async function violations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.nodes
        .map((node) => node.target.join(' '))
        .join(', ')}`,
  );
}

/**
 * axe scores the pixels that are painted, and Radix plays the sheet in with `fade-in-0`, so a
 * scan taken on the first visible frame reads the page through a half-transparent panel.
 */
async function settled(locator: Locator): Promise<void> {
  await locator.evaluate(async (el) => {
    await Promise.all(
      el
        .getAnimations({ subtree: true })
        .map(async (animation) => animation.finished.catch(() => null)),
    );
  });
}

test.beforeEach(async ({ page }) => {
  await freshVisit(page);
});

test('the landing is clean @smoke', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Open demo' })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test('the shell and the tree are clean @smoke', async ({ page }) => {
  await openWorkspace(page, 'demo');
  await expect(tree(page)).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test('an open page is clean in both themes', async ({ page }) => {
  await openWorkspace(page, 'demo');
  await expect(tree(page)).toBeVisible();

  await page.keyboard.press('ControlOrMeta+p');
  await page.getByPlaceholder('Search pages…').fill('getting started');
  await page
    .getByRole('option', { name: /Getting started/ })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Getting started', level: 1 }).first(),
  ).toBeVisible();
  expect(await violations(page)).toEqual([]);

  // Contrast is the half of this that only dark mode can fail (docs/06 section 1).
  await page.keyboard.press('ControlOrMeta+p');
  await page.getByRole('option', { name: 'Switch theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  // The dialog fades out over the page; axe would score the contrast of both mid-animation.
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(await violations(page)).toEqual([]);
});

test('the phone layout is clean @smoke', async ({ page }) => {
  // The sheet sidebar and the icon-only header only exist below 768 px (docs/06 section 5), and
  // so do their own aria bugs: the desktop scans above cannot see either.
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page, 'demo');
  await expect(page.getByRole('button', { name: 'Show sidebar' })).toBeVisible();
  expect(await violations(page)).toEqual([]);

  await page.getByRole('button', { name: 'Show sidebar' }).click();
  await expect(tree(page)).toBeVisible();
  await settled(page.locator('[data-slot="sidebar"][data-mobile="true"]'));
  expect(await violations(page)).toEqual([]);
});
