import { expect, freshVisit, openWorkspace, test, tree } from './fixtures.js';

/**
 * docs/09 P4-T08: the shell owns one scroll container for every page, so where a page was left
 * is something it has to remember. Within the session only: a reload starts at the top.
 */

const region = (page: Parameters<typeof freshVisit>[0]) => page.locator('[data-docs-content]');

const offsetOf = (page: Parameters<typeof freshVisit>[0]): Promise<number> =>
  region(page).evaluate((el) => el.scrollTop);

async function open(page: Parameters<typeof freshVisit>[0], title: string): Promise<void> {
  await page.keyboard.press('ControlOrMeta+p');
  const dialog = page.getByRole('dialog', { name: 'Search pages and actions' });
  await dialog.getByPlaceholder('Search pages…').fill(title);
  await dialog
    .getByRole('option', { name: new RegExp(title) })
    .first()
    .click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: title, level: 1 }).first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await freshVisit(page);
  await openWorkspace(page, 'demo');
  await expect(tree(page)).toBeVisible();
});

test('comes back to a page where it was left @smoke', async ({ page }) => {
  await open(page, 'Large page');
  await region(page).evaluate((el) => {
    el.scrollTop = 600;
  });
  await expect.poll(() => offsetOf(page)).toBe(600);

  // Another page opens at the top, in the container the last one scrolled.
  await open(page, 'Roadmap');
  await expect.poll(() => offsetOf(page)).toBe(0);

  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Large page', level: 1 }).first()).toBeVisible();
  await expect.poll(() => offsetOf(page)).toBe(600);

  // And forward again, to the page that was never scrolled.
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Roadmap', level: 1 }).first()).toBeVisible();
  await expect.poll(() => offsetOf(page)).toBe(0);
});

test('starts at the top after a reload', async ({ page }) => {
  await open(page, 'Large page');
  await region(page).evaluate((el) => {
    el.scrollTop = 400;
  });
  await expect.poll(() => offsetOf(page)).toBe(400);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Large page', level: 1 }).first()).toBeVisible();
  await expect.poll(() => offsetOf(page)).toBe(0);
});
