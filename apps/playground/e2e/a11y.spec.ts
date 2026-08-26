import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, freshVisit, openWorkspace, test, tree } from './fixtures.js';

/**
 * docs/09 P1-T13 and docs/10 section 2: axe over the three screens Phase 1 has. P3-T10 widens
 * this to every e2e screen; what is here has to stay clean until then.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** One line per violation, so a failure names the rule and the element instead of an object. */
async function violations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.nodes
        .map((node) => `${node.target.join(' ')} - ${node.any[0]?.message ?? ''}`)
        .join(', ')}`,
  );
}

/**
 * axe scores the pixels that are painted, and Radix plays the sheet in with `fade-in-0`, so a
 * scan taken on the first visible frame reads the page through a half-transparent panel.
 */
async function settled(locator: Locator): Promise<void> {
  await locator.evaluate(async (el) => {
    await Promise.all(
      el
        .getAnimations({ subtree: true })
        .map(async (animation) => animation.finished.catch(() => null)),
    );
  });
}

test.beforeEach(async ({ page }) => {
  await freshVisit(page);
});

test('the landing is clean @smoke', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Open demo' })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test('the shell and the tree are clean @smoke', async ({ page }) => {
  await openWorkspace(page, 'demo');
  await expect(tree(page)).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test('an open page is clean in both themes', async ({ page }) => {
  await openWorkspace(page, 'demo');
  await expect(tree(page)).toBeVisible();

  await page.keyboard.press('ControlOrMeta+p');
  await page.getByPlaceholder('Search pages…').fill('getting started');
  await page
    .getByRole('option', { name: /Getting started/ })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Getting started', level: 1 }).first(),
  ).toBeVisible();
  expect(await violations(page)).toEqual([]);

  // Contrast is the half of this that only dark mode can fail (docs/06 section 1).
  await page.keyboard.press('ControlOrMeta+p');
  await page.getByRole('option', { name: 'Switch theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  // The dialog fades out over the page; axe would score the contrast of both mid-animation.
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(await violations(page)).toEqual([]);
});

test('the phone layout is clean @smoke', async ({ page }) => {
  // The sheet sidebar and the icon-only header only exist below 768 px (docs/06 section 5), and
  // so do their own aria bugs: the desktop scans above cannot see either.
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page, 'demo');
  await expect(page.getByRole('button', { name: 'Show sidebar' })).toBeVisible();
  expect(await violations(page)).toEqual([]);

  await page.getByRole('button', { name: 'Show sidebar' }).click();
  await expect(tree(page)).toBeVisible();
  await settled(page.locator('[data-slot="sidebar"][data-mobile="true"]'));
  expect(await violations(page)).toEqual([]);
});

/**
 * docs/10 section 2 over the editor, not only the reader. Edit mode brings its own tree -
 * the editable itself, the gutter controls, list markers, and the off-screen input
 * `@platejs/selection` portals to the body (DEV-019, DEV-020) - and none of it is painted
 * on any screen the scans above visit.
 */
test('the editor is clean', async ({ page }) => {
  await openWorkspace(page, 'demo');
  await expect(tree(page)).toBeVisible();

  // A page with a bulleted list, an image and internal links: the block types whose editor
  // rendering differs most from the read view.
  await page.keyboard.press('ControlOrMeta+p');
  await page.getByPlaceholder('Search pages…').fill('product');
  await page
    .getByRole('option', { name: /Product/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Product', level: 1 }).first()).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('[data-slate-editor]')).toHaveAttribute('contenteditable', 'true');
  // The control colours itself in over 150 ms; axe would score the half-mixed grey.
  await settled(page.getByRole('button', { name: 'Done' }));
  expect(await violations(page)).toEqual([]);
});

/**
 * docs/09 P3-T10: the surfaces that only exist while something is open. Each one portals into
 * its own layer, takes the focus, and is invisible to every scan above.
 */
test('the floating surfaces are clean', async ({ page }) => {
  await openWorkspace(page, 'demo');
  await expect(tree(page)).toBeVisible();
  await page.getByRole('link', { name: 'Docs corpus', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Docs corpus', level: 1 }).first()).toBeVisible();

  await page.keyboard.press('ControlOrMeta+p');
  const palette = page.getByRole('dialog', { name: 'Search pages and actions' });
  await settled(palette);
  expect(await violations(page), 'command palette').toEqual([]);
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();

  const menu = async (item: string): Promise<void> => {
    await page.getByRole('button', { name: 'More options', exact: true }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await settled(page.getByRole('menu'));
    expect(await violations(page), 'page menu').toEqual([]);
    await page.getByRole('menuitem', { name: item }).click();
  };

  await menu('Move to');
  const move = page.getByRole('dialog', { name: 'Move to' });
  await settled(move);
  expect(await violations(page), 'move to').toEqual([]);
  await page.keyboard.press('Escape');
  await expect(move).toBeHidden();

  await menu('Change icon');
  const picker = page.getByRole('dialog', { name: 'Change icon' });
  await settled(picker);
  expect(await violations(page), 'icon picker').toEqual([]);
  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();

  await menu('Delete');
  const confirm = page.getByRole('alertdialog');
  await settled(confirm);
  expect(await violations(page), 'delete dialog').toEqual([]);
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toBeHidden();
});

/**
 * docs/06 section 15: at 390 px every row and every control a finger has to hit is 44 px tall.
 * The menus are the half of this a screenshot cannot show, because they are not painted until
 * they are opened.
 */
test('every touch target is 44 px at 390 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page, 'demo');

  /** Anything a finger can hit inside the region, by the box the browser lays out. */
  const small = async (region: Locator): Promise<string[]> => {
    const targets = region.locator(
      'button, a[href], [role="treeitem"], [role="menuitem"], [role="option"], input',
    );
    const boxes = await targets.evaluateAll((elements) =>
      elements
        .filter((element) => {
          // A control parked off-screen for the screen reader is not something a finger aims at.
          const rect = element.getBoundingClientRect();
          return element.checkVisibility() && rect.width > 8 && rect.height > 8;
        })
        .map((element) => {
          const { height } = element.getBoundingClientRect();
          // Inside `evaluate` the linter reads a DOM where `textContent` is never null.
          // The browser's is: an element that holds no text at all has none.
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          const name = (element.ariaLabel ?? element.textContent ?? '').trim().slice(0, 24);
          return { name, height };
        }),
    );
    return boxes.filter((box) => box.height < 44).map((box) => `${box.name}: ${box.height}px`);
  };

  // The module's own header, not the playground's chrome above it.
  const header = page.getByRole('region', { name: 'Document' }).locator('header');
  await expect(header).toBeVisible();
  expect(await small(header), 'header').toEqual([]);

  await page.getByRole('button', { name: 'Show sidebar' }).click();
  const sidebar = page.locator('[data-slot="sidebar"][data-mobile="true"]');
  await expect(tree(page)).toBeVisible();
  await settled(sidebar);
  expect(await small(sidebar), 'sidebar').toEqual([]);

  await page.getByRole('treeitem', { name: 'Docs corpus' }).hover();
  await page.getByRole('button', { name: 'More options for Docs corpus' }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  // The surface scales in over 100 ms, and a box measured mid-animation is 96% of itself.
  await settled(menu);
  expect(await small(menu), 'row menu').toEqual([]);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  // Taken from the keyboard: the pointer is parked on the row, under a menu that has just
  // closed, and the sheet is where a phone reaches the palette from.
  await page.getByRole('button', { name: 'Search' }).press('Enter');
  const palette = page.getByRole('dialog', { name: 'Search pages and actions' });
  await settled(palette);
  expect(await small(palette), 'palette').toEqual([]);
});

/**
 * docs/06 section 8: under `prefers-reduced-motion` a surface fades, and nothing moves. ASM-072
 * says why this reads the rule the browser applied rather than a pixel baseline.
 */
test('fades a menu in without moving it under reduced motion', async ({ page }) => {
  // `test.use({ reducedMotion })` does not reach the page through this file's fixtures.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openWorkspace(page, 'demo');
  await expect(tree(page)).toBeVisible();

  await page.getByRole('treeitem', { name: 'Docs corpus' }).hover();
  await page.getByRole('button', { name: 'More options for Docs corpus' }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();

  // The rule, not the frame: a running animation may already have finished when it is read.
  const motion = await menu.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      animation: style.animationDuration,
      transition: style.transitionDuration,
      transform: style.transform,
      variable: style.getPropertyValue('--docs-motion'),
    };
  });
  expect(motion.animation).toBe('0s');
  expect(motion.transition).toBe('0s');
  // The tree's own chevron and the sidebar read this instead of a utility (docs/06 section 8).
  expect(motion.variable).toBe('0ms');
  // Whatever it does with opacity, the surface is where it will stay from the first frame.
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(motion.transform);
});
