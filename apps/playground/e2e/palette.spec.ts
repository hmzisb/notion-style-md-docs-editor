import { expect, freshVisit, openWorkspace, test, tree } from './fixtures.js';

/** docs/09 P1-T12: the palette and the global shortcuts, on the demo corpus. */

test.beforeEach(async ({ page }) => {
  await freshVisit(page);
  await openWorkspace(page, 'demo');
  await expect(tree(page)).toBeVisible();
});

const palette = () => ({ name: 'Search pages and actions' }) as const;

test('opens from the sidebar row and from the keyboard @smoke', async ({ page }) => {
  await page.getByRole('button', { name: 'Search' }).click();
  const dialog = page.getByRole('dialog', palette());
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('option', { name: /Toggle sidebar/ })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.keyboard.press('ControlOrMeta+p');
  await expect(page.getByRole('dialog', palette())).toBeVisible();
});

test('finds a page by title and opens it @smoke', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+k');
  const dialog = page.getByRole('dialog', palette());
  await dialog.getByPlaceholder('Search pages…').fill('getting star');

  const hit = dialog.getByRole('option', { name: /Getting started/ });
  await expect(hit).toBeVisible();
  // docs/06 section 8: the trail under the title says which page this is.
  await expect(hit).toContainText('Guides');
  await hit.click();

  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('heading', { name: 'Getting started', level: 1 }).first(),
  ).toBeVisible();
  expect(page.url()).toContain('/p/');
});

test('finds a page by what is written in it @smoke', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+p');
  const dialog = page.getByRole('dialog', palette());
  // The word is in one page's body and in no page's title (docs/09 P4-T07).
  await dialog.getByPlaceholder('Search pages…').fill('idempotent');

  // docs/07 section 2: content hits land under Results, after the 250 ms debounce.
  await expect(dialog.getByText('Results')).toBeVisible();
  const hit = dialog.locator('[data-page-id]');
  await expect(hit).toHaveCount(1);
  await expect(hit).toContainText('Webhooks');
  await expect(hit).toContainText('handler must be idempotent');

  await hit.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Webhooks', level: 1 }).first()).toBeVisible();
});

test('shows the pages opened last when nothing is typed', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+p');
  let dialog = page.getByRole('dialog', palette());
  await dialog.getByPlaceholder('Search pages…').fill('roadmap');
  await dialog.getByRole('option', { name: /Roadmap/ }).click();
  await expect(page.getByRole('heading', { name: 'Roadmap', level: 1 }).first()).toBeVisible();

  await page.keyboard.press('ControlOrMeta+p');
  dialog = page.getByRole('dialog', palette());
  await expect(dialog.getByText('Recent')).toBeVisible();
  await expect(dialog.getByRole('option', { name: /Roadmap/ })).toBeVisible();
});

test('runs its actions: theme and sidebar', async ({ page }) => {
  const dialog = page.getByRole('dialog', palette());

  await page.keyboard.press('ControlOrMeta+p');
  await dialog.getByRole('option', { name: /Switch theme/ }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  // The dialog animates out; a second one opened over it would be a different element.
  await expect(dialog).toBeHidden();

  await page.keyboard.press('ControlOrMeta+p');
  await dialog.getByRole('option', { name: /Toggle sidebar/ }).click();
  // The column animates to zero and clips its content, which keeps its own box (docs/06 §4).
  await expect(page.getByRole('navigation', { name: 'Pages' })).not.toBeInViewport();
  await expect(page.getByRole('button', { name: 'Show sidebar' })).toBeVisible();
});

test('creates a page from the query, without disturbing the layout', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+p');
  const dialog = page.getByRole('dialog', palette());
  await dialog.getByPlaceholder('Search pages…').fill('Release notes');
  // docs/07 section 2: a query that matched no page is a title (P3-T01 wired it up).
  await page.keyboard.press('Shift+Enter');
  // The row lands at the end of a corpus the tree only renders a window of, so the page itself
  // is what says the create happened: open, in edit mode, already carrying the name.
  await expect(page.getByRole('textbox', { name: 'Page title' })).toHaveValue('Release notes');
  await expect(page).toHaveURL(/mode=edit/);

  // docs/06 section 4: the shell is two columns in one row. The toaster is a shell child, so
  // anything it adds to the grid's flow would push the sidebar and the content off the bottom.
  const rows = await page
    .locator('[data-slot="sidebar-wrapper"]')
    .evaluate((el) => getComputedStyle(el).gridTemplateRows);
  expect(rows.trim().split(/\s+/)).toHaveLength(1);
});

test('keeps the palette out of a text input', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+p');
  const dialog = page.getByRole('dialog', palette());
  await dialog.getByPlaceholder('Search pages…').fill('spec');
  // Inside the palette's own input, `Cmd+K` types nothing and opens nothing on top of it.
  await page.keyboard.press('ControlOrMeta+k');
  await expect(dialog).toHaveCount(1);
  await expect(dialog.getByPlaceholder('Search pages…')).toHaveValue('spec');
});
