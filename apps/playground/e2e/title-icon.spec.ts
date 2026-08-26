import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { expect, freshVisit, openWorkspace, savedFile, seedFile, test } from './fixtures.js';

/**
 * docs/09 P2-T07: the title and the icon, both of which end up in the file's frontmatter
 * (docs/03 section 4.7) and in the tree row on the way there (docs/07 section 5).
 */

const EDITOR = '[data-slate-editor]';
const FILE = 'title.md';

/**
 * The emoji data is a fetch to a CDN (frimousse's default). The suite answers it itself: a
 * test that needs the network is a test that fails on a train, and a failed fetch here is a
 * console error, which is a failure of its own (docs/10 section 4).
 */
async function stubEmoji(page: Page): Promise<void> {
  await page.route('**/emojibase-data/**', async (route) => {
    const name = route.request().url().endsWith('messages.json') ? 'messages' : 'data';
    await route.fulfill({
      contentType: 'application/json',
      path: fileURLToPath(new URL(`./fixtures/emojibase-${name}.json`, import.meta.url)),
    });
  });
}

test.beforeEach(async ({ page, mode }) => {
  test.skip(mode !== 'opfs', 'reads the saved frontmatter back out of OPFS');

  await freshVisit(page);
  await stubEmoji(page);
  await seedFile(page, FILE, '---\nid: p_title\ntitle: Title page\n---\n\nBody\n');
  await openWorkspace(page, 'opfs');
  await page.getByRole('link', { name: 'Title page' }).click();
});

const saved = (page: Page): Promise<string> => savedFile(page, FILE);
const title = (page: Page) => page.getByRole('textbox', { name: 'Page title' });

async function edit(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'true');
}

/** Opens the picker from whichever control the page has: the icon, or "Add icon" if none. */
async function openPicker(page: Page): Promise<void> {
  await page.locator('[data-docs-title]').hover();
  const add = page.getByRole('button', { name: 'Add icon' });
  const change = page.getByRole('button', { name: 'Change icon' });
  await ((await add.isVisible()) ? add : change).click();
  await expect(page.getByRole('tab', { name: 'Emoji' })).toBeVisible();
}

test('the title commits to frontmatter and the tree row follows it', async ({ page }) => {
  await edit(page);
  await title(page).fill('Renamed page');

  // docs/07 section 5: the row updates on the debounce, not on the save.
  await expect(page.getByRole('link', { name: 'Renamed page' })).toBeVisible();
  await expect.poll(() => saved(page)).toContain('title: Renamed page');
  // docs/03 section 4.7: the title is frontmatter, and the body is not touched by it.
  await expect.poll(() => saved(page)).toContain('Body');
});

test('Enter in the title moves the caret into the body', async ({ page }) => {
  await edit(page);
  await title(page).click();
  await page.keyboard.press('Enter');

  await expect(page.locator(EDITOR)).toBeFocused();
  await page.keyboard.type('Typed ');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect.poll(() => saved(page)).toContain('Typed Body');
});

test('a click on the title in read mode opens the editor with the caret in the title', async ({
  page,
}) => {
  await page.getByRole('heading', { name: 'Title page' }).click();
  await expect(title(page)).toBeFocused();
});

test('the icons tab writes a lucide icon and Remove takes it off again', async ({ page }) => {
  await edit(page);
  await openPicker(page);
  await page.getByRole('tab', { name: 'Icons' }).click();
  await page.getByPlaceholder('Search…').fill('rocket');
  await page.getByRole('gridcell', { name: 'rocket', exact: true }).click();

  await expect.poll(() => saved(page)).toContain('icon: lucide:rocket');
  await openPicker(page);
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect.poll(() => saved(page)).not.toContain('icon:');
});

test('the emoji tab takes the highlighted emoji from the keyboard', async ({ page }) => {
  await edit(page);
  await openPicker(page);

  // docs/07 section 6: the emoji tab is the one that opens, with the search box focused.
  await page.keyboard.type('grinning');
  await page.keyboard.press('Enter');

  await expect.poll(() => saved(page)).toContain('icon: 😀');
});
