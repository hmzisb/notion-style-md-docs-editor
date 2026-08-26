import type { Page } from '@playwright/test';
import { expect, freshVisit, openWorkspace, savedFile, seedFile, test } from './fixtures.js';

/**
 * docs/09 P2-T13, docs/05 section 6: an image can arrive as a file - picked from the block
 * that asked for a URL, or pasted into the page - and what the file gets is the path the
 * provider wrote it to. OPFS, because the point of this one is the bytes that land next to
 * the page: `packages/react/src/editor/upload.test.ts` covers the transforms.
 */

const EDITOR = '[data-slate-editor]';
const FILE = 'upload.md';

/** A 1x1 PNG: small enough to inline, real enough for the browser to decode. */
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test.beforeEach(async ({ page, mode }) => {
  test.skip(mode !== 'opfs', 'the uploaded file is read back out of OPFS');

  await freshVisit(page);
  await seedFile(page, FILE, '# Upload\n');

  await openWorkspace(page, 'opfs');
  await page.getByRole('link', { name: 'Upload' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'true');
  await page.locator(EDITOR).getByRole('heading', { name: 'Upload' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
});

/** Leaves the editor, which is what flushes the session (docs/04 section 3.1). */
async function done(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'false');
}

/** What ended up in `assets/` next to the page. */
const assets = (page: Page): Promise<string[]> =>
  page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('workspace');
    const found: string[] = [];
    try {
      const uploads = await dir.getDirectoryHandle('assets');
      for await (const [name] of uploads.entries()) found.push(name);
    } catch {
      // No directory yet, which is the answer.
    }
    return found.sort();
  });

/** The image the editor drew, once its bytes are decoded. */
const drawn = (page: Page): Promise<number> =>
  page
    .locator(`${EDITOR} img`)
    .first()
    .evaluate((node: HTMLImageElement) => node.naturalWidth);

test('picking a file from the block uploads it and puts the path in the page', async ({ page }) => {
  await page.keyboard.type('/Image');
  await page.getByRole('listbox').getByRole('option', { name: 'Image' }).click();
  await expect(page.getByRole('textbox', { name: 'Paste an image URL or path' })).toBeVisible();

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Upload' }).click(),
  ]);
  await chooser.setFiles({
    name: 'Flow Diagram.PNG',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG, 'base64'),
  });

  // The editor resolves the path it was handed the same way the read view does, so a picture
  // the browser can actually decode is the proof that the whole round trip works.
  await expect(page.locator(`${EDITOR} img`)).toBeVisible();
  await expect.poll(() => drawn(page)).toBe(1);
  // docs/03 section 4.10: slugged, next to the page, extension kept.
  expect(await assets(page)).toEqual(['flow-diagram.png']);

  await done(page);
  await expect.poll(() => savedFile(page, FILE)).toContain('![](assets/flow-diagram.png)\n');
});

test('pasting an image file uploads it under the block the caret is in', async ({ page }) => {
  await page.keyboard.type('Before');
  await page.locator(EDITOR).evaluate((node, bytes) => {
    const data = new DataTransfer();
    data.items.add(
      new File([Uint8Array.from(atob(bytes), (char) => char.codePointAt(0) ?? 0)], 'Pasted.png', {
        type: 'image/png',
      }),
    );
    node.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: data }));
  }, PNG);

  await expect(page.locator(`${EDITOR} img`)).toBeVisible();
  await expect.poll(() => drawn(page)).toBe(1);
  expect(await assets(page)).toEqual(['pasted.png']);

  await done(page);
  // Under the block the caret was in, on a line of its own.
  await expect.poll(() => savedFile(page, FILE)).toContain('Before\n\n![](assets/pasted.png)\n');
});
