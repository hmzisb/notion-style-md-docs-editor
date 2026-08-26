import type { Locator, Page } from '@playwright/test';
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
 * docs/09 P2-T06: the gutter and block selection, both of which only exist in a browser - the
 * handle is a drag source, and the selection lives in a shadow input the plugin portals out of
 * the editor. What each one did is read back off disk as Markdown (docs/05 section 2).
 */

const EDITOR = '[data-slate-editor]';
const FILE = 'dnd.md';

test.beforeEach(async ({ page, mode }) => {
  // The demo workspace lives in memory, so there are no bytes to assert against.
  test.skip(mode !== 'opfs', 'reads the saved file back out of OPFS');

  await freshVisit(page);
  await seedFile(page, FILE, '# Dnd\n\nAlpha\n\nBravo\n');
  await openWorkspace(page, 'opfs');
  await page.getByRole('link', { name: 'Dnd' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'true');
});

/** Leaves the editor, which is what flushes the session (docs/04 section 3.1). */
async function done(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'false');
}

const saved = (page: Page): Promise<string> => savedFile(page, FILE);

/** A top-level block, wrapper and all: the gutter controls are in it, one set per block. */
const block = (page: Page, text: string): Locator =>
  page.locator(`${EDITOR} > div`).filter({ hasText: text });

/** The overlay `BlockSelection` draws over a selected block, and only over a selected one. */
const selected = (page: Page): Locator => page.locator('[data-slot="block-selection"]');

/**
 * Puts the caret in a block's text. On the text, not the block: a click on the wrapper's
 * padding leaves the caret nowhere - and every shortcut below acts on what Slate read back.
 */
async function caretIn(page: Page, text: string): Promise<void> {
  await clickCaret(page.locator(EDITOR).getByText(text));
}

test('the gutter handle drags a block to a new place', async ({ page }) => {
  const alpha = block(page, 'Alpha');
  const bravo = block(page, 'Bravo');

  // docs/06 section 7: the controls live in the page's left margin, so showing them moves no
  // text. Measured on the block itself, before and after the pointer arrives.
  const before = await alpha.boundingBox();
  await alpha.hover();
  await expect(alpha.getByLabel('Drag to move')).toBeVisible();
  expect(await alpha.boundingBox()).toEqual(before);

  await alpha.getByLabel('Drag to move').hover();
  await page.mouse.down();
  const target = await bravo.boundingBox();
  if (target === null) throw new Error('the block being dropped on is not on the page');
  // The drop line follows the pointer, and the half it is in decides which side of the block
  // the drop lands on: the lower half is below. Two moves, because the first one starts the
  // drag and the plugin reads the second (docs/05 section 6).
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  // The drop line is a `dragover` behind the pointer, and the backend only sees one per move:
  // the second half of the block has to be entered twice before the line is up.
  await page.mouse.move(target.x + target.width / 2, target.y + target.height - 6, { steps: 8 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height - 4, { steps: 4 });
  await expect(page.locator('.slate-dropLine')).toBeVisible();
  await page.mouse.up();

  await expect.poll(() => saved(page)).toContain('Bravo\n\nAlpha\n');
});

test('the gutter plus opens the slash menu in a new block below', async ({ page }) => {
  await block(page, 'Alpha').hover();
  await block(page, 'Alpha').getByLabel('Add a block below').click();

  // docs/05 section 6: the block is empty and the menu is already open in it.
  const menu = page.getByRole('listbox');
  await expect(menu.getByRole('option', { name: 'Heading 2' })).toBeVisible();
  await menu.getByRole('option', { name: 'Heading 2' }).click();
  await expect(page.locator(EDITOR)).toBeFocused();
  await page.keyboard.type('Below');

  await done(page);
  await expect.poll(() => saved(page)).toContain('Alpha\n\n## Below\n\nBravo\n');
});

test('Escape selects the block, the arrows move the selection, Cmd+D duplicates it', async ({
  page,
}) => {
  await caretIn(page, 'Alpha');
  // docs/05 section 6: Escape from a collapsed caret selects the block it is in.
  await page.keyboard.press('Escape');
  await expect(selected(page)).toHaveCount(1);

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ControlOrMeta+d');

  await done(page);
  await expect.poll(() => saved(page)).toContain('Alpha\n\nBravo\n\nBravo\n');
});

test('Cmd+A twice selects every block and Delete removes them', async ({ page }) => {
  await caretIn(page, 'Alpha');
  // docs/07 section 2: the first `Cmd+A` takes the block's own text, the second every block.
  await page.keyboard.press('ControlOrMeta+a');
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('Alpha');
  await expect(selected(page)).toHaveCount(0);
  // A beat, for the same reason: the second press reads the selection the first one made, and
  // pressing before Slate has read it back leaves the block selection to be cleared by it.
  await page.waitForTimeout(100);
  await page.keyboard.press('ControlOrMeta+a');
  // The heading and the two paragraphs. The page ends in one, so docs/05 section 6 adds no
  // trailing block to it.
  await expect(selected(page)).toHaveCount(3);

  await page.keyboard.press('Delete');
  await expect(page.locator(EDITOR).getByText('Alpha')).toHaveCount(0);

  await done(page);
  await expect.poll(() => saved(page)).not.toContain('Alpha');
});
