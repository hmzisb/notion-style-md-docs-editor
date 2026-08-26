import type { Locator, Page } from '@playwright/test';
import {
  expect,
  freshVisit,
  openWorkspace,
  runAction,
  savedFile,
  seedFile,
  test,
  tree,
} from './fixtures.js';

/**
 * docs/09 P3-T01: every way into a new page, and what a new page does once it is open -
 * docs/01 section 5.3 for the flow, docs/06 section 5 for where the controls are, docs/07
 * section 2 for the keyboard, docs/03 section 4.7 for the rename the first title carries.
 */

const HOME = 'home.md';

test.beforeEach(async ({ page, mode }) => {
  test.skip(mode !== 'opfs', 'reads the created files back out of OPFS');

  await freshVisit(page);
  await seedFile(page, HOME, '---\nid: p_home\ntitle: Home\n---\n\nHome\n');
  await openWorkspace(page, 'opfs');
  await expect(tree(page)).toBeVisible();
});

const title = (page: Page): Locator => page.getByRole('textbox', { name: 'Page title' });
const untitled = (page: Page): Locator => page.getByRole('treeitem', { name: 'Untitled' });
/** In DOM order: the sidebar header, the sidebar footer, then the empty card's own. */
const newPage = (page: Page): Locator => page.getByRole('button', { name: 'New page' });

/** docs/01 section 5.3: the page is open, in edit mode, with the title waiting for the name. */
async function expectOpenForNaming(page: Page): Promise<void> {
  await expect(untitled(page)).toBeVisible();
  await expect(page).toHaveURL(/mode=edit/);
  await expect(title(page)).toBeFocused();
  await expect(title(page)).toHaveValue('');
}

test('the sidebar header opens a page ready to be named, and the first title renames the file', async ({
  page,
}) => {
  await newPage(page).first().click();
  await expectOpenForNaming(page);

  await page.keyboard.type('Release plan');
  // docs/07 section 5: the row follows the debounce, not the save.
  await expect(page.getByRole('treeitem', { name: 'Release plan' })).toBeVisible();

  // docs/03 section 4.7: the file the provider created as `untitled.md` goes with the title.
  await expect.poll(() => savedFile(page, 'release-plan.md')).toContain('title: Release plan');
  expect(await savedFile(page, 'untitled.md')).toBe('');
});

test('the sidebar footer adds a root page', async ({ page }) => {
  await newPage(page).nth(1).click();

  await expect(untitled(page)).toHaveAttribute('aria-level', '1');
  await expect.poll(() => savedFile(page, 'untitled.md')).toContain('title: Untitled');
});

test('the empty card offers the page there is nothing to select', async ({ page }) => {
  // Nothing is open, so the content region is the "Select a page" card (docs/06 section 11).
  await expect(page.getByRole('heading', { name: 'Select a page' })).toBeVisible();
  await newPage(page).last().click();

  await expectOpenForNaming(page);
});

test("the row's + adds a page inside that row", async ({ page }) => {
  await page.getByRole('treeitem', { name: 'Home' }).hover();
  await page.getByRole('button', { name: 'Add a page inside Home' }).click();

  // docs/06 section 5: inside means inside, and the row it went into is open around it.
  await expect(untitled(page)).toHaveAttribute('aria-level', '2');
  await expectOpenForNaming(page);
  // docs/03 section 4.3: a page that gains children becomes the index of its own directory.
  await expect.poll(() => savedFile(page, HOME)).toBe('');
});

test('Cmd+Alt+N adds a page inside the one that is open', async ({ page }) => {
  await page.getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();

  await page.keyboard.press('ControlOrMeta+Alt+n');

  await expect(untitled(page)).toHaveAttribute('aria-level', '2');
  await expectOpenForNaming(page);
});

test('Cmd+Shift+ArrowRight adds a page inside the focused row', async ({ page }) => {
  // docs/07 section 2: the tree's own way to the `+`, which is not a tab stop of its own.
  await page.getByRole('treeitem', { name: 'Home' }).focus();
  await page.keyboard.press('ControlOrMeta+Shift+ArrowRight');

  await expect(untitled(page)).toHaveAttribute('aria-level', '2');
  await expectOpenForNaming(page);
});

test('the palette action creates a root page while none is open', async ({ page }) => {
  await runAction(page, 'New page');

  await expect(untitled(page)).toHaveAttribute('aria-level', '1');
  await expectOpenForNaming(page);
});

test('Shift+Enter in the palette names the page with the query', async ({ page }) => {
  const dialog = page.getByRole('dialog', { name: 'Search pages and actions' });
  await page.keyboard.press('ControlOrMeta+p');
  await dialog.getByPlaceholder('Search pages…').fill('Quarterly review');
  await page.keyboard.press('Shift+Enter');
  await expect(dialog).toBeHidden();

  // docs/01 section 5.3: a query that matched no page is a title, and the file takes its slug.
  await expect(page.getByRole('treeitem', { name: 'Quarterly review' })).toBeVisible();
  await expect(title(page)).toHaveValue('Quarterly review');
  await expect(page).toHaveURL(/mode=edit/);
  await expect
    .poll(() => savedFile(page, 'quarterly-review.md'))
    .toContain('title: Quarterly review');
});
