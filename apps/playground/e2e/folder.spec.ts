import type { Locator, Page } from '@playwright/test';
import { expect, freshVisit, openWorkspace, savedFile, seedFile, test, tree } from './fixtures.js';

/**
 * docs/09 P3-T05: a directory with no `index.md` is a node with no page behind it (docs/03
 * section 4.1) - expandable, not openable, and convertible into the page it is missing.
 */

test.beforeEach(async ({ page, mode }) => {
  test.skip(mode !== 'opfs', 'the conversion is a file that has to appear in OPFS');

  await freshVisit(page);
  // A link to the directory, which is how a folder node is reached: no row opens one.
  await seedFile(page, 'home.md', '---\nid: p_home\ntitle: Home\n---\n\n[Guides](guides/)\n');
  await seedFile(page, 'guides/setup.md', '---\nid: p_setup\ntitle: Setup\n---\n\nSetup\n');
  await openWorkspace(page, 'opfs');
  await expect(tree(page)).toBeVisible();
});

const row = (page: Page, title: string): Locator => page.getByRole('treeitem', { name: title });

/** Opens the folder card the only way a reader can: a link that resolves to the directory. */
async function openFolder(page: Page): Promise<void> {
  await row(page, 'Home').click();
  await page.getByRole('link', { name: 'Guides' }).click();
  await expect(page.getByRole('heading', { name: 'This folder has no page yet' })).toBeVisible();
}

test('a folder row expands rather than opening', async ({ page }) => {
  const folder = row(page, 'Guides');
  // No link: there is no page to navigate to (docs/03 section 4.1).
  await expect(folder.getByRole('link')).toHaveCount(0);

  await folder.click();
  await expect(folder).toHaveAttribute('aria-expanded', 'true');
  await expect(row(page, 'Setup')).toBeVisible();
  // The click expanded the folder and opened nothing.
  await expect(page.getByRole('heading', { name: 'Select a page' })).toBeVisible();
});

test('Create page turns the folder into the page it was missing, id and all', async ({ page }) => {
  await openFolder(page);
  const id = /\/p\/([^?]+)/.exec(page.url())?.[1] ?? '';

  await page.getByRole('button', { name: 'Create page' }).click();

  // The same node: the id in the URL is the one the folder had, and the file carries it.
  await expect(page).toHaveURL(new RegExp(`/p/${id}`));
  await expect(page).toHaveURL(/mode=edit/);
  await expect.poll(() => savedFile(page, 'guides/index.md')).toContain(`id: ${id}`);
  // The row is a page now, so it has somewhere to go.
  await expect(row(page, 'Guides').getByRole('link')).toHaveCount(1);

  await page.reload();
  await expect(tree(page)).toBeVisible();
  await expect(row(page, 'Guides').getByRole('link')).toHaveCount(1);
});
