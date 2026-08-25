import { expect, freshVisit, openWorkspace, test, tree } from './fixtures.js';

/**
 * docs/09 P1-T11: the landing, the four modes, what survives a reload, and the rule that a
 * different workspace never paints the pages of the last one.
 */

test.beforeEach(async ({ page }) => {
  await freshVisit(page);
});

test('offers every mode this browser can serve @smoke', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Choose a workspace' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Demo' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Remote' })).toBeVisible();
  await expect(page.getByLabel('Base URL')).toBeVisible();

  // The folder card is hidden where the File System Access API is not implemented.
  const supported = await page.evaluate(() => 'showDirectoryPicker' in window);
  await expect(page.getByRole('heading', { name: 'Open folder' })).toBeVisible({
    visible: supported,
  });
  await expect(page.getByRole('heading', { name: 'Browser storage' })).toBeVisible();
});

test('opens the demo corpus and remembers it across a reload @smoke', async ({ page }) => {
  await openWorkspace(page, 'demo');

  await expect(tree(page)).toBeVisible();
  await page.getByRole('link', { name: 'Docs corpus' }).click();
  await expect(page.getByRole('heading', { name: 'Docs corpus', level: 1 }).first()).toBeVisible();

  await page.reload();
  // Straight back in: no landing, and the same page, because the URL carries it.
  await expect(page.getByRole('heading', { name: 'Choose a workspace' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Docs corpus', level: 1 }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Workspace: Demo' })).toBeVisible();
});

test('opens an empty browser workspace and keeps it after a reload', async ({ page }) => {
  await openWorkspace(page, 'opfs');

  await expect(page.getByRole('heading', { name: 'No pages yet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Workspace: Browser storage' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'No pages yet' })).toBeVisible();
});

test('never paints the last workspace when another one opens', async ({ page }) => {
  await openWorkspace(page, 'demo');
  await page.getByRole('link', { name: 'Docs corpus' }).click();
  await expect(page.getByRole('heading', { name: 'Docs corpus', level: 1 }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Workspace: Demo' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a workspace' })).toBeVisible();

  await openWorkspace(page, 'opfs');
  await expect(page.getByRole('heading', { name: 'No pages yet' })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'Docs corpus' })).toHaveCount(0);
});

test('connects to a remote backend over the http contract', async ({ page }) => {
  const meta = {
    contractVersion: 1,
    title: 'Remote docs',
    capabilities: {
      write: false,
      move: false,
      delete: false,
      upload: false,
      search: false,
      subscribe: false,
    },
  };
  const snapshot = {
    version: 'v1',
    nodes: [
      {
        id: 'p_remote',
        kind: 'page',
        title: 'Remote page',
        path: 'remote.md',
        parentId: null,
        childIds: [],
      },
    ],
  };

  await page.route('**/fake-api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/meta')) return route.fulfill({ json: meta });
    if (path.endsWith('/tree')) return route.fulfill({ json: snapshot });
    return route.fulfill({
      json: { meta: { title: 'Remote page' }, body: '# Remote page\n', version: 'v1' },
    });
  });

  await page.getByLabel('Base URL').fill('http://localhost:5173/fake-api');
  await page.getByRole('button', { name: 'Connect' }).click();

  await expect(page.getByRole('treeitem', { name: 'Remote page' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Workspace: Remote' })).toBeVisible();
});

test('reports a remote backend it cannot reach', async ({ page }) => {
  await page.route('**/missing-api/**', (route) => route.abort('connectionrefused'));

  await page.getByLabel('Base URL').fill('http://localhost:5173/missing-api');
  await page.getByRole('button', { name: 'Connect' }).click();

  await expect(page.getByText(/Cannot reach/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choose a workspace' })).toBeVisible();
});
