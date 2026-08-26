import { clickCaret, expect, freshVisit, openWorkspace, savedFile, seedFile, test } from './fixtures.js';

/**
 * docs/09 P4-T01 and docs/04 section 5. The OPFS workspace is opened with `watch: true`, so the
 * store polls its listing every 5 s and the provider turns what changed into `ChangeEvent`s.
 * Every write here goes straight through OPFS, the way another tab or a sync client writes.
 */

const EDITOR = '[data-slate-editor]';
const FILE = 'watched.md';
const HEAD = '---\nid: p_watch\ntitle: Watched page\n---\n\n';

// One poll (5 s) plus the walk and the read that follow it.
const WITHIN_POLL = { timeout: 15_000 };

test.beforeEach(async ({ page, mode }) => {
  test.skip(mode !== 'opfs', 'the files have to be writable from outside the app');

  await freshVisit(page);
  await seedFile(page, FILE, `${HEAD}Original body\n`);
  await openWorkspace(page, 'opfs');
  await page.getByRole('link', { name: 'Watched page' }).click();
  await expect(page.getByText('Original body')).toBeVisible();
});

test('an external write to the open page swaps in without a reload', async ({ page }) => {
  await seedFile(page, FILE, `${HEAD}Written from outside\n`);

  await expect(page.getByText('Written from outside')).toBeVisible(WITHIN_POLL);
  await expect(page.getByText('Original body')).toHaveCount(0);
});

test('an external new file appears in the tree', async ({ page }) => {
  await seedFile(page, 'arrived.md', '---\ntitle: Arrived later\n---\n\nNew.\n');

  await expect(page.getByRole('link', { name: 'Arrived later' })).toBeVisible(WITHIN_POLL);
});

test('a title changed on disk renames the row', async ({ page }) => {
  await seedFile(page, FILE, '---\nid: p_watch\ntitle: Renamed on disk\n---\n\nOriginal body\n');

  await expect(page.getByRole('link', { name: 'Renamed on disk' })).toBeVisible(WITHIN_POLL);
});

test('a save of our own never interrupts the editor', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'true');
  await clickCaret(page.locator(EDITOR).getByText('Original body'));
  await page.keyboard.type('typed ');
  await page.keyboard.press('ControlOrMeta+s');
  await expect.poll(async () => await savedFile(page, FILE), { timeout: 10_000 }).toContain('typed ');

  // Unsaved edits held across two poll cycles: what the file has is what we wrote, and the
  // provider knows it (`watch.test.ts` asserts the silence directly). If it did not, the page
  // query would refetch under a dirty editor, which is the state that becomes a conflict.
  await page.keyboard.type('and more ');
  await page.waitForTimeout(11_000);

  await expect(page.getByRole('alert')).toHaveCount(0);
  // Both runs of text went in at the same caret, so the later one sits inside the earlier.
  await expect(page.locator(EDITOR)).toContainText('typed and more');
  await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'true');
});
