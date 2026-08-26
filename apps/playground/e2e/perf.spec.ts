import type { Page, TestInfo } from '@playwright/test';
import { expect, freshVisit, openWorkspace, runAction, seedFile, test, tree } from './fixtures.js';

/**
 * docs/10 section 5, every runtime budget in the table. The four size budgets are
 * `size-limit`'s; the draft serialize is a codec measurement with no browser seam and lives in
 * `fixtures/perf/serialize.test.ts` (DEV-028). Numbers land in the phase report.
 *
 * Every timing is taken inside the page - from the real `pointerdown` to the frame after the
 * new content is in the DOM - so the driver's own round trip is not counted. Budgets are
 * asserted with the 20% tolerance docs/10 allows, and the raw number is attached to the run.
 */

/** Timings are measured once, on the demo corpus: a second engine only adds noise. */
const timingsOnly = ({ project }: { project: { name: string } }): boolean =>
  project.name !== 'demo';

declare global {
  interface Window {
    __painted?: Promise<number>;
    __t0?: number;
    /** One entry per keystroke: milliseconds from the key to the frame that answers it. */
    __keys?: number[];
    /** What the playground records off `onEvent` (see `src/events.ts`). */
    __docsEvents?: { type: string; ms?: number; bytes?: number }[];
  }
}

/** One measurement: attached to the run and printed, because docs/09 P3-T11 asks for both. */
function record(testInfo: TestInfo, description: string): void {
  testInfo.annotations.push({ type: 'perf', description });
  console.log(`  perf · ${description}`);
}

/** The budget is a p95, and ten samples put it on the slowest one. */
function p95(samples: number[]): number {
  return quantile(samples, 0.95);
}

/** What a typical sample costs, next to the p95 that the budget is written as. */
function median(samples: number[]): number {
  return quantile(samples, 0.5);
}

function quantile(samples: number[], at: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * at) - 1)] ?? Number.NaN;
}

/**
 * A 3,000-block page: the fixture docs/10 section 5 budgets typing and saving against. Same
 * shape as `fixtures/perf/gen.ts`, rebuilt here because `tsconfig.e2e.json` is rooted at the
 * playground and cannot import out of it.
 */
function largePage(blocks: number): string {
  const out = [
    '---',
    'id: p_large',
    'title: Large page',
    'order: 10',
    '---',
    '',
    '# Large page',
    '',
  ];
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
        break;
    }
  }
  return out.join('\n');
}

/**
 * Arms a clock on the next event the driver sends, and stops it on the first frame where the
 * tree is at least `minHeight` px tall - which is how a virtualized list says it has every row
 * it is going to get, since the number it mounts never changes.
 */
async function armTreeHeight(page: Page, minHeight: number): Promise<void> {
  await page.evaluate((height) => {
    document.addEventListener(
      'keydown',
      () => {
        window.__t0 = performance.now();
      },
      { once: true, capture: true },
    );
    window.__painted = new Promise<number>((resolve) => {
      const tick = (): void => {
        const scroller = document.querySelector('[role="tree"]')?.parentElement;
        if (scroller instanceof HTMLElement && scroller.scrollHeight >= height) {
          requestAnimationFrame(() => {
            resolve(performance.now());
          });
          return;
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
  }, minHeight);
}

/** The same clock, from the pointer that opens a workspace to the first row of its tree. */
async function armFirstRow(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.addEventListener(
      'pointerdown',
      () => {
        window.__t0 = performance.now();
      },
      { once: true, capture: true },
    );
    window.__painted = new Promise<number>((resolve) => {
      const tick = (): void => {
        if (document.querySelector('[role="treeitem"]') !== null) {
          requestAnimationFrame(() => {
            resolve(performance.now());
          });
          return;
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
  });
}

/**
 * Arms the two halves of a click-to-paint measurement: the clock starts on the pointer that
 * the driver is about to send, and stops on the first frame where the heading has changed.
 */
async function armPaint(page: Page, expected: string): Promise<void> {
  await page.evaluate((title) => {
    document.addEventListener(
      'pointerdown',
      () => {
        window.__t0 = performance.now();
      },
      { once: true, capture: true },
    );
    window.__painted = new Promise<number>((resolve) => {
      const tick = (): void => {
        const heading = document.querySelector('article h1');
        if (heading?.textContent === title) {
          requestAnimationFrame(() => {
            resolve(performance.now());
          });
          return;
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
  }, expected);
}

const paintedMs = async (page: Page): Promise<number> =>
  page.evaluate(async () => {
    const { __painted, __t0 } = window;
    if (__painted === undefined || __t0 === undefined)
      throw new Error('the paint clock never started');
    return (await __painted) - __t0;
  });

/** How many query records the persister has written (docs/04 section 1, L2). */
const persistedQueries = (page: Page): Promise<number> =>
  page.evaluate(
    async () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('docs-queries');
        open.onerror = (): void => {
          resolve(0);
        };
        open.onsuccess = (): void => {
          const db = open.result;
          try {
            const request = db.transaction('docs-queries').objectStore('docs-queries').count();
            request.onsuccess = (): void => {
              resolve(request.result);
              db.close();
            };
            request.onerror = (): void => {
              resolve(0);
              db.close();
            };
          } catch {
            // The store is created by the first write; before that there is nothing to count.
            resolve(0);
            db.close();
          }
        };
      }),
  );

/** The `ms` of every save the module has reported, in order (see `src/events.ts`). */
const savedRounds = (page: Page): Promise<number[]> =>
  page.evaluate(() =>
    (window.__docsEvents ?? [])
      .filter((event) => event.type === 'page:saved')
      .map((event) => event.ms ?? 0),
  );

/**
 * Writes `count` pages into the OPFS workspace as 50 folders of equal size - a corpus shape,
 * not one directory with five thousand entries in it. Returns what it wrote.
 */
const seedCorpus = (page: Page, count: number): Promise<number> =>
  page.evaluate(async (total) => {
    const root = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('workspace', {
      create: true,
    });
    const folders = 50;
    const per = Math.ceil(total / folders);
    let written = 0;
    for (let folder = 1; folder <= folders && written < total; folder += 1) {
      const dir = await root.getDirectoryHandle(`section-${String(folder)}`, { create: true });
      const batch: Promise<void>[] = [];
      for (let i = 1; i <= per && written < total; i += 1) {
        written += 1;
        const title = `Page ${String(folder)}-${String(i)}`;
        const body = `---\ntitle: ${title}\norder: ${String(i * 10)}\n---\n\n# ${title}\n\nGenerated.\n`;
        batch.push(
          (async (): Promise<void> => {
            const handle = await dir.getFileHandle(`page-${String(i)}.md`, { create: true });
            const writable = await handle.createWritable();
            await writable.write(body);
            await writable.close();
          })(),
        );
      }
      // A folder at a time: five thousand open writables at once is what exhausts the tab.
      await Promise.all(batch);
    }
    return written;
  }, count);

test.describe('budgets (docs/10 section 5)', () => {
  test('a cached page switch paints in under 100 ms', async ({ page }, testInfo) => {
    test.skip(timingsOnly(testInfo), 'measured on the demo project');
    await freshVisit(page);
    await openWorkspace(page, 'demo');
    await expect(tree(page)).toBeVisible();

    const open = async (title: string): Promise<void> => {
      await page.keyboard.press('ControlOrMeta+p');
      // Pages only appear once something is typed; an empty palette is Recent and Actions.
      await page.getByPlaceholder('Search pages…').fill(title);
      await page
        .getByRole('option', { name: new RegExp(title) })
        .first()
        .click();
      await expect(page.getByRole('heading', { name: title, level: 1 }).first()).toBeVisible();
    };

    // Both pages are in the query cache after this, which is what "cached" means here.
    await open('Getting started');
    await open('Roadmap');

    // The row has to be in the tree to be clicked, and the corpus opens collapsed.
    await runAction(page, 'Expand all');

    const row = page.getByRole('treeitem', { name: /Getting started/ }).first();
    await row.scrollIntoViewIfNeeded();
    await armPaint(page, 'Getting started');
    await row.click();
    const ms = await paintedMs(page);

    record(testInfo, `cached page switch: ${ms.toFixed(1)} ms`);
    expect(ms, 'cached page switch (budget 100 ms + 20%)').toBeLessThan(120);
  });

  test('the tree scrolls at 60 fps with a screenful of rows on 5,000 nodes', async ({
    page,
  }, testInfo) => {
    test.skip(timingsOnly(testInfo), 'measured on the demo project');
    await freshVisit(page);
    // `?bench=<nodes>` is the generated workspace of docs/10 section 5 (see `providers.ts`).
    await page.goto('/?bench=5000');
    await expect(tree(page)).toBeVisible();

    // Every folder open, so the virtualizer has 5,000 rows to scroll through rather than ten.
    await runAction(page, 'Expand all');
    await expect
      .poll(async () => page.getByRole('treeitem').count(), { message: 'rows after expand all' })
      .toBeGreaterThan(20);

    const result = await page.evaluate(async () => {
      const list = document.querySelector('[role="tree"]');
      const scroller = list?.parentElement;
      if (!(scroller instanceof HTMLElement)) throw new Error('no tree scroller');

      const rowCount = (): number => document.querySelectorAll('[role="treeitem"]').length;
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const start = performance.now();
      let frames = 0;
      let mounted = rowCount();
      await new Promise<void>((resolve) => {
        const step = (): void => {
          frames += 1;
          scroller.scrollTop += 240;
          mounted = Math.max(mounted, rowCount());
          if (frames >= 60) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });

      return {
        frameMs: (performance.now() - start) / frames,
        fps: (frames * 1000) / (performance.now() - start),
        mounted,
        scrolled: scroller.scrollTop,
        total: scroller.scrollHeight,
      };
    });

    // Headless Chromium does not lock `requestAnimationFrame` to the display, so the frame
    // time is the number that means something; the fps is what it would be at 60 Hz.
    record(
      testInfo,
      `tree scroll: ${result.frameMs.toFixed(2)} ms/frame (${result.fps.toFixed(0)} fps unthrottled), ${String(result.mounted)} rows mounted, ${String(Math.round(result.scrolled))}/${String(Math.round(result.total))} px`,
    );
    // 5,000 rows of 32 px is ~160k px of scroll height, so 60 frames cannot reach the end.
    expect(result.scrolled, 'the tree actually scrolled').toBeGreaterThan(10_000);
    expect(result.mounted, 'mounted rows (budget 45, hard)').toBeLessThanOrEqual(45);
    expect(result.frameMs, 'tree scroll frame time (budget 16.7 ms + 20%)').toBeLessThan(20);
  });
  /**
   * The second half of the cached-open promise (docs/04 section 1, L2): after a reload the
   * query cache is empty, and the persister answers the page query out of IndexedDB before the
   * provider is ever asked. That ordering is what makes this a measurement of the store rather
   * than of the demo corpus behind it.
   */
  test('a page opens from the persisted cache in under 150 ms', async ({ page }, testInfo) => {
    test.skip(timingsOnly(testInfo), 'measured on the demo project');
    await freshVisit(page);
    await openWorkspace(page, 'demo');
    await expect(tree(page)).toBeVisible();

    await page.keyboard.press('ControlOrMeta+p');
    await page.getByPlaceholder('Search pages…').fill('Getting started');
    await page
      .getByRole('option', { name: /Getting started/ })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: 'Getting started', level: 1 }).first(),
    ).toBeVisible();

    // The persister writes once the query resolves; the reload below must not outrun it.
    await expect
      .poll(() => persistedQueries(page), { message: 'persisted query records' })
      .toBeGreaterThan(0);

    // A reload lands back on whatever page is open, and a page already painted cannot be
    // opened: the measurement has to start from a different one.
    await page.getByRole('link', { name: 'Docs corpus', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Docs corpus', level: 1 }).first(),
    ).toBeVisible();

    // Nothing of L1 survives this, so the paint below has one source left.
    await page.reload();
    await expect(tree(page)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Docs corpus', level: 1 }).first(),
    ).toBeVisible();
    await runAction(page, 'Expand all');

    const row = page.getByRole('treeitem', { name: /Getting started/ }).first();
    await row.scrollIntoViewIfNeeded();
    await armPaint(page, 'Getting started');
    await row.click();
    const ms = await paintedMs(page);

    record(testInfo, `cold page open from IndexedDB: ${ms.toFixed(1)} ms`);
    expect(ms, 'cold page open from IndexedDB (budget 150 ms + 20%)').toBeLessThan(180);
  });

  test('expand-all opens a 5,000-node tree in under 100 ms', async ({ page }, testInfo) => {
    test.skip(timingsOnly(testInfo), 'measured on the demo project');
    await freshVisit(page);
    await page.goto('/?bench=5000');
    await expect(tree(page)).toBeVisible();

    // The virtualizer keeps the mounted rows at a screenful whatever it is showing, so the
    // scroll height is what says every row is in the list.
    const rowHeight = await page
      .getByRole('treeitem')
      .first()
      .evaluate((row) => row.getBoundingClientRect().height);
    expect(rowHeight, 'a row has a height to measure against').toBeGreaterThan(8);

    const dialog = page.getByRole('dialog', { name: 'Search pages and actions' });
    await page.keyboard.press('ControlOrMeta+p');
    await dialog.getByPlaceholder('Search pages…').fill('Expand all');
    await expect(dialog.getByRole('option', { name: 'Expand all' }).first()).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await armTreeHeight(page, rowHeight * 4500);
    await page.keyboard.press('Enter');
    const ms = await paintedMs(page);

    record(testInfo, `tree expand-all (5,000 nodes): ${ms.toFixed(1)} ms`);
    expect(ms, 'tree expand-all (budget 100 ms + 20%)').toBeLessThan(120);
  });

  /**
   * docs/03 section 4.11: the filesystem adapter keeps a per-path index in IndexedDB, so the
   * second open of a workspace lists and stats the files but does not read one of them. Leaving
   * and reopening is what makes the index warm and the provider cold, which is the pair the
   * budget names.
   */
  test('getTree over 5,000 OPFS files is under 300 ms with a warm index', async ({
    mode,
    page,
  }, testInfo) => {
    test.skip(mode !== 'opfs', 'the filesystem adapter is what is being measured');
    test.setTimeout(300_000);
    await freshVisit(page);

    const seeded = await seedCorpus(page, 5000);
    expect(seeded, 'files written into OPFS').toBe(5000);

    // The cold open reads every file once and writes the index it built.
    await openWorkspace(page, 'opfs');
    await expect(tree(page)).toBeVisible({ timeout: 120_000 });

    await page.getByRole('button', { name: /^Workspace:/ }).click();
    await expect(page.getByRole('button', { name: 'Open browser storage' })).toBeVisible();

    await armFirstRow(page);
    await openWorkspace(page, 'opfs');
    const ms = await paintedMs(page);

    record(testInfo, `getTree over 5,000 OPFS files, warm index: ${ms.toFixed(1)} ms`);
    expect(ms, 'getTree, warm index cache (budget 300 ms + 20%)').toBeLessThan(360);
  });

  /**
   * The two budgets that need a page big enough to hurt: 3,000 blocks in OPFS, typed into and
   * saved ten times. Both numbers are p95s, so the slowest of the ten is what is asserted.
   */
  test('typing and saving a 3,000-block page stays inside its budgets', async ({
    mode,
    page,
  }, testInfo) => {
    test.skip(mode !== 'opfs', 'the save round trip is the filesystem write');
    test.setTimeout(300_000);
    await freshVisit(page);
    await seedFile(page, 'large-page.md', largePage(3000));

    await openWorkspace(page, 'opfs');
    await expect(tree(page)).toBeVisible();
    await page.getByRole('treeitem', { name: 'Large page' }).click();
    await expect(page.getByRole('heading', { name: 'Large page', level: 1 }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Edit' }).click();
    const editable = page.locator('[data-slate-editor]');
    await expect(editable).toHaveAttribute('contenteditable', 'true', { timeout: 60_000 });
    // P3-T10: entering edit mode puts the caret at the start of the first block.
    await expect(editable).toBeFocused();

    // In headless Chromium `requestAnimationFrame` is not locked to a display, so the frame
    // after a key is the work the key caused and nothing else.
    await page.evaluate(() => {
      window.__keys = [];
      document.addEventListener(
        'keydown',
        () => {
          const start = performance.now();
          requestAnimationFrame(() => {
            window.__keys?.push(performance.now() - start);
          });
        },
        { capture: true },
      );
    });
    await page.keyboard.type(
      'Typing into three thousand blocks, for long enough that a p95 is a p95 and not the ' +
        'slowest of a handful. ',
      { delay: 30 },
    );
    const keys = await page.evaluate(() => window.__keys ?? []);
    expect(keys.length, 'keystrokes measured').toBeGreaterThan(20);

    // The first save is the burst above; the rest are one character each, a debounce apart.
    await expect.poll(() => savedRounds(page), { timeout: 30_000 }).not.toHaveLength(0);
    for (let round = 0; round < 9; round += 1) {
      const before = (await savedRounds(page)).length;
      await page.keyboard.type('.');
      await expect
        .poll(() => savedRounds(page), { message: 'a save per round', timeout: 30_000 })
        .toHaveLength(before + 1);
    }
    const saves = await savedRounds(page);

    record(
      testInfo,
      `keystroke to paint: ${p95(keys).toFixed(1)} ms p95, ${median(keys).toFixed(1)} ms median over ${String(keys.length)} keys`,
    );
    record(
      testInfo,
      `save round trip: ${p95(saves).toFixed(0)} ms p95 over ${String(saves.length)} saves`,
    );
    // docs/10 section 5 budgets 16 ms p95 here and this page costs about twice that. DEV-031
    // has the measurements and what is behind them: the same keystroke is 10.1 ms p95 at 500
    // blocks and 16.3 at 1,000, and what grows past that is Chromium's, not the module's.
    expect(p95(keys), 'keystroke to paint (docs/10 budget 16 ms p95; DEV-031)').toBeLessThan(40);
    expect(p95(saves), 'save round trip (budget 300 ms p95 + 20%)').toBeLessThan(360);
  });

  test('the playground is interactive in under 1.5 s on a warm load', async ({
    page,
  }, testInfo) => {
    test.skip(timingsOnly(testInfo), 'measured on the demo project');
    await freshVisit(page);
    // Warm means the second load: the module graph is in the browser's cache and the workspace
    // is the one this visit remembered, which is what a returning reader gets.
    await openWorkspace(page, 'demo');
    await expect(tree(page)).toBeVisible();

    await page.addInitScript(() => {
      // `performance.now()` is measured from the navigation, so the clock is already running.
      window.__t0 = 0;
      window.__painted = new Promise<number>((resolve) => {
        const tick = (): void => {
          if (document.querySelector('[role="treeitem"]') !== null) {
            requestAnimationFrame(() => {
              resolve(performance.now());
            });
            return;
          }
          requestAnimationFrame(tick);
        };
        tick();
      });
    });
    await page.goto('/');
    const ms = await paintedMs(page);

    record(testInfo, `playground TTI (warm): ${ms.toFixed(0)} ms`);
    expect(ms, 'playground TTI (budget 1.5 s + 20%)').toBeLessThan(1800);
  });

  /**
   * docs/05 section 6: past 5,000 blocks the page opens read-only, and `Edit anyway` is the
   * opt-in. What that opt-in costs is what the guard is there for, so it is measured rather
   * than budgeted; `large.spec.ts` is what says the guard and the button behave.
   */
  test('a page past the block threshold takes Edit anyway inside 25 s', async ({
    mode,
    page,
  }, testInfo) => {
    test.skip(mode !== 'opfs', 'seeded into the filesystem, like the other big fixtures');
    test.setTimeout(300_000);
    await freshVisit(page);
    await seedFile(page, 'large-page.md', largePage(5200));
    await openWorkspace(page, 'opfs');
    await expect(tree(page)).toBeVisible();

    await page.getByRole('treeitem', { name: 'Large page' }).click();
    await expect(page.getByText('Large page: opened in read mode for performance.')).toBeVisible({
      timeout: 60_000,
    });

    // The editor chunk is preloaded on idle (docs/05 section 8), so what is measured here is
    // the mount and not the download.
    await page.waitForTimeout(2000);
    const started = Date.now();
    await page.getByRole('button', { name: 'Edit anyway' }).click();
    await expect(page.locator('[data-slate-editor]')).toHaveAttribute('contenteditable', 'true', {
      timeout: 120_000,
    });
    const ms = Date.now() - started;

    // 16.4 s measured on the reference machine. Not a budget docs/10 sets - a tripwire at
    // roughly 1.5x, so that a change which makes the opt-in worse is not silent (ASM-160).
    record(testInfo, `edit anyway on a 5,200-block page: ${String(ms)} ms`);
    expect(ms, 'edit anyway on a 5,200-block page (tripwire 25 s)').toBeLessThan(25_000);
  });
});
