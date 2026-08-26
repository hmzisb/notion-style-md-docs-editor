import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { expect, freshVisit, openWorkspace, test } from './fixtures.js';

/**
 * docs/09 P2-T14, docs/01 section 7: the promise the whole module rests on. Every page of the
 * corpus that round trips exactly is opened, edited by one word and read back off OPFS - and
 * the diff has to be that word and nothing else. The unit suites prove the codec; this proves
 * the app around it, with a real editor, a real save and real bytes on disk.
 */

const CORPUS = fileURLToPath(new URL('../../../fixtures/corpus/', import.meta.url));
const EDITOR = '[data-slate-editor]';
const WORD = 'zebra';
/** macOS has no line-end key: `End` scrolls the page there, `Cmd+Right` moves the caret. */
const LINE_END = process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End';
/** One page's worth of patience: 30 of them share the test's own budget. */
const STEP = 10_000;
/** The database and the store the draft cache opens (packages/react `cache/idb.ts`). */
const DRAFTS = 'docs-drafts';

interface CorpusPage {
  path: string;
  title: string;
  fidelity: { level: string };
}

const manifest = JSON.parse(readFileSync(`${CORPUS}manifest.json`, 'utf8')) as {
  pages: CorpusPage[];
  assets: string[];
};
const read = (path: string): string => readFileSync(`${CORPUS}${path}`, 'utf8');
const exact = manifest.pages.filter((page) => page.fidelity.level === 'exact');

/** Everything a line carries that is drawn rather than written out. */
const MARK = /`[^`]*`|\*\*[^*]*\*\*|\*[^*]*\*|_[^_]*_|\[[^\]]*\]\([^)]*\)|<[^>]+>/;
const marker = (line: string): string =>
  line.trim().replace(/^(?:[-*+]\s+(?:\[[ x]\]\s+)?|\d+\.\s+|>\s?)+/, '');

/** The text a line reaches the DOM as: the marks are drawn, their syntax is not. */
const plain = (line: string): string =>
  marker(line)
    .replaceAll(/`([^`]+)`/g, '$1')
    .replaceAll(/\*\*([^*]+)\*\*/g, '$1')
    .replaceAll(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
    .trim();

/**
 * The longest run of a line that reaches the DOM as one piece. A mark is its own node, so
 * `a stable ` + `code` + `. Never match` is three of them and no locator sees the sentence.
 */
const segment = (line: string): string =>
  marker(line)
    .split(new RegExp(MARK, 'g'))
    .map((part) => part.trim())
    .reduce((best, part) => (part.length > best.length ? part : best), '');

/**
 * A line of one page to type into: one source line, so that inserting a word touches one
 * line, and findable in the DOM by its own text. Fences, toggles, tables and links are left
 * alone - the first three re-render as a whole, and clicking the last one navigates.
 */
function anchorOf(source: string): string {
  // One page of the corpus is CRLF (docs/01 section 7); its line ends are not its content.
  const lines = source.replaceAll('\r\n', '\n').split('\n');
  const start = lines[0] === '---' ? lines.indexOf('---', 1) + 1 : 0;
  const body = lines.slice(start);
  const texts = body.map(plain);
  // `getByText` has to land on one block, so the text has to belong to one line.
  const once = (text: string): boolean =>
    texts.filter((other) => other.includes(text)).length === 1;

  const candidates: { text: string; marked: boolean }[] = [];
  let fenced = false;
  let html = 0;
  for (const line of body) {
    if (line.trimStart().startsWith('```')) {
      fenced = !fenced;
      continue;
    }
    if (line.startsWith('<details')) html += 1;
    if (line.startsWith('</details')) html -= 1;
    if (fenced || html > 0) continue;
    if (line.startsWith('    ') || line.startsWith('\t')) continue;
    if (/^\s*(?:[#|<!]|---|$)/.test(line)) continue;

    const text = segment(line);
    // Anything left over is syntax the DOM does not carry as text: a callout label, a link.
    if (text.length < 8 || text.length > 70 || /[[\]`*_<>|]/.test(text)) continue;
    if (!once(text)) continue;
    candidates.push({ text, marked: text !== plain(line) });
  }
  // A line with no marks in it first: the caret then lands in plain text either way.
  candidates.sort((a, b) => Number(a.marked) - Number(b.marked) || a.text.length - b.text.length);
  const [best] = candidates;
  if (best === undefined) throw new Error('no line to type into');
  return best.text;
}

/** The bytes of a page in the OPFS workspace, or `''` while a write is in flight. */
const saved = (page: Page, path: string): Promise<string> =>
  page.evaluate(async (file) => {
    try {
      let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('workspace');
      const parts = file.split('/');
      const name = parts.pop() ?? '';
      for (const part of parts) dir = await dir.getDirectoryHandle(part);
      return await (await (await dir.getFileHandle(name)).getFile()).text();
    } catch {
      return '';
    }
  }, path);

/** Writes the corpus into OPFS before it is opened, directories and all. */
async function seedCorpus(page: Page): Promise<void> {
  const files = manifest.pages.map((entry) => ({ path: entry.path, body: read(entry.path) }));
  const assets = manifest.assets.map((path) => ({
    path,
    body: readFileSync(`${CORPUS}${path}`).toString('base64'),
  }));

  await page.evaluate(
    async (seed) => {
      const root = await navigator.storage.getDirectory();
      const at = async (path: string): Promise<[FileSystemDirectoryHandle, string]> => {
        let dir = await root.getDirectoryHandle('workspace', { create: true });
        const parts = path.split('/');
        const name = parts.pop() ?? '';
        for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
        return [dir, name];
      };
      for (const file of [...seed.files, ...seed.assets]) {
        const [dir, name] = await at(file.path);
        const handle = await dir.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(
          seed.files.includes(file)
            ? file.body
            : Uint8Array.from(atob(file.body), (char) => char.codePointAt(0) ?? 0),
        );
        await writable.close();
      }
    },
    { files, assets },
  );
}

/** Opens a page by title, the way the keyboard opens one (docs/07 section 4). */
async function openPage(page: Page, title: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Search pages and actions' });
  await page.keyboard.press('ControlOrMeta+p');
  await dialog.getByPlaceholder('Search pages…').fill(title);
  await expect(dialog.getByRole('option', { name: title }).first()).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
}

/** Opens one page, types the word at the end of the anchor's line and leaves the editor. */
async function editOneWord(page: Page, entry: CorpusPage, anchor: string): Promise<void> {
  await openPage(page, entry.title);
  await page.getByRole('button', { name: 'Edit' }).click();
  // A page over the block threshold asks first (docs/05 section 6); this one is here to be
  // edited.
  const anyway = page.getByRole('button', { name: 'Edit anyway' });
  if (await anyway.isVisible()) await anyway.click();
  await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'true');

  const line = page.locator(EDITOR).getByText(anchor, { exact: false }).last();
  await line.scrollIntoViewIfNeeded({ timeout: STEP });
  await line.click({ timeout: STEP });
  await typeWord(page);
  await done(page);
}

/**
 * The word, at the end of the line the caret is on. On a long page the caret move is a render
 * behind the key that asked for it, and a word typed at browser speed lands around it - which
 * is this file's own race, not the editor's.
 */
async function typeWord(page: Page): Promise<void> {
  await page.keyboard.press(LINE_END);
  await page.waitForTimeout(100);
  await page.keyboard.type(WORD, { delay: 20 });
}

const first = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';

/** Leaves the editor, which is what flushes the session (docs/04 section 3.1). */
async function done(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'false');
}

/**
 * The first save stamps the page id into frontmatter and nothing else (docs/03 section 4.2,
 * DEVIATIONS DEV-002), so the id line is not part of the diff this file is about. A page that
 * had no frontmatter at all gets the block back off again.
 */
function withoutId(text: string): string {
  // The CRLF page keeps its line ends through the save, fence and all (docs/03 section 5).
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  if (!text.startsWith(`---${eol}`)) return text;
  const end = text.indexOf(`${eol}---${eol}`, 3);
  if (end === -1) return text;
  const keys = text.slice(3 + eol.length, end).split(eol);
  const kept = keys.filter((line) => !line.startsWith('id: '));
  if (kept.length === keys.length) return text;
  const rest = text.slice(end + 3 + eol.length * 2);
  return kept.length === 0
    ? rest.replace(new RegExp(`^${eol}`), '')
    : `---${eol}${kept.join(eol)}${eol}---${eol}${rest}`;
}

/**
 * The one thing this file asserts: `after` is `before` with `word` inserted once, in one
 * line, and every other byte where it was. Returns the line as a message when it is not.
 */
function onlyInsertion(before: string, after: string, word: string): string {
  const from = withoutId(before).split('\n');
  const to = withoutId(after).split('\n');
  const changed = from.map((_line, index) => index).filter((index) => from[index] !== to[index]);
  const show = (index: number): string =>
    `line ${index.toString()}: ${JSON.stringify(from[index])} -> ${JSON.stringify(to[index])}`;
  if (from.length !== to.length)
    return `line count moved: ${from.length} -> ${to.length}, ${show(changed[0] ?? from.length - 1)}`;
  if (changed.length !== 1)
    return `${changed.length.toString()} lines changed: ${changed.map(show).join('; ')}`;

  const index = changed[0] ?? 0;
  const [was, now] = [from[index] ?? '', to[index] ?? ''];
  if (now.replace(word, '') !== was) return `line ${index.toString()}: ${was} -> ${now}`;
  return '';
}

test.describe('the corpus round trip (docs/01 section 7)', () => {
  test.beforeEach(async ({ page, mode }) => {
    test.skip(mode !== 'opfs', 'the file is read back out of OPFS');
    await freshVisit(page);
    await seedCorpus(page);
    await openWorkspace(page, 'opfs');
    await expect(page.getByRole('tree')).toBeVisible();
  });

  test('an edited word is the whole diff, for every page that round trips exactly', async ({
    page,
  }) => {
    // 30 pages, each opened, edited and read back off disk.
    test.setTimeout(300_000);

    const broken: string[] = [];
    for (const entry of exact) {
      const before = read(entry.path);
      // Every page is reported, not just the first one that goes wrong: 30 pages are 30
      // answers, and one of them failing says nothing about the other 29.
      try {
        await editOneWord(page, entry, anchorOf(before));
        await expect.poll(() => saved(page, entry.path), { timeout: 15_000 }).not.toBe(before);
        const problem = onlyInsertion(before, await saved(page, entry.path), WORD);
        if (problem !== '') broken.push(`${entry.path}: ${problem}`);
      } catch (error) {
        broken.push(`${entry.path}: ${first(error)}`);
        // Back to read mode, so the next page opens from the same place as the last one did.
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
      }
    }

    expect(broken, 'every exact page takes one word and writes one word').toEqual([]);
  });

  test('a page opened and closed without an edit is not written at all', async ({ page }) => {
    const target = exact.find((entry) => entry.path === 'guides/auth/tokens.md');
    const before = read(target?.path ?? '');

    await openPage(page, target?.title ?? '');
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'true');
    await page.locator(EDITOR).click();
    await done(page);

    // The save is a debounce behind the caret; nothing to debounce is nothing to write.
    await page.waitForTimeout(2500);
    expect(await saved(page, target?.path ?? '')).toBe(before);
  });

  /**
   * docs/04 section 3.3. Not a reload: docs/04 section 3.1 flushes the session on `pagehide`,
   * so a page that goes away politely has no unsaved work left to restore. The draft is for
   * the tab that does not - a crash, a kill, a battery - which is what this crashes to get.
   */
  test('a tab that dies mid-typing opens on the draft, and Keep saves it', async ({
    page,
    context,
  }) => {
    const path = 'guides/auth/sessions.md';
    const before = read(path);
    const anchor = anchorOf(before);

    // The typing happens in a second tab, because that tab is not going to come back.
    const typer = await context.newPage();
    const cdp = await context.newCDPSession(typer);
    await typer.goto(page.url());
    await expect(typer.getByRole('tree')).toBeVisible();
    await openPage(typer, 'Sessions');
    await typer.getByRole('button', { name: 'Edit' }).click();
    await expect(typer.locator(EDITOR)).toHaveAttribute('contenteditable', 'true');
    await typer.locator(EDITOR).getByText(anchor, { exact: false }).last().click();
    await typeWord(typer);

    const url = typer.url();
    // The draft is written 500 ms after the last keystroke and the save 1500 ms after it
    // (docs/04 section 3.1), so the tab has to stop between the two. The draft is watched
    // from the tab that is still running, and the session that stops the other one is open
    // before the wait starts - the second between the two timers is the whole budget.
    await expect.poll(() => hasDraft(page), { intervals: [25], timeout: 10_000 }).toBe(true);
    // A tab whose clock stops is the one that goes to sleep, loses power or is killed by the
    // OS: the save it owes is scheduled and never runs.
    await cdp.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });

    await page.goto(url);
    const banner = page.locator('[data-docs-banner="draft"]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Restored unsaved changes');
    // Nothing was written: the draft is the only place that word exists.
    expect(await saved(page, path)).toBe(before);
    await expect(page.locator(EDITOR)).toContainText(WORD);

    await banner.getByRole('button', { name: 'Keep' }).click();
    await expect(banner).toBeHidden();

    await expect.poll(() => saved(page, path), { timeout: 15_000 }).not.toBe(before);
    const after = await saved(page, path);
    expect(onlyInsertion(before, after, WORD)).toBe('');
    // The one thing the save adds beyond the word (docs/03 section 4.2).
    expect(after).toContain(`id: ${new URL(page.url()).pathname.split('/').pop() ?? ''}\n`);
  });
});

/** True once the draft store holds a body for the open page (L4, docs/04 section 1). */
const hasDraft = (page: Page): Promise<boolean> =>
  page.evaluate(
    (name) =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open(name);
        open.onerror = (): void => {
          resolve(false);
        };
        open.onsuccess = (): void => {
          const db = open.result;
          if (!db.objectStoreNames.contains(name)) {
            resolve(false);
            return;
          }
          const request = db.transaction(name, 'readonly').objectStore(name).count();
          request.onsuccess = (): void => {
            resolve(request.result > 0);
          };
          request.onerror = (): void => {
            resolve(false);
          };
        };
      }),
    DRAFTS,
  );
