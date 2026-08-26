import type { Locator, Page } from '@playwright/test';
import { expect, freshVisit, openWorkspace, savedFile, seedFile, test, tree } from './fixtures.js';

/**
 * docs/09 P3-T02: the three ways into an inline rename, what an empty one does, and the row
 * menu around it - docs/06 section 5 for the row, docs/07 sections 5 and 6 for the behaviour.
 */

const HOME = 'home.md';
const GUIDES = 'guides.md';

test.beforeEach(async ({ page, mode }) => {
  test.skip(mode !== 'opfs', 'reads the renamed files back out of OPFS');

  await freshVisit(page);
  await seedFile(page, HOME, '---\nid: p_home\ntitle: Home\n---\n\nHome\n');
  await seedFile(page, GUIDES, '---\nid: p_guides\ntitle: Guides\n---\n\nGuides\n');
  await openWorkspace(page, 'opfs');
  await expect(tree(page)).toBeVisible();
});

const row = (page: Page, title: string): Locator => page.getByRole('treeitem', { name: title });
const field = (page: Page, title: string): Locator =>
  page.getByRole('textbox', { name: `Rename ${title}` });

async function openMenu(page: Page, title: string): Promise<void> {
  await row(page, title).hover();
  await page.getByRole('button', { name: `More options for ${title}` }).click();
  await expect(page.getByRole('menu')).toBeVisible();
}

test('F2 renames the focused row, and the file keeps its name', async ({ page }) => {
  await row(page, 'Home').focus();
  await page.keyboard.press('F2');

  await expect(field(page, 'Home')).toBeFocused();
  // Selected, so the title the user types replaces the one that was there.
  await page.keyboard.type('Handbook');
  await page.keyboard.press('Enter');

  await expect(row(page, 'Handbook')).toBeVisible();
  // Back on the row: the keyboard came from there and the next arrow key still moves the tree.
  await expect(row(page, 'Handbook')).toBeFocused();
  // docs/03 section 4.7: only a fresh page's first title takes the file with it.
  await expect.poll(() => savedFile(page, HOME)).toContain('title: Handbook');
});

test('a double click on the title renames, and Esc puts it back', async ({ page }) => {
  await page.getByRole('treeitem', { name: 'Guides' }).getByText('Guides').dblclick();

  await expect(field(page, 'Guides')).toBeFocused();
  await page.keyboard.type('Something else');
  await page.keyboard.press('Escape');

  await expect(field(page, 'Guides')).toBeHidden();
  await expect(row(page, 'Guides')).toBeVisible();
  expect(await savedFile(page, GUIDES)).toContain('title: Guides');
});

test('an empty title is refused and the field stays open', async ({ page }) => {
  await row(page, 'Home').focus();
  await page.keyboard.press('F2');
  await field(page, 'Home').fill('');
  await page.keyboard.press('Enter');

  await expect(field(page, 'Home')).toBeVisible();
  await expect(field(page, 'Home')).toHaveAttribute('aria-invalid', 'true');
  expect(await savedFile(page, HOME)).toContain('title: Home');
});

test('the row menu renames the page it belongs to', async ({ page }) => {
  await openMenu(page, 'Guides');
  await page.getByRole('menuitem', { name: 'Rename' }).click();

  await expect(field(page, 'Guides')).toBeFocused();
  await page.keyboard.type('Recipes');
  await page.keyboard.press('Enter');

  await expect(row(page, 'Recipes')).toBeVisible();
  await expect.poll(() => savedFile(page, GUIDES)).toContain('title: Recipes');
});

test('the row menu changes the icon', async ({ page }) => {
  await openMenu(page, 'Home');
  await page.getByRole('menuitem', { name: 'Change icon' }).click();

  // docs/07 section 6: the picker opens on the emoji tab with the search focused, and the
  // menu it came out of takes neither the focus nor the keys back on its way off the screen.
  const picker = page.getByRole('dialog');
  await expect(picker.getByPlaceholder('Search…')).toBeFocused();
  await page.keyboard.type('rocket');
  // The emoji data is fetched, so the results are drawn a moment after the query - and which
  // of them the search highlights first is that data's business, not this test's.
  await expect(picker.getByText('🚀', { exact: true })).toBeVisible();
  const highlighted = picker.locator('button[data-active]');
  await expect(highlighted).toBeVisible();
  const emoji = (await highlighted.textContent()) ?? '';
  await page.keyboard.press('Enter');

  await expect(row(page, 'Home')).toContainText(emoji);
  await expect.poll(() => savedFile(page, HOME)).toContain(`icon: ${emoji}`);
});

test('the row menu copies a link to the page', async ({ context, page }) => {
  // The clipboard is a permission, and a headless browser has not been asked for it yet.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openMenu(page, 'Home');
  await page.getByRole('menuitem', { name: 'Copy link' }).click();

  await expect(page.getByText('Copied link')).toBeVisible();
  // docs/06 section 5: the link is the host's own, through the navigation adapter.
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('/p/p_home?mode=read');
});

test('the row menu adds a page inside the row', async ({ page }) => {
  await openMenu(page, 'Home');
  await page.getByRole('menuitem', { name: 'Add a page inside' }).click();

  await expect(page.getByRole('treeitem', { name: 'Untitled' })).toHaveAttribute('aria-level', '2');
});
