import { describe, expect, it } from 'vitest';
import type { TreeNode } from '../model.js';
import { isProviderError } from '../errors.js';
import { MemoryFileStore } from './memory-store.js';
import { SEARCH_BYTE_CAP, SEARCH_FILE_CAP, searchPages } from './search.js';
import { createFileStoreProvider } from './semantics.js';

/** docs/01 section 6 and docs/09 P4-T07. */

const page = (id: string, title: string): TreeNode => ({
  id,
  kind: 'page',
  title,
  path: `${id}.md`,
  parentId: null,
  childIds: [],
});

describe('searchPages', () => {
  it('answers nothing to an empty query', async () => {
    const hits = await searchPages({
      nodes: [page('a', 'Anything')],
      readBody: () => Promise.resolve('anything'),
      query: '   ',
      limit: 20,
    });
    expect(hits).toEqual([]);
  });

  it('puts title matches first, earliest match before longest title', async () => {
    const nodes = [page('a', 'Legacy API notes'), page('b', 'API'), page('c', 'API reference')];
    const hits = await searchPages({
      nodes,
      readBody: () => Promise.resolve(''),
      query: 'api',
      limit: 20,
    });
    expect(hits.map((hit) => hit.id)).toEqual(['b', 'c', 'a']);
    expect(hits.every((hit) => hit.snippet === undefined)).toBe(true);
  });

  it('reads no bodies at all when titles already fill the page', async () => {
    let reads = 0;
    const hits = await searchPages({
      nodes: [page('a', 'API'), page('b', 'API two'), page('c', 'Other')],
      readBody: () => {
        reads += 1;
        return Promise.resolve('api api api');
      },
      query: 'api',
      limit: 2,
    });
    expect(hits.map((hit) => hit.id)).toEqual(['a', 'b']);
    expect(reads).toBe(0);
  });

  it('ranks body matches by how often the query appears', async () => {
    const bodies: Record<string, string> = {
      'a.md': 'cursor',
      'b.md': 'cursor cursor cursor',
      'c.md': 'cursor cursor',
      'd.md': 'nothing here',
    };
    const hits = await searchPages({
      nodes: [page('a', 'A'), page('b', 'B'), page('c', 'C'), page('d', 'D')],
      readBody: (node) => Promise.resolve(bodies[node.path] ?? ''),
      query: 'CURSOR',
      limit: 20,
    });
    expect(hits.map((hit) => hit.id)).toEqual(['b', 'c', 'a']);
  });

  it('snips 60 characters either side of the match', async () => {
    const [hit] = await searchPages({
      nodes: [page('a', 'A')],
      readBody: () => Promise.resolve(`${'a'.repeat(200)}needle${'b'.repeat(200)}`),
      query: 'needle',
      limit: 20,
    });
    expect(hit?.snippet).toBe(`…${'a'.repeat(60)}needle${'b'.repeat(60)}…`);
  });

  it('puts the snippet on one line, whatever the page did', async () => {
    const [hit] = await searchPages({
      nodes: [page('a', 'A')],
      readBody: () => Promise.resolve('# Title\n\nthe  needle\tis\nhere\n'),
      query: 'needle',
      limit: 20,
    });
    expect(hit?.snippet).toBe('# Title the needle is here');
  });

  it('stops after the byte cap, whatever is left unread', async () => {
    const big = 'x'.repeat(SEARCH_BYTE_CAP / 4);
    const nodes = Array.from({ length: 20 }, (_, at) =>
      page(`p${String(at)}`, `Page ${String(at)}`),
    );
    let reads = 0;
    const hits = await searchPages({
      nodes,
      readBody: (node) => {
        reads += 1;
        return Promise.resolve(node.id === 'p19' ? 'needle' : big);
      },
      query: 'needle',
      limit: 20,
    });
    expect(reads).toBe(4);
    expect(hits).toEqual([]);
  });

  it('stops after the file cap', async () => {
    const nodes = Array.from({ length: SEARCH_FILE_CAP + 5 }, (_, at) =>
      page(`p${String(at)}`, `Page ${String(at)}`),
    );
    let reads = 0;
    await searchPages({
      nodes,
      readBody: () => {
        reads += 1;
        return Promise.resolve('.');
      },
      query: 'needle',
      limit: 20,
    });
    expect(reads).toBe(SEARCH_FILE_CAP);
  });
});

describe('provider search (docs/03 section 4)', () => {
  const corpus = {
    'index.md': '---\ntitle: Home\n---\n\nCursors, never offsets.\n',
    'guides/pagination.md': '---\ntitle: Pagination\n---\n\nUse a cursor. The cursor is opaque.\n',
    'guides/errors.md': '---\ntitle: Error codes\n---\n\nEvery error body carries a code.\n',
  };

  it('advertises the capability and finds titles and bodies', async () => {
    const provider = createFileStoreProvider(new MemoryFileStore(corpus));
    expect(provider.capabilities.search).toBe(true);

    const byTitle = await provider.search?.('pagination');
    expect(byTitle?.map((hit) => hit.title)).toEqual(['Pagination']);

    const byBody = await provider.search?.('cursor');
    expect(byBody?.map((hit) => hit.title)).toEqual(['Pagination', 'Home']);
    expect(byBody?.[0]?.snippet).toContain('The cursor is opaque');
  });

  it('searches only inside the scope it is given', async () => {
    const provider = createFileStoreProvider(new MemoryFileStore(corpus));
    const tree = await provider.getTree();
    const guides = tree.nodes.find((node) => node.path === 'guides');

    const hits = await provider.search?.('cursor', { rootId: guides?.id });
    expect(hits?.map((hit) => hit.title)).toEqual(['Pagination']);
  });

  it('sees what a save just wrote', async () => {
    const provider = createFileStoreProvider(new MemoryFileStore(corpus));
    const tree = await provider.getTree();
    const errors = tree.nodes.find((node) => node.path === 'guides/errors.md');
    const page = await provider.getPage(errors?.id ?? '');

    expect(await provider.search?.('cursor')).toHaveLength(2);
    await provider.savePage(page.id, {
      body: 'A cursor is in this page now.\n',
      baseVersion: page.version,
    });
    expect((await provider.search?.('cursor'))?.map((hit) => hit.title)).toContain('Error codes');
  });

  it('rejects when a host turns the capability off', async () => {
    const provider = createFileStoreProvider(new MemoryFileStore(corpus), {
      capabilities: { search: false },
    });
    await expect(provider.search?.('cursor')).rejects.toSatisfy(
      (error: unknown) => isProviderError(error) && error.code === 'unsupported',
    );
  });
});
