import type { Page } from '@playwright/test';
import { expect, freshVisit, openWorkspace, test, tree } from './fixtures.js';

/**
 * docs/10 section 5, the two budgets Phase 1 can already measure. Numbers land in
 * `docs/execution/PHASE-1-REPORT.md`; P3-T11 measures the rest of the table.
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
  }
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
    await page.keyboard.press('ControlOrMeta+p');
    await page.getByRole('option', { name: 'Expand all' }).click();

    const row = page.getByRole('treeitem', { name: /Getting started/ }).first();
    await row.scrollIntoViewIfNeeded();
    await armPaint(page, 'Getting started');
    await row.click();
    const ms = await paintedMs(page);

    testInfo.annotations.push({
      type: 'perf',
      description: `cached page switch: ${ms.toFixed(1)} ms`,
    });
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
    await page.keyboard.press('ControlOrMeta+p');
    await page.getByRole('option', { name: 'Expand all' }).click();
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

    testInfo.annotations.push({
      type: 'perf',
      // Headless Chromium does not lock `requestAnimationFrame` to the display, so the frame
      // time is the number that means something; the fps is what it would be at 60 Hz.
      description: `tree scroll: ${result.frameMs.toFixed(2)} ms/frame (${result.fps.toFixed(0)} fps unthrottled), ${String(result.mounted)} rows mounted, ${String(Math.round(result.scrolled))}/${String(Math.round(result.total))} px`,
    });
    // 5,000 rows of 32 px is ~160k px of scroll height, so 60 frames cannot reach the end.
    expect(result.scrolled, 'the tree actually scrolled').toBeGreaterThan(10_000);
    expect(result.mounted, 'mounted rows (budget 45, hard)').toBeLessThanOrEqual(45);
    expect(result.frameMs, 'tree scroll frame time (budget 16.7 ms + 20%)').toBeLessThan(20);
  });
});
