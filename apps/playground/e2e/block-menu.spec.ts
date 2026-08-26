import type { Page } from '@playwright/test';
import { expect, freshVisit, openWorkspace, savedFile, seedFile, test } from './fixtures.js';

/**
 * docs/09 P3-T07, against docs/05 section 2: the right-click menu over a block. What only a
 * browser can prove is that a real secondary click selects the block under the pointer and
 * that what the four items do to it survives a save.
 */

const EDITOR = '[data-slate-editor]';
const FILE = 'menu.md';

test.beforeEach(async ({ page, mode }) => {
  test.skip(mode !== 'opfs', 'reads the saved file back out of OPFS');

  await freshVisit(page);
  await seedFile(page, FILE, '# Menu\n\nFirst block\n\nSecond block\n');

  await openWorkspace(page, 'opfs');
  await page.getByRole('link', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'true');
});

/** Right-click the block the text sits in, which is what carries Plate's own handlers. */
async function openOn(page: Page, text: string): Promise<void> {
  await page.locator(EDITOR).getByText(text, { exact: true }).click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
}

/** Leaves the editor, which is what flushes the session (docs/04 section 3.1). */
async function done(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'false');
}

test('offers the four things it can do to the block under the pointer', async ({ page }) => {
  await openOn(page, 'First block');

  await expect(page.getByRole('menuitem')).toHaveText([
    'Turn into',
    'Duplicate',
    'Copy',
    'Delete',
  ]);
});

test('turns the block into another one, and the file says so', async ({ page }) => {
  await openOn(page, 'First block');

  await page.getByRole('menuitem', { name: 'Turn into' }).hover();
  await page.getByRole('menuitem', { name: 'Heading 2' }).click();

  await expect(page.locator(EDITOR).getByRole('heading', { name: 'First block' })).toBeVisible();
  await done(page);
  // The first save writes the page's id into the frontmatter, so the body is what is asserted.
  await expect
    .poll(() => savedFile(page, FILE))
    .toContain('# Menu\n\n## First block\n\nSecond block\n');
});

test('duplicates the block below itself', async ({ page }) => {
  await openOn(page, 'First block');
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();

  await expect(page.locator(EDITOR).getByText('First block', { exact: true })).toHaveCount(2);
  await done(page);
  await expect
    .poll(() => savedFile(page, FILE))
    .toContain('# Menu\n\nFirst block\n\nFirst block\n\nSecond block\n');
});

test('copies the block, and deletes it', async ({ page }) => {
  await openOn(page, 'First block');
  await page.getByRole('menuitem', { name: 'Copy' }).click();
  await expect(page.getByText('Copied blocks')).toBeVisible();

  await openOn(page, 'First block');
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(page.locator(EDITOR).getByText('First block', { exact: true })).toHaveCount(0);

  await done(page);
  await expect.poll(() => savedFile(page, FILE)).toContain('# Menu\n\nSecond block\n');
});

test('leaves the reader the browser menu', async ({ page }) => {
  await done(page);
  await page.locator(EDITOR).getByText('First block', { exact: true }).click({ button: 'right' });

  await expect(page.getByRole('menu')).toHaveCount(0);
});
