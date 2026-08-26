import type { Locator, Page } from '@playwright/test';
import { expect, freshVisit, openWorkspace, savedFile, seedFile, test, tree } from './fixtures.js';

/**
 * docs/09 P3-T04: what the dialog says, what it takes with it, and where the reader is left
 * when the page they had open was one of them (docs/06 section 8, docs/04 section 4).
 */

const page_ = (id: string, title: string): string =>
  `---\nid: ${id}\ntitle: ${title}\n---\n\n${title}\n`;

test.beforeEach(async ({ page, mode }) => {
  test.skip(mode !== 'opfs', 'a delete is a file that has to be gone from OPFS afterwards');

  await freshVisit(page);
  await seedFile(page, 'home.md', page_('p_home', 'Home'));
  // Its directory holds the child, so `guides/index.md` is the page itself (docs/03 section 4.1).
  await seedFile(page, 'guides/index.md', page_('p_guides', 'Guides'));
  await seedFile(page, 'guides/setup.md', page_('p_setup', 'Setup'));
  await openWorkspace(page, 'opfs');
  await expect(tree(page)).toBeVisible();
});

const row = (page: Page, title: string): Locator => page.getByRole('treeitem', { name: title });
const dialog = (page: Page): Locator => page.getByRole('alertdialog');

async function openMenu(page: Page, title: string): Promise<void> {
  await row(page, title).hover();
  await page.getByRole('button', { name: `More options for ${title}` }).click();
  await expect(page.getByRole('menu')).toBeVisible();
}

test('the row menu deletes a page, and the file goes with it', async ({ page }) => {
  await openMenu(page, 'Home');
  await page.getByRole('menuitem', { name: 'Delete' }).click();

  await expect(dialog(page).getByRole('heading')).toHaveText("Delete 'Home'?");
  await expect(dialog(page)).toContainText('This deletes the page. This cannot be undone.');
  await dialog(page).getByRole('button', { name: 'Delete' }).click();

  await expect(row(page, 'Home')).toBeHidden();
  await expect(page.getByText("Deleted 'Home'")).toBeVisible();
  await expect.poll(() => savedFile(page, 'home.md')).toBe('');
  // The row went because the file did, so a reload has nothing to bring back.
  await page.reload();
  await expect(tree(page)).toBeVisible();
  await expect(row(page, 'Home')).toBeHidden();
});

test('Delete says how many sub-pages go with the page, and takes them', async ({ page }) => {
  await row(page, 'Guides').focus();
  await page.keyboard.press('Delete');

  await expect(dialog(page)).toContainText('This deletes the page and 1 sub-pages.');
  await dialog(page).getByRole('button', { name: 'Delete' }).click();

  await expect(row(page, 'Guides')).toBeHidden();
  await expect.poll(() => savedFile(page, 'guides/index.md')).toBe('');
  await expect.poll(() => savedFile(page, 'guides/setup.md')).toBe('');
  // The keyboard lands on the row that took its place rather than on nothing at all.
  await expect(row(page, 'Home')).toBeFocused();
});

test('Backspace opens the same dialog, and Cancel deletes nothing', async ({ page }) => {
  await row(page, 'Home').focus();
  await page.keyboard.press('Backspace');

  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();

  await expect(dialog(page)).toBeHidden();
  await expect(row(page, 'Home')).toBeVisible();
  await expect(row(page, 'Home')).toBeFocused();
  expect(await savedFile(page, 'home.md')).toContain('title: Home');
});

test('deleting the open page leaves the reader on the page above it', async ({ page }) => {
  await row(page, 'Guides').click();
  await page.getByRole('button', { name: 'Expand Guides' }).click();
  await row(page, 'Setup').click();
  await expect(page).toHaveURL(/p_setup/);

  await openMenu(page, 'Setup');
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await dialog(page).getByRole('button', { name: 'Delete' }).click();

  // docs/04 section 4: the page it was under is the nearest one still there.
  await expect(page).toHaveURL(/p_guides/);
  await expect(row(page, 'Setup')).toBeHidden();
});
