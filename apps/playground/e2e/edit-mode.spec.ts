import type { Page } from '@playwright/test';
import { expect, freshVisit, openWorkspace, test, tree } from './fixtures.js';

/**
 * docs/09 P2-T02: the read/edit swap. docs/05 section 8 pins the mechanics (one scroll
 * container, the offset kept, the spinner inside the control) and docs/07 section 7 the
 * triggers. Named for the page mode; `modes.spec.ts` is about workspace modes.
 */

const REGION = '[data-docs-content]';
const EDITOR = '[data-slate-editor]';

test.beforeEach(async ({ page }) => {
  await freshVisit(page);
  await openWorkspace(page, 'demo');
  await expect(tree(page)).toBeVisible();

  // The corpus opens collapsed, and this page is three levels down; it is the one page long
  // enough to scroll, which is what the offset assertions need.
  await page.keyboard.press('ControlOrMeta+p');
  await page.getByRole('option', { name: 'Expand all' }).click();
  const row = page.getByRole('treeitem', { name: /Large page/ }).first();
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await expect(page.getByRole('heading', { name: 'Large page', level: 1 }).first()).toBeVisible();
});

const scrollTop = (page: Page): Promise<number> =>
  page.locator(REGION).evaluate((n) => n.scrollTop);

test('clicking the text opens the editor at the same offset', async ({ page }) => {
  await page.locator(REGION).evaluate((node) => {
    node.scrollTop = 400;
  });
  await expect.poll(() => scrollTop(page)).toBeGreaterThan(300);
  const before = await scrollTop(page);

  // A real click, at a point of the viewport that holds body text: `locator.click()` would
  // scroll the block into view first and so undo the offset this test is about.
  const point = { x: 600, y: 400 };
  const clicked = await page.evaluate(
    (at) => document.elementFromPoint(at.x, at.y)?.textContent.slice(0, 24) ?? '',
    point,
  );
  expect(clicked.length).toBeGreaterThan(0);
  await page.mouse.click(point.x, point.y);

  await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'true');
  await expect(page).toHaveURL(/mode=edit/);
  // docs/05 section 8: the same scroll container, the same offset, no jump.
  expect(Math.abs((await scrollTop(page)) - before)).toBeLessThanOrEqual(2);
  // docs/07 section 7: the caret sits in the text that was clicked, not at the page start.
  await expect(page.locator(EDITOR)).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.anchorNode?.textContent ?? ''))
    .toContain(clicked);
});

test('E enters edit mode and Escape leaves it', async ({ page }) => {
  await page.locator(REGION).focus();
  await page.keyboard.press('e');
  await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'true');
  await expect(page).toHaveURL(/mode=edit/);

  // docs/07 section 5: the first Escape collapses the caret to a block selection, the second
  // one leaves edit mode.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'false');
  await expect(page).toHaveURL(/mode=read/);
  // docs/07 section 7: focus goes back to the content region, not to nothing.
  await expect(page.locator(REGION)).toBeFocused();
});

test('the Edit and Done control drives the same swap', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
  await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'true');

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
  await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'false');
});

test('the mode never grows the history (docs/07 section 7)', async ({ page }) => {
  const depth = await page.evaluate(() => history.length);

  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'true');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();

  expect(await page.evaluate(() => history.length)).toBe(depth);
});

test('opening another page from the tree returns to read mode', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'true');

  await page.getByRole('link', { name: 'Docs corpus' }).click();
  await expect(page).toHaveURL(/mode=read/);
  // A new page is a new session (docs/05 section 8): back to the read view, editor unmounted.
  await expect(page.locator(EDITOR)).not.toHaveAttribute('contenteditable', 'true');
});
