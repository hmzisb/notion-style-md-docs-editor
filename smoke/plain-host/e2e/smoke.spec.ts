import { expect, test } from '@playwright/test';

/**
 * docs/11 section 7: a host with no Tailwind, composing the parts itself. What can only break
 * here is the shipped stylesheet - a rule that needed a class the host was supposed to compile,
 * or a reset that escaped `.docs-root` and restyled the host's own page.
 */
test('the parts render from the shipped stylesheet, and nothing leaks out of them', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));

  await page.goto('/');

  const tree = page.getByRole('tree');
  await expect(tree).toBeVisible();

  // docs/06 section 4: 240 px sidebar, 28 px rows. This host asked for the width by variable
  // and never sized a row at all, so both numbers come out of `styles.css` or not at all.
  // `clientWidth`, so that the host's own 1 px border is not counted as the module's width.
  const sidebar = await page.locator('aside').evaluate((node) => node.clientWidth);
  expect(sidebar, 'sidebar width from --docs-sidebar-width').toBe(240);
  const row = await page.getByRole('treeitem', { name: 'Handbook' }).boundingBox();
  expect(row?.height).toBe(28);

  // `index.md` is the root page and the other two hang off it, so the tree opens with one row.
  await page.getByRole('button', { name: 'Expand Handbook' }).click();
  await page.getByRole('treeitem', { name: 'Getting started' }).click();
  await expect(page.getByRole('heading', { name: 'Getting started', level: 1 })).toBeVisible();
  await expect(page.getByText('Install the package, import the styles.')).toBeVisible();

  // The paragraph outside `.docs-root` keeps the browser's own margin: the stylesheet carries
  // no preflight and styles no bare tag, so a host's page looks the same with it as without.
  const outside = await page
    .locator('#outside')
    .evaluate((node) => getComputedStyle(node).marginBlockStart);
  expect(outside, 'a preflight leaked out of .docs-root').toBe('16px');

  expect(problems, 'console errors').toEqual([]);
});
