import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFileStoreProvider, splitFrontmatter, type PageMeta } from '@hmzisb/notion-docs-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NodeFileStore } from './node-store.js';
import { writeIds } from './write-ids.js';

/**
 * The migration runs over a copy of the corpus, never the fixture itself: it rewrites
 * files, and the golden tests read the originals.
 */
const CORPUS = fileURLToPath(new URL('../fixtures/corpus', import.meta.url));

let root: string;
let store: NodeFileStore;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'docs-write-ids-'));
  await cp(CORPUS, root, { recursive: true });
  store = new NodeFileStore(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const read = (path: string): Promise<string> => readFile(join(root, path), 'utf8');
const meta = async (path: string): Promise<PageMeta> => splitFrontmatter(await read(path)).meta;

/** Every page the module would show, by what it shows: its path and its title. */
async function tree(): Promise<string[]> {
  const snapshot = await createFileStoreProvider(new NodeFileStore(root)).getTree();
  return snapshot.nodes.map((node) => `${node.kind} ${node.path} ${node.title}`).sort();
}

describe('doctor --write-ids (docs/03 sections 4.2 and 4.3)', () => {
  it('gives every page an id of its own, and keeps the one a page declares', async () => {
    const result = await writeIds(store);

    expect(result.scanned).toBeGreaterThan(20);
    // `index.md` is the one page in the corpus that already carries an id.
    expect(result.ids).toHaveLength(result.scanned - 1);
    expect(result.ids).not.toContain('index.md');
    expect((await meta('index.md')).id).toBe('h_corpus_root');

    const ids = new Set<string>();
    for (const path of result.ids) {
      const id = (await meta(path)).id;
      expect(id, path).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
      ids.add(id!);
    }
    expect(ids.size).toBe(result.ids.length);
  });

  it('hoists a leading H1 into the title and takes it out of the body', async () => {
    const before = await read('decisions/0002-provider-seam.md');
    const result = await writeIds(store);

    expect(result.titles).toContain('decisions/0002-provider-seam.md');
    const page = splitFrontmatter(await read('decisions/0002-provider-seam.md'));
    expect(page.meta.title).toBe('ADR 0002: One provider seam');
    expect(page.body).not.toContain('# ADR 0002');
    // One blank line between the block and the prose, which is how a page is written.
    expect(page.body).toBe(`\n${splitFrontmatter(before).body.split('\n').slice(2).join('\n')}`);
  });

  it('leaves the body of a page that already declares a title', async () => {
    const before = await read('decisions/0001-markdown-canonical.md');
    const result = await writeIds(store);

    expect(result.titles).not.toContain('decisions/0001-markdown-canonical.md');
    const page = splitFrontmatter(await read('decisions/0001-markdown-canonical.md'));
    expect(page.meta.title).toBe('ADR 0001: Markdown is canonical');
    expect(page.body).toBe(splitFrontmatter(before).body);
  });

  it('adds nothing but an id to a page with no heading and no frontmatter', async () => {
    const before = await read('guides/billing/refunds.md');
    await writeIds(store);

    const page = splitFrontmatter(await read('guides/billing/refunds.md'));
    expect(Object.keys(page.meta)).toEqual(['id']);
    expect(page.body).toBe(`\n${before}`);
  });

  it('does not touch a hidden or a vendored file', async () => {
    const hidden = await read('.hidden/secret.md');
    const vendored = await read('node_modules/pkg/readme.md');
    await writeIds(store);

    expect(await read('.hidden/secret.md')).toBe(hidden);
    expect(await read('node_modules/pkg/readme.md')).toBe(vendored);
  });

  it('shows the same tree it did before the migration', async () => {
    const before = await tree();
    await writeIds(store);

    expect(await tree()).toEqual(before);
  });

  it('writes nothing the second time', async () => {
    await writeIds(store);
    const after = new Map<string, string>();
    for (const entry of await store.list()) {
      if (entry.kind === 'file') after.set(entry.path, await read(entry.path));
    }

    const again = await writeIds(store);

    expect(again.ids).toEqual([]);
    expect(again.titles).toEqual([]);
    for (const [path, content] of after) expect(await read(path), path).toBe(content);
  });
});
