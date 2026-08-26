import type { Locator, Page } from '@playwright/test';
import { expect, freshVisit, savedFile, seedFile, test, tree } from './fixtures.js';

/**
 * docs/09 P3-T10, against docs/07 sections 2 and 9: the whole loop - open a workspace, create,
 * type, rename, move, delete - with no pointer at all. Only `page.keyboard` is used below;
 * a `click()` or a `hover()` anywhere in this file defeats its purpose.
 */

const page_ = (id: string, title: string, order: number): string =>
  `---\nid: ${id}\ntitle: ${title}\norder: ${String(order)}\n---\n\n# ${title}\n`;

test.beforeEach(async ({ page, mode }) => {
  test.skip(mode !== 'opfs', 'reads the written files back out of OPFS');

  await freshVisit(page);
  await seedFile(page, 'alpha.md', page_('p_alpha', 'Alpha', 10));
  await seedFile(page, 'beta.md', page_('p_beta', 'Beta', 20));
});

/** Presses Tab until the focus lands where `at` says, so nothing here needs a pointer. */
async function tabTo(page: Page, at: () => Promise<boolean>, what: string): Promise<void> {
  for (let step = 0; step < 30; step += 1) {
    if (await at()) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Tab never reached ${what}`);
}

const focusedName = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) return '';
    // Inside `evaluate` the linter reads a DOM where `textContent` is never null; the
    // browser's is, for an element that holds no text at all.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const name = active.ariaLabel ?? active.textContent ?? '';
    return `${active.tagName}:${name}`;
  });

/** The row the focus is in, by the name it is announced under. */
const focusedRow = (page: Page): Promise<string> =>
  page.evaluate(
    () => document.activeElement?.closest('[role="treeitem"]')?.getAttribute('aria-label') ?? '',
  );

/** Walks the tree with the arrow keys until the row with this title has the focus. */
async function arrowTo(page: Page, title: string): Promise<void> {
  await page.keyboard.press('Home');
  const titles = await order(page);
  const target = titles.indexOf(title);
  expect(target, `${title} is not in the tree`).toBeGreaterThan(-1);

  for (const step of titles.slice(0, target)) {
    // The tree moves the DOM focus from an effect, a render after the key it answers: pressing
    // again before that lands sends the next key to the row the tree has already left.
    await expect.poll(() => focusedRow(page)).toBe(step);
    await page.keyboard.press('ArrowDown');
  }
  await expect.poll(() => focusedRow(page)).toBe(title);
}

/** The titles the tree is showing, top to bottom. */
const order = (page: Page): Promise<string[]> =>
  page
    .getByRole('treeitem')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label') ?? ''));

const row = (page: Page, title: string): Locator => page.getByRole('treeitem', { name: title });

test('creates, writes, renames, moves and deletes a page with no pointer', async ({ page }) => {
  await tabTo(
    page,
    async () => (await focusedName(page)).startsWith('BUTTON:Open browser storage'),
    'the landing',
  );
  await page.keyboard.press('Enter');
  await expect(tree(page)).toBeVisible();

  // docs/07 section 2: a new root page, open in edit mode with the title waiting for a name.
  await page.keyboard.press('ControlOrMeta+Alt+n');
  const title = page.getByRole('textbox', { name: 'Page title' });
  await expect(title).toBeFocused();
  await page.keyboard.type('Release plan');
  await expect(row(page, 'Release plan')).toBeVisible();
  // docs/03 section 4.7: the first title names the file, so this page is `release-plan.md`.
  await expect.poll(() => savedFile(page, 'release-plan.md')).toContain('title: Release plan');

  // Enter from the title puts the caret in the body (docs/07 section 5).
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-slate-editor]')).toBeFocused();
  await page.keyboard.type('Written without a mouse.');
  await expect(page.locator('[data-slate-editor]')).toContainText('Written without a mouse.');

  // Back to read mode, which flushes the session (docs/04 section 3.1).
  await page.keyboard.press('ControlOrMeta+Shift+e');
  await expect(page.locator('[data-slate-editor]')).toHaveAttribute('contenteditable', 'false');
  await expect.poll(() => savedFile(page, 'release-plan.md')).toContain('Written without a mouse.');

  // The tree has one tab stop, and the arrows move inside it (docs/07 section 9).
  await tabTo(
    page,
    () => page.evaluate(() => document.activeElement?.closest('[role="tree"]') !== null),
    'the tree',
  );
  await arrowTo(page, 'Release plan');

  await page.keyboard.press('F2');
  await expect(page.getByRole('textbox', { name: 'Rename Release plan' })).toBeFocused();
  await page.keyboard.type('Handbook');
  await page.keyboard.press('Enter');
  await expect(row(page, 'Handbook')).toBeVisible();
  // The row takes the keyboard back, so the next shortcut still goes to the tree.
  await expect(row(page, 'Handbook')).toBeFocused();

  // docs/07 section 2: `Cmd+↑` moves the page among its siblings.
  expect(await order(page)).toEqual(['Alpha', 'Beta', 'Handbook']);
  await page.keyboard.press('ControlOrMeta+ArrowUp');
  await expect.poll(() => order(page)).toEqual(['Alpha', 'Handbook', 'Beta']);

  await page.keyboard.press('Delete');
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await tabTo(page, async () => (await focusedName(page)) === 'BUTTON:Delete', 'the Delete button');
  await page.keyboard.press('Enter');

  await expect(row(page, 'Handbook')).toBeHidden();
  await expect.poll(() => order(page)).toEqual(['Alpha', 'Beta']);
  await expect.poll(() => savedFile(page, 'release-plan.md')).toBe('');
});
