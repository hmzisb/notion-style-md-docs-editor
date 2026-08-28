import { expect, test } from '@playwright/test';

/**
 * docs/11 section 7: a Tailwind v4 host that consumes `dist`. What can only break here is
 * packaging - an export the map does not resolve, a class Tailwind never compiled because
 * `@source` missed the package, a style that needs the host's own preflight.
 */
test('the tree renders, a page opens, and the module brought its own layout', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));

  await page.goto('/');

  const tree = page.getByRole('tree');
  await expect(tree).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'Handbook' })).toBeVisible();

  // The shell's own column is `grid-cols-[var(--docs-sidebar-width)_1fr]`: an arbitrary
  // value Tailwind compiles only if `@source` pointed it at the package. Without it the
  // element is not a grid at all, so the computed columns are the proof, and 240 px is the
  // sidebar docs/06 section 4 asks for.
  await expect(page.getByRole('navigation', { name: 'Pages' })).toBeVisible();
  const columns = await page
    // `:not` because the module also puts a bare `.docs-root` on its portal container,
    // so that a dialog rendered into `body` still gets the variables (docs/06 section 3).
    .locator('.docs-root:not([data-docs-portal])')
    .evaluate((node) => getComputedStyle(node).gridTemplateColumns);
  expect(columns).toMatch(/^240px /);

  // `index.md` is the root page and the other two hang off it, so the tree opens with one row.
  await page.getByRole('button', { name: 'Expand Handbook' }).click();
  await page.getByRole('treeitem', { name: 'Getting started' }).click();
  // Two of them: the shell's own page title, then the file's leading H1 inside the document.
  await expect(
    page.getByRole('heading', { name: 'Getting started', level: 1 }).first(),
  ).toBeVisible();
  await expect(page.getByText('Install the package, import the styles.')).toBeVisible();

  // The editor is a lazy chunk and the heaviest thing the package ships. Mounting it here is
  // what backs the React 18.3 half of the peer range: everything else in the repo runs 19, so a
  // hook or a ref that only works on 19 surfaces here, as a console error the assertion below
  // is already watching for.
  await page.getByRole('button', { name: 'Edit' }).click();
  const editor = page.locator('[data-slate-editor]');
  await expect(editor).toBeVisible();
  // `delay`, so the first keystroke does not race the caret the click is still placing. Where
  // in the paragraph it lands does not matter here - the playground suite owns caret behaviour,
  // this only has to prove the editor takes a keystroke at all on this React.
  await editor.getByText('Install the package, import the styles.').click({ delay: 60 });
  await page.keyboard.type('Typed into the editor.');
  await expect(editor).toContainText('Typed into the editor.');
  await page.getByRole('button', { name: 'Done' }).click();
  // Read mode keeps the same tree and turns it read-only, so the swap costs no reflow (docs/05
  // section 8). The editor element staying put is the shape to assert, not it disappearing.
  await expect(editor).toHaveAttribute('contenteditable', 'false');
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();

  expect(problems, 'console errors').toEqual([]);
});
