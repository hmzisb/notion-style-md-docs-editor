import { defaultCodec } from '@docs/core';
import { describe, expect, it } from 'vitest';
import { generateLargePage } from './gen.js';

/**
 * docs/04 section 3.1 and docs/10 section 5: the draft serializes the open page 500 ms after
 * the last keystroke, on an idle callback. The budget is 30 ms on the 3k-block fixture -
 * docs/04 says that if it is missed the draft debounce goes to 1 s, so the number is the
 * decision, not a smoke test. Measured here rather than in `perf.spec.ts` (DEV-028): the
 * serialize has no seam in the browser, and the codec is the whole of it.
 */

const BUDGET_MS = 30;
const TOLERANCE = 1.2;

/**
 * What one run costs, after a warm-up that pays for the lazy editor: the median of `runs`,
 * because the budget is a cost and not a p95, and one GC pause is not the cost.
 */
function typical(runs: number, work: () => void): number {
  work();
  const times: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    const start = performance.now();
    work();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)] ?? Number.NaN;
}

describe('draft serialize (docs/10 section 5)', () => {
  it('turns a 3k-block page back into Markdown inside the budget', () => {
    // The fixture is 3,000 Markdown blocks, which parses to half as many again: a list item
    // and a table row are blocks of the value too. The serializer's input is the value, so
    // 3,000 of its blocks is the page the budget names; the whole fixture is reported next
    // to it, because that is the file `pnpm perf:gen` writes.
    const whole = defaultCodec.toValue(generateLargePage(3000));
    expect(whole.length, 'blocks in the fixture').toBeGreaterThan(3000);
    const value = whole.slice(0, 3000);

    const ms = typical(7, () => {
      defaultCodec.toMarkdown(value);
    });
    const fixture = typical(5, () => {
      defaultCodec.toMarkdown(whole);
    });

    // eslint-disable-next-line no-console -- the budget table of docs/10 is what this is for.
    console.log(
      `draft serialize: ${ms.toFixed(1)} ms for 3,000 blocks ` +
        `(${fixture.toFixed(1)} ms for the whole ${String(whole.length)}-block fixture)`,
    );
    expect(ms, `draft serialize (budget ${String(BUDGET_MS)} ms + 20%)`).toBeLessThan(
      BUDGET_MS * TOLERANCE,
    );
  });
});
