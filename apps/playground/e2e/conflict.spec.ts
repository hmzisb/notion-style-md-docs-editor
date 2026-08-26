import type { Page } from '@playwright/test';
import { expect, freshVisit, openWorkspace, savedFile, seedFile, test } from './fixtures.js';

/**
 * docs/09 P2-T09 and docs/04 section 3.5. The file moves under the editor - written straight
 * through OPFS, the way another tab or a sync client would - and the two ways out are read
 * back off disk: Reload takes the file, Overwrite takes what was typed.
 */

const EDITOR = '[data-slate-editor]';
const FILE = 'conflict.md';
const HEAD = '---\nid: p_conf\ntitle: Conflict page\n---\n\n';

test.beforeEach(async ({ page, mode }) => {
  test.skip(mode !== 'opfs', 'the file has to be writable from outside the app');

  await freshVisit(page);
  await seedFile(page, FILE, `${HEAD}Original\n`);
  await openWorkspace(page, 'opfs');
  await page.getByRole('link', { name: 'Conflict page' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'true');
});

/** Types into the page, then rewrites the file behind the app and asks for a save. */
async function collide(page: Page): Promise<void> {
  await page.locator(EDITOR).getByText('Original').click();
  await page.keyboard.type('plus mine ');

  await seedFile(page, FILE, `${HEAD}From disk\n`);
  // docs/07 section 2: inside the module, Cmd+S is the save the session owns.
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByRole('alert')).toContainText('Changed on disk since you opened it.');
}

test('Reload gives up the local edits and takes the file', async ({ page }) => {
  await collide(page);

  await page.getByRole('button', { name: 'Reload' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('From disk')).toBeVisible();
  // Nothing of the local edit reached the disk, and the file is what it was rewritten to.
  expect(await savedFile(page, FILE)).toContain('From disk');
  expect(await savedFile(page, FILE)).not.toContain('plus mine');
});

test('Overwrite writes the local edits over the file', async ({ page }) => {
  await collide(page);

  await page.getByRole('button', { name: 'Overwrite' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  // Where the caret landed is the click's business: that these bytes won is this test's.
  await expect.poll(() => savedFile(page, FILE)).toContain('plus mine');
  expect(await savedFile(page, FILE)).not.toContain('From disk');
});
