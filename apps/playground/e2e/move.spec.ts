import type { Locator, Page } from '@playwright/test';
import { expect, freshVisit, openWorkspace, savedFile, seedFile, test, tree } from './fixtures.js';

/**
 * docs/09 P3-T03: the four ways a page changes place - dropped between two rows, dropped onto
 * one, moved with the keyboard, or picked out of the Move to dialog - plus the guard that keeps
 * a subtree out of itself (docs/07 section 3).
 */

const ROW = 28;

test.beforeEach(async ({ page, mode }) => {
  test.skip(mode !== 'opfs', 'moves rewrite files, so it reads them back out of OPFS');

  await freshVisit(page);
  await seedFile(page, 'alpha.md', '---\nid: p_alpha\ntitle: Alpha\norder: 10\n---\n\nAlpha\n');
  await seedFile(page, 'beta.md', '---\nid: p_beta\ntitle: Beta\norder: 20\n---\n\nBeta\n');
  await seedFile(page, 'gamma.md', '---\nid: p_gamma\ntitle: Gamma\norder: 30\n---\n\nGamma\n');
  await openWorkspace(page, 'opfs');
  await expect(tree(page)).toBeVisible();
});

const row = (page: Page, title: string): Locator => page.getByRole('treeitem', { name: title });

/** The titles the tree is showing, top to bottom. */
const order = async (page: Page): Promise<string[]> =>
  (await page.getByRole('treeitem').allInnerTexts()).map((text) => text.split('\n')[0]?.trim() ?? '');

/** A drop in the top quarter of a row inserts above it; the middle half drops inside it. */
async function drag(page: Page, from: string, to: string, y: number): Promise<void> {
  await row(page, from).dragTo(row(page, to), { targetPosition: { x: 80, y } });
}

test('a drop between two rows reorders them', async ({ page }) => {
  await drag(page, 'Gamma', 'Alpha', 2);

  await expect.poll(() => order(page)).toEqual(['Gamma', 'Alpha', 'Beta']);
  // docs/03 section 4.4: the order is written to the file, so a reload keeps it. The row moved
  // optimistically (docs/04 section 4), so the file is what says the provider has caught up -
  // reloading before it has is a reload that interrupts the write.
  await expect.poll(() => savedFile(page, 'gamma.md')).toContain('order: 0');
  await page.reload();
  await expect(tree(page)).toBeVisible();
  await expect.poll(() => order(page)).toEqual(['Gamma', 'Alpha', 'Beta']);
});

test('a drop below the last row puts the page after it', async ({ page }) => {
  await drag(page, 'Alpha', 'Gamma', ROW - 2);

  await expect.poll(() => order(page)).toEqual(['Beta', 'Gamma', 'Alpha']);
});

test('a drop onto a row makes the page a child of it', async ({ page }) => {
  await drag(page, 'Gamma', 'Alpha', ROW / 2);

  // The parent opens: a row dropped into a collapsed page would land where nothing can see it.
  await expect(row(page, 'Gamma')).toHaveAttribute('aria-level', '2');
  await expect.poll(() => order(page)).toEqual(['Alpha', 'Gamma', 'Beta']);
});

test('a page cannot be dropped inside its own subtree', async ({ page }) => {
  await drag(page, 'Gamma', 'Alpha', ROW / 2);
  await expect(row(page, 'Gamma')).toHaveAttribute('aria-level', '2');

  // docs/07 section 3: the descendant guard. Nothing is drawn and nothing moves.
  const onto = (await row(page, 'Gamma').boundingBox()) ?? { x: 0, y: 0 };
  await row(page, 'Alpha').hover();
  await page.mouse.down();
  await page.mouse.move(onto.x + 80, onto.y + 2, { steps: 5 });
  // Over a place it can go first, so a line that stayed would be a line drawn over one it cannot.
  await expect(page.locator('[data-slot="tree-drag-line"]')).toBeVisible();
  await page.mouse.move(onto.x + 80, onto.y + ROW / 2, { steps: 5 });
  await expect(page.locator('[data-slot="tree-drag-line"]')).toBeHidden();
  await page.mouse.up();

  await expect(row(page, 'Alpha')).toHaveAttribute('aria-level', '1');
  await expect.poll(() => order(page)).toEqual(['Alpha', 'Gamma', 'Beta']);
});

test('Esc during a drag cancels it', async ({ page }) => {
  const to = (await row(page, 'Alpha').boundingBox()) ?? { x: 0, y: 0 };
  // Two moves: the first starts the drag, the second is the one the tree reads a target out of.
  await row(page, 'Gamma').hover();
  await page.mouse.down();
  await page.mouse.move(to.x + 80, to.y + ROW / 2, { steps: 5 });
  await page.mouse.move(to.x + 80, to.y + 2, { steps: 5 });

  const line = page.locator('[data-slot="tree-drag-line"]');
  await expect(line).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.up();

  await expect(line).toBeHidden();
  await expect.poll(() => order(page)).toEqual(['Alpha', 'Beta', 'Gamma']);
});

test('Cmd+ArrowUp moves the focused row up among its siblings', async ({ page }) => {
  await row(page, 'Beta').focus();
  await page.keyboard.press('ControlOrMeta+ArrowUp');

  await expect.poll(() => order(page)).toEqual(['Beta', 'Alpha', 'Gamma']);
  // The row keeps the keyboard, so the next press moves the same page again.
  await expect(row(page, 'Beta')).toBeFocused();
});

test('the row menu moves a page with the Move to dialog', async ({ page }) => {
  await row(page, 'Gamma').hover();
  await page.getByRole('button', { name: 'More options for Gamma' }).click();
  await page.getByRole('menuitem', { name: 'Move to' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('option', { name: 'Alpha' }).click();

  await expect(row(page, 'Gamma')).toHaveAttribute('aria-level', '2');
  await expect.poll(() => order(page)).toEqual(['Alpha', 'Gamma', 'Beta']);
});
