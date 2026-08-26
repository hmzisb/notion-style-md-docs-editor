import type { Locator, Page } from '@playwright/test';
import { clickCaret, expect, freshVisit, openWorkspace, seedFile, test, tree } from './fixtures.js';

/**
 * docs/09 P3-T14 and docs/06 section 15: the baselines a change has to survive. Every screen the
 * checklist names, at both sizes, in both themes - the alignment, the reserved widths and the
 * dark surfaces are what a diff here catches, and what no role query can see.
 *
 * The workspace is seeded rather than the demo corpus opened: a baseline is only as stable as
 * its content, and the corpus is a fixture that grows.
 */

const EDITOR = '[data-slate-editor]';
const THEMES = ['light', 'dark'] as const;

const PAGES: Record<string, string> = {
  'index.md': '---\nid: p_home\ntitle: Handbook\nicon: 📘\n---\n\n# Handbook\n\nEverything a new joiner needs, in one place.\n',
  'guides/index.md': '---\nid: p_guides\ntitle: Guides\n---\n\n# Guides\n\nHow the team works.\n',
  'guides/writing.md':
    '---\nid: p_writing\ntitle: Writing docs\n---\n\n# Writing docs\n\n' +
    'A page is a Markdown file. The editor is a convenience, never the format.\n\n' +
    '## What belongs here\n\n' +
    '- The decision and the reason for it\n' +
    '- The command that proves it\n' +
    '- Nothing a reader can get from the code\n\n' +
    '> [!NOTE]\n> Frontmatter you did not write is left exactly as it was found.\n\n' +
    '```ts\nexport const save = (body: string) => provider.savePage(id, { body, baseVersion });\n```\n',
  'reference/api.md': '---\nid: p_api\ntitle: API reference\n---\n\n# API reference\n\nOne table per entry point.\n',
};

/** Opens the seeded workspace in one theme, on the desktop viewport. */
async function visit(page: Page, theme: (typeof THEMES)[number]): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await freshVisit(page);
  for (const [name, body] of Object.entries(PAGES)) await seedFile(page, name, body);
  await page.evaluate((value) => {
    localStorage.setItem('docs-playground-theme', value);
  }, theme);
  await page.reload();
  await openWorkspace(page, 'opfs');
  await expect(tree(page)).toBeVisible();
}

/** A workspace opens with every folder collapsed, and a one-row tree is not worth a baseline. */
async function expandAll(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(page.getByRole('link', { name: 'Writing docs' })).toBeVisible();
}

/** The reading pane of the page a shot is about, opened and settled. */
async function open(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { name }).click();
  await expect(page.getByRole('heading', { name, level: 1 }).first()).toBeVisible();
}

/** The pointer goes to a dead corner first: a hovered row or a tooltip is not the baseline. */
async function shot(target: Page | Locator, name: string): Promise<void> {
  await ('mouse' in target ? target : target.page()).mouse.move(0, 0);
  await expect(target).toHaveScreenshot(name, { animations: 'disabled' });
}

test.describe('visual baselines (docs/06 section 15)', () => {
  test.beforeEach(({ mode }) => {
    // One project takes the shots: a second engine would only ever diff its own font stack.
    test.skip(mode !== 'opfs', 'the baselines are the Chromium OPFS run');
  });

  for (const theme of THEMES) {
    test(`the sidebar, ${theme}`, async ({ page }) => {
      await visit(page, theme);
      await expandAll(page);
      await shot(page.locator('[data-slot="sidebar"]').first(), `sidebar-${theme}.png`);
    });

    test(`a page in read mode, ${theme}`, async ({ page }) => {
      await visit(page, theme);
      await expandAll(page);
      await open(page, 'Writing docs');
      await shot(page, `read-${theme}.png`);
    });

    test(`the editor with the slash menu open, ${theme}`, async ({ page }) => {
      await visit(page, theme);
      await expandAll(page);
      await open(page, 'Writing docs');
      await page.getByRole('button', { name: 'Edit' }).click();
      await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'true');
      await clickCaret(page.locator(EDITOR).getByRole('heading', { name: 'Writing docs' }));
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.type('/');
      await expect(page.getByRole('listbox').getByRole('option').first()).toBeVisible();
      await shot(page, `slash-${theme}.png`);
    });

    test(`the command palette, ${theme}`, async ({ page }) => {
      await visit(page, theme);
      await page.keyboard.press('ControlOrMeta+p');
      const dialog = page.getByRole('dialog', { name: 'Search pages and actions' });
      await expect(dialog).toBeVisible();
      // Typing rather than the bare list: recents carry a relative time that ages between runs.
      await dialog.getByPlaceholder('Search pages…').fill('gui');
      await expect(dialog.getByRole('option', { name: 'Guides' }).first()).toBeVisible();
      await shot(dialog, `palette-${theme}.png`);
    });

    test(`the icon picker, ${theme}`, async ({ page }) => {
      await visit(page, theme);
      await open(page, 'Handbook');
      await page.getByRole('button', { name: 'Edit' }).click();
      await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'true');
      await page.locator('[data-docs-title]').hover();
      await page.getByRole('button', { name: 'Change icon' }).click();
      await expect(page.getByRole('tab', { name: 'Emoji' })).toBeVisible();
      // The emoji data is fetched, and a baseline of the loading line proves nothing.
      await expect(page.getByText('Loading emoji…')).toBeHidden();
      await shot(page.getByRole('dialog').first(), `icon-picker-${theme}.png`);
    });

    test(`the conflict banner, ${theme}`, async ({ page }) => {
      await visit(page, theme);
      await expandAll(page);
      await open(page, 'API reference');
      await page.getByRole('button', { name: 'Edit' }).click();
      await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'true');
      await clickCaret(page.locator(EDITOR).getByText('One table per entry point.'));
      await page.keyboard.type('Mine. ');

      // The file moves under the editor, the way another tab would move it (docs/04 section 3.5).
      await seedFile(
        page,
        'reference/api.md',
        '---\nid: p_api\ntitle: API reference\n---\n\n# API reference\n\nTheirs.\n',
      );
      await page.keyboard.press('ControlOrMeta+s');
      const banner = page.getByRole('alert').filter({ hasText: 'changed' });
      await expect(banner).toBeVisible();
      await shot(banner, `conflict-${theme}.png`);
    });

    test(`the phone layout with the sheet open, ${theme}`, async ({ page }) => {
      await visit(page, theme);
      // Opened first: below 768 px the sidebar is a sheet, and its rows are not on the page.
      await open(page, 'Handbook');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: 'Show sidebar' }).click();
      await expect(tree(page)).toBeVisible();
      await shot(page, `phone-sheet-${theme}.png`);
    });
  }
});
