import { expect, freshVisit, openWorkspace, seedFile, test, tree } from './fixtures.js';

/**
 * docs/05 section 6: past 5,000 top-level blocks a page opens read-only behind the large-page
 * banner, and `Edit anyway` is the way past it. The threshold counts the blocks of the value,
 * so the fixture is written in Markdown blocks and checked against what it parses to.
 */

const EDITOR = '[data-slate-editor]';
const EDITABLE = '[contenteditable="true"]';
/** Over the 5,000-block threshold and not much more: every block here parses to one of the value. */
const BLOCKS = 5200;

/** The same shape as `fixtures/perf/gen.ts`, which `tsconfig.e2e.json` cannot reach. */
function largePage(blocks: number): string {
  const out = ['---', 'id: p_large', 'title: Large page', '---', '', '# Large page', ''];
  for (let i = 1; i <= blocks; i += 1) {
    switch (i % 5) {
      case 0:
        out.push(`## Section ${String(i)}`, '');
        break;
      case 1:
        out.push(`Paragraph ${String(i)} with **bold** and \`code\`.`, '');
        break;
      case 2:
        out.push(`- Item ${String(i)}`, '');
        break;
      case 3:
        out.push('```ts', `const n${String(i)} = ${String(i)};`, '```', '');
        break;
      default:
        out.push(`> Quote ${String(i)}`, '');
    }
  }
  return out.join('\n');
}

test('a page over the block threshold opens read-only, and Edit anyway opens it', async ({
  mode,
  page,
}) => {
  test.skip(mode !== 'opfs', 'the fixture is too big to seed twice');
  test.setTimeout(180_000);

  await freshVisit(page);
  await seedFile(page, 'large-page.md', largePage(BLOCKS));
  await openWorkspace(page, 'opfs');
  await expect(tree(page)).toBeVisible();

  await page.getByRole('treeitem', { name: 'Large page' }).click();
  await expect(page.getByRole('heading', { name: 'Large page', level: 1 }).first()).toBeVisible({
    timeout: 60_000,
  });

  // Read-only, and the banner says why (docs/06 section 10).
  await expect(page.getByText('Large page: opened in read mode for performance.')).toBeVisible();
  // The read view renders the same nodes, so what says read-only is that nothing takes a caret.
  await expect(page.locator(EDITABLE)).toHaveCount(0);

  // The header's Edit is still there, and it is not what gets past the guard.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByText('Large page: opened in read mode for performance.')).toBeVisible();
  await expect(page.locator(EDITABLE)).toHaveCount(0);

  // What this costs is measured against a real build in `perf.spec.ts`; a dev server serves
  // the editor chunk as a few hundred modules, and that is not the page's own cost.
  await page.getByRole('button', { name: 'Edit anyway' }).click();
  await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'true', {
    timeout: 120_000,
  });

  // It is the same page, editable in place: the first block is still the first block, and it
  // takes a caret and a keystroke.
  const first = page.getByText('Paragraph 1 with').first();
  await expect(first).toBeVisible();
  await first.click();
  await page.keyboard.type('typed');
  // Against the editor, not the paragraph: the caret lands where it was clicked, and the
  // insertion is inside the words the locator would have matched on.
  await expect(page.locator(EDITOR)).toContainText('typed', { timeout: 30_000 });
});
