import type { Page } from '@playwright/test';
import { expect, freshVisit, openWorkspace, seedFile, test } from './fixtures.js';

/**
 * docs/04 section 3.3, the mismatched-draft path: a draft written against a version the file no
 * longer has. Staged by writing the record the module would have written, which is the only way
 * to reach that path without two tabs and a clock.
 */

const FILE = 'compare.md';
const BODY = 'Original line';
const EXTRA = 'and a line only the draft has';
/** The databases the caches open; idb-keyval names the store after the database. */
const QUERIES = 'docs-queries';
const DRAFTS = 'docs-drafts';

/** Every key the persisted query cache holds, which all start with the instance's namespace. */
function queryKeys(page: Page): Promise<string[]> {
  return page.evaluate(
    (name) =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open(name);
        open.onerror = (): void => {
          reject(new Error(`could not open ${name}`));
        };
        open.onsuccess = (): void => {
          const request = open.result.transaction(name, 'readonly').objectStore(name).getAllKeys();
          request.onsuccess = (): void => {
            resolve(request.result.map(String));
          };
          request.onerror = (): void => {
            reject(new Error(`could not read ${name}`));
          };
        };
      }),
    QUERIES,
  );
}

/** The record `drafts.ts` would have written, with a `baseVersion` no file can match. */
function writeStaleDraft(page: Page, key: string, body: string): Promise<void> {
  return page.evaluate(
    ([name, at, draft]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(name);
        // The store is created on demand, exactly as idb-keyval creates it.
        open.onupgradeneeded = (): void => {
          open.result.createObjectStore(name);
        };
        open.onerror = (): void => {
          reject(new Error(`could not open ${name}`));
        };
        open.onsuccess = (): void => {
          const tx = open.result.transaction(name, 'readwrite');
          tx.objectStore(name).put(draft, at);
          tx.oncomplete = (): void => {
            resolve();
          };
          tx.onerror = (): void => {
            reject(new Error('could not write the draft'));
          };
        };
      }),
    [
      DRAFTS,
      key,
      JSON.stringify({ body, baseVersion: 'sha256:stale', updatedAt: Date.now() }),
    ] as const,
  );
}

test.beforeEach(async ({ page, mode }) => {
  test.skip(mode !== 'opfs', 'needs a draft that outlives a reload');

  await freshVisit(page);
  await seedFile(page, FILE, `---\nid: p_cmp\ntitle: Compare page\n---\n\n${BODY}\n`);
  await openWorkspace(page, 'opfs');
  await page.getByRole('link', { name: 'Compare page' }).click();
  await expect(page.getByText(BODY)).toBeVisible();
});

test('compares the file with a draft written against another version', async ({ page }) => {
  // The namespace is a hash of the provider key (`data/keys.ts`), so it is read back off the
  // cache this page just persisted rather than recomputed here.
  await expect.poll(() => queryKeys(page), { timeout: 15_000 }).not.toHaveLength(0);
  const ns = (await queryKeys(page))[0]?.split(':q')[0] ?? '';
  expect(ns).not.toBe('');

  await writeStaleDraft(page, `${ns}:d:p_cmp`, `${BODY}, ${EXTRA}\n`);
  await page.reload();
  await page.getByRole('link', { name: 'Compare page' }).click();
  await expect(page.getByText('This page changed since your unsaved edits.')).toBeVisible();

  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Compare with the file');
  await expect(dialog).toContainText(`${BODY}, ${EXTRA}`);

  // Looking is not answering: the banner is still asking when the dialog closes.
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('This page changed since your unsaved edits.')).toBeVisible();

  await page.getByRole('button', { name: 'Apply draft' }).click();
  await expect(page.getByText(`${BODY}, ${EXTRA}`)).toBeVisible();
});
