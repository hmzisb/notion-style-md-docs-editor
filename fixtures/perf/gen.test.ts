import { readFile, rm } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { generateLargePage, generatePerfCorpus } from './gen.js';

describe('perf generators', () => {
  it('produces a 3k-block page', () => {
    const page = generateLargePage(3000);
    expect(page.split('\n\n').length).toBeGreaterThanOrEqual(3000);
    expect(page.endsWith('\n')).toBe(true);
  });

  it('is deterministic', () => {
    expect(generateLargePage(50)).toBe(generateLargePage(50));
  });

  it('writes a nested tree of the requested size into a temp dir', async () => {
    // Small on purpose: the shape is what matters here, the 5k run belongs to `pnpm perf:gen`.
    const result = await generatePerfCorpus({ nodes: 60, blocks: 20 });
    try {
      expect(result.nodes).toBe(60);
      expect(result.files).toBe(61); // the pages plus the large page
      expect(await readFile(`${result.dir}/index.md`, 'utf8')).toContain('title: Perf corpus');
      expect(await readFile(`${result.dir}/section-1/index.md`, 'utf8')).toContain('order: 10');
    } finally {
      await rm(result.dir, { recursive: true, force: true });
    }
  });
});
