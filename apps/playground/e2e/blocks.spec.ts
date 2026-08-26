import type { Locator, Page } from '@playwright/test';
import { expect, freshVisit, openWorkspace, savedFile, seedFile, test } from './fixtures.js';

/**
 * docs/09 P2-T05: the block set, driven the way a user drives it - slash menu, floating
 * toolbar, keyboard - and read back off disk as the Markdown of docs/05 section 2. The
 * snippet per block is unit-tested in `packages/react/src/editor/blocks.test.ts`; what only
 * a browser can prove is that the menu and the shortcuts run those same transforms and that
 * what they produce survives a save.
 */

const EDITOR = '[data-slate-editor]';
const FILE = 'blocks.md';

test.beforeEach(async ({ page, mode }) => {
  // The demo workspace lives in memory, so there are no bytes to assert against.
  test.skip(mode !== 'opfs', 'reads the saved file back out of OPFS');

  await freshVisit(page);
  await seedFile(page, FILE, '# Blocks\n');

  await openWorkspace(page, 'opfs');
  await page.getByRole('link', { name: 'Blocks' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'true');
  // A slash command starts in an empty block, which is what `Enter` at the end of the heading
  // the page opens with leaves the caret in.
  await page.locator(EDITOR).getByRole('heading', { name: 'Blocks' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
});

/** Leaves the editor, which is what flushes the session (docs/04 section 3.1). */
async function done(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'false');
}

/** The bytes on disk, polled by the caller: the save is a debounce behind the last keystroke. */
const saved = (page: Page): Promise<string> => savedFile(page, FILE);

/** The slash menu, scoped: the page has another listbox in the theme control. */
const menu = (page: Page): Locator => page.getByRole('listbox');

/** Opens the menu, filters it the way a user does, and takes the block by name. */
async function slash(page: Page, name: string): Promise<void> {
  await page.keyboard.type(`/${name}`);
  const item = menu(page).getByRole('option', { name });
  await expect(item).toBeVisible();
  await item.click();
  // Clicking a block leaves the caret where the menu was, so the next thing typed is content.
  await expect(page.locator(EDITOR)).toBeFocused();
}

test('the slash menu writes every block it offers as Markdown', async ({ page }) => {
  await slash(page, 'Heading 2');
  await page.keyboard.type('Section');
  await page.keyboard.press('Enter');

  await slash(page, 'Bulleted list');
  await page.keyboard.type('Item');
  await page.keyboard.press('Enter');

  await slash(page, 'To-do list');
  await page.keyboard.type('Task');
  // docs/07 section 2: `Cmd+Enter` ticks the box the caret is in.
  await page.keyboard.press('ControlOrMeta+Enter');
  await page.keyboard.press('Enter');

  await slash(page, 'Divider');

  await done(page);
  await expect.poll(() => saved(page)).toContain('## Section\n');
  const markdown = await saved(page);
  expect(markdown).toContain('- Item\n');
  // Two lists in a row cannot share a marker without merging into one, so the second takes
  // remark's other bullet. `bullet: '-'` (docs/05 section 3) is what the first list gets.
  expect(markdown).toMatch(/^[-*] \[x\] Task$/m);
  expect(markdown).toContain('---\n');
  // docs/05 section 2: the heading the file opened with is still the heading it saves - under
  // the frontmatter the first save stamps the page id into (docs/04 section 4).
  expect(markdown).toMatch(/^# Blocks$/m);
});

/** docs/05 section 5: the one block whose Markdown is a marker, so the golden is the marker. */
test('a callout saves as a GFM alert, and the picker changes which one', async ({ page }) => {
  await slash(page, 'Callout');
  await page.keyboard.type('Heads up');

  await done(page);
  await expect.poll(() => saved(page)).toContain('> [!NOTE]\n> Heads up\n');
  // Read mode draws it too, from the same variant (docs/05 section 7).
  await expect(page.getByText('Heads up')).toBeVisible();

  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'true');
  await page.getByRole('button', { name: 'Callout style' }).click();
  await page.getByRole('menuitemradio', { name: 'Warning' }).click();

  await done(page);
  await expect.poll(() => saved(page)).toContain('> [!WARNING]\n> Heads up\n');
});

test('the alert marker turns the block into a callout as it is typed', async ({ page }) => {
  // docs/05 section 5: `[!tip] ` is to a callout what `# ` is to a heading.
  await page.keyboard.type('[!tip] Handy');

  await done(page);
  await expect.poll(() => saved(page)).toContain('> [!TIP]\n> Handy\n');
});

/** docs/05 section 5: the toggle keeps its blocks after it, indented, inside `<details>`. */
test('a toggle saves as a details block, and Tab moves a block into it', async ({ page }) => {
  await slash(page, 'Toggle');
  await page.keyboard.type('More');
  // `Enter` in a closed toggle starts the next toggle, so the block that goes inside it is
  // turned back into text first (docs/07 section 2), and `Tab` is what moves it in.
  await page.keyboard.press('Enter');
  await page.keyboard.press('ControlOrMeta+Alt+0');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Inside');

  await done(page);
  await expect
    .poll(() => saved(page))
    .toContain('<details>\n<summary>More</summary>\n\nInside\n\n</details>\n');

  // The toggle `Tab` moved the block into is open, and it still folds in read mode, where
  // the editor is the one drawing it (docs/05 sections 7 and 8).
  const chevron = page.getByRole('button', { name: 'Show or hide the blocks inside' });
  await expect(chevron).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Inside')).toBeVisible();
  await chevron.click();
  await expect(page.getByText('Inside')).toBeHidden();
});

test('the slash menu groups its blocks and says when nothing matches', async ({ page }) => {
  await page.keyboard.type('/');
  await expect(menu(page).getByRole('option', { name: 'Heading 1' })).toBeVisible();
  // docs/06 section 8: four groups, each with its own label, and a description per row.
  for (const label of ['Basic blocks', 'Lists', 'Media', 'Advanced'])
    await expect(menu(page).getByText(label, { exact: true })).toBeVisible();
  await expect(menu(page).getByText('Big section heading')).toBeVisible();

  // docs/11 section 4: a popover portalled outside `.docs-root` gets none of the module's
  // variables, and paints as bare text over the page.
  expect(await menu(page).evaluate((el) => el.closest('.docs-root') !== null)).toBe(true);

  await page.keyboard.type('zzz');
  await expect(page.getByText('No results')).toBeVisible();
  await expect(menu(page).getByRole('option')).toHaveCount(0);

  // docs/07 section 4: Escape closes the menu and leaves the text alone.
  await page.keyboard.press('Escape');
  await expect(page.getByText('No results')).toBeHidden();
});

/** docs/05 section 5: the caption is the italic paragraph after the image, not its alt text. */
test('an image keeps its caption as the italic paragraph after it', async ({ page }) => {
  // Not `slash`: the image block asks for its URL in place (docs/05 section 6) and that field
  // is what takes the focus, so the caret does not go back to the editor here. Upload is P2-T13.
  await page.keyboard.type('/Image');
  const item = menu(page).getByRole('option', { name: 'Image' });
  await expect(item).toBeVisible();
  await item.click();
  const url = page.getByRole('textbox', { name: 'Paste an image URL or path' });
  await expect(url).toBeVisible();
  await url.fill('a.png');
  await page.keyboard.press('Enter');

  const caption = page.getByRole('textbox', { name: 'Write a caption…' });
  await expect(caption).toBeVisible();
  await caption.fill('What the picture shows.');

  await done(page);
  await expect.poll(() => saved(page)).toContain('![](a.png)\n\n*What the picture shows.*\n');
});

test('the floating toolbar marks a selection', async ({ page }) => {
  await page.keyboard.type('Bold me');
  // Selecting backwards over the last word is what puts the toolbar up.
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');

  // Radix draws the mark buttons as toggle items, so the label is what identifies them - and
  // an icon-only control that has none is unusable with a screen reader (docs/06 section 13).
  const toolbar = page.getByRole('toolbar', { name: 'Formatting' });
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByLabel('Turn into')).toBeVisible();
  await toolbar.getByLabel('Bold').click();

  await done(page);
  await expect.poll(() => saved(page)).toContain('Bold **me**\n');
});

test('the block shortcuts move and duplicate the block the caret is in', async ({ page }) => {
  await page.keyboard.type('One');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Two');

  // docs/07 section 2: `Cmd+Shift+Up` moves the block, `Cmd+D` duplicates it.
  await page.keyboard.press('ControlOrMeta+Shift+ArrowUp');
  await page.keyboard.press('ControlOrMeta+d');

  await done(page);
  await expect.poll(() => saved(page)).toContain('Two\n\nTwo\n\nOne\n');
});
