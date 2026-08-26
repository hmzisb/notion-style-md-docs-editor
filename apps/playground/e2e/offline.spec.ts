import type { Page } from '@playwright/test';
import {
  clickCaret,
  expect,
  freshVisit,
  openWorkspace,
  savedFile,
  seedFile,
  test,
} from './fixtures.js';

/**
 * docs/09 P2-T08, D-05: with the radio off the workspace still reads and still takes body
 * edits - OPFS is on this machine - and the structural half is turned off until it is back.
 */

const EDITOR = '[data-slate-editor]';
const FILE = 'offline.md';

test.beforeEach(async ({ page, mode }) => {
  test.skip(mode !== 'opfs', 'reads the saved file back out of OPFS');

  await freshVisit(page);
  await seedFile(page, FILE, `---\nid: p_off\ntitle: Offline page\nicon: 🚀\n---\n\nBody text\n`);
  await openWorkspace(page, 'opfs');
  await page.getByRole('link', { name: 'Offline page' }).click();
  await expect(page.getByText('Body text')).toBeVisible();
});

const title = (page: Page) => page.getByRole('textbox', { name: 'Page title' });

test('the page still reads and still takes body edits offline', async ({ page, context }) => {
  // The editor is a chunk of its own (docs/05 section 8) and nothing here caches assets, so
  // it has to be in the browser before the radio goes off - which is what the shell's idle
  // preload does on a real visit, and what one edit here waits for.
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'true');

  await context.setOffline(true);
  await expect(page.getByText('Body text')).toBeVisible();

  await clickCaret(page.locator(EDITOR).getByText('Body text'));
  await page.keyboard.type('plus more ');
  await page.getByRole('button', { name: 'Done' }).click();

  // docs/04 section 3.4: content is drafted and saved offline, because the provider is local.
  // Where the caret lands is the click's business; that the bytes changed is this test's.
  await expect.poll(() => savedFile(page, FILE)).toContain('plus more');
});

test('the title and the icon are turned off, and come back with the network', async ({
  page,
  context,
}) => {
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(title(page)).not.toHaveAttribute('readonly', '');

  await context.setOffline(true);
  await expect(title(page)).toHaveAttribute('readonly', '');
  await expect(page.getByRole('button', { name: 'Change icon' })).toBeDisabled();
  await title(page).hover();
  await expect(page.getByText('Reconnect to change pages')).toBeVisible();

  // The typing goes nowhere: the field is read-only, so the file keeps the title it had.
  await title(page).click();
  await page.keyboard.type('nope');
  await expect(title(page)).toHaveValue('Offline page');

  await context.setOffline(false);
  await expect(title(page)).not.toHaveAttribute('readonly', '');
  await expect(page.getByRole('button', { name: 'Change icon' })).toBeEnabled();
});
