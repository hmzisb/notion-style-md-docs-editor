import type { Page } from '@playwright/test';
import { expect, freshVisit, openWorkspace, savedFile, seedFile, test, tree } from './fixtures.js';

/**
 * docs/09 P3-T06, against docs/06 section 8: the header's `⋯` on the page that is open - what it
 * copies, what it downloads, and the two writes it starts.
 */

test.beforeEach(async ({ page, mode }) => {
  test.skip(mode !== 'opfs', 'the delete has to be gone from OPFS, not just from the tree');

  await freshVisit(page);
  await seedFile(page, 'home.md', '---\nid: p_home\ntitle: Home\n---\n\nHome page body\n');
  await seedFile(page, 'guides.md', '---\nid: p_guides\ntitle: Guides\n---\n\nGuides\n');
  await openWorkspace(page, 'opfs');
  await expect(tree(page)).toBeVisible();
  await page.getByRole('treeitem', { name: 'Home' }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
});

/** The `⋯`, which fetches the menu it opens (docs/02 section 7). */
async function openMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await expect(page.getByRole('menu')).toBeVisible();
}

test('copies the page as the file it is, and says so', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openMenu(page);

  await page.getByRole('menuitem', { name: 'Copy as Markdown' }).click();

  await expect(page.getByText('Copied as Markdown')).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('id: p_home');
  expect(copied).toContain('Home page body');
});

test('counts the words of the open page', async ({ page }) => {
  await openMenu(page);

  await expect(page.getByRole('menuitem', { name: '3 words' })).toBeVisible();
});

test('renames by putting the caret in the page title', async ({ page }) => {
  await openMenu(page);

  await page.getByRole('menuitem', { name: 'Rename' }).click();

  // docs/06 section 8: the title is the rename, so the page switches to the mode that has a
  // field in it and the caret lands there.
  await expect(page).toHaveURL(/mode=edit/);
  const title = page.getByRole('textbox', { name: 'Page title' });
  await expect(title).toBeFocused();
  await title.fill('Renamed');
  await expect.poll(() => savedFile(page, 'home.md')).toContain('title: Renamed');
});

test('deletes the open page behind a confirmation', async ({ page }) => {
  await openMenu(page);

  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('heading', { name: "Delete 'Home'?" })).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete' }).click();

  await expect(page.getByText("Deleted 'Home'")).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'Home' })).toBeHidden();
  await expect.poll(() => savedFile(page, 'home.md')).toBe('');
});
