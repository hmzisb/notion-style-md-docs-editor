import { describe, expect, it, vi } from 'vitest';
import { createFileStoreProvider } from './semantics.js';
import { MemoryFileStore } from './memory-store.js';
import { isProviderError } from '../errors.js';
import { sha256Hex } from '../hash.js';
import { CONTRACT_VERSION } from '../contract/version.js';
import { loadCorpus } from '../testing/fixtures.js';
import type { TreeNode } from '../model.js';

const corpus = await loadCorpus();

const PNG = corpus.assets.get('assets/diagram.png') ?? new Uint8Array();

function corpusProvider(
  overrides: Record<string, string | Uint8Array> = {},
): ReturnType<typeof createFileStoreProvider> {
  const store = new MemoryFileStore({
    ...Object.fromEntries(corpus.manifest.pages.map((page) => [page.path, corpus.read(page.path)])),
    ...Object.fromEntries(corpus.assets),
    ...overrides,
  });
  return createFileStoreProvider(store, {
    title: 'Corpus',
    now: () => new Date('2026-01-01T00:00:00.000Z'),
  });
}

const nodeAt = async (
  provider: ReturnType<typeof createFileStoreProvider>,
  path: string,
): Promise<TreeNode> => {
  const snapshot = await provider.getTree();
  const node = snapshot.nodes.find((candidate) => candidate.path === path);
  if (!node) throw new Error(`no node at ${path}`);
  return node;
};

describe('identity and capabilities', () => {
  it('takes the store key by default and honours an override', () => {
    const store = new MemoryFileStore({ 'a.md': '# A\n' }, { key: 'memory:demo' });
    expect(createFileStoreProvider(store).key).toBe('memory:demo');
    expect(createFileStoreProvider(store, { key: 'custom' }).key).toBe('custom');
  });

  it('derives capabilities from the store and lets options override them', async () => {
    const rw = createFileStoreProvider(new MemoryFileStore({ 'a.md': 'x' }));
    expect(rw.capabilities).toEqual({
      write: true,
      move: true,
      delete: true,
      upload: false,
      search: false,
      subscribe: true,
    });

    const ro = createFileStoreProvider(new MemoryFileStore({ 'a.md': 'x' }, { readOnly: true }), {
      capabilities: { search: true },
    });
    expect(ro.capabilities.write).toBe(false);
    expect(ro.capabilities.delete).toBe(false);
    expect(ro.capabilities.search).toBe(true);

    const meta = await ro.getMeta();
    expect(meta.contractVersion).toBe(CONTRACT_VERSION);
    expect(meta.capabilities).toEqual(ro.capabilities);
  });

  it('reports the workspace title and scoped root through getMeta', async () => {
    const provider = createFileStoreProvider(new MemoryFileStore({ 'a.md': 'x' }), {
      title: 'Docs',
      rootId: 'h_abc',
    });
    expect(await provider.getMeta()).toMatchObject({ title: 'Docs', rootId: 'h_abc' });
  });
});

describe('getTree', () => {
  it('returns the walked corpus and caches it until invalidated', async () => {
    const store = new MemoryFileStore({ 'a.md': '# A\n' });
    const list = vi.spyOn(store, 'list');
    const provider = createFileStoreProvider(store);

    await provider.getTree();
    await provider.getTree();
    expect(list).toHaveBeenCalledTimes(1);

    provider.invalidate();
    await provider.getTree();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('scopes to a subtree and reparents the scope root', async () => {
    const provider = corpusProvider();
    const auth = await nodeAt(provider, 'guides/auth/index.md');
    const scoped = await provider.getTree({ rootId: auth.id });

    expect(scoped.nodes.map((node) => node.path)).toEqual([
      'guides/auth/index.md',
      'guides/auth/tokens.md',
      'guides/auth/sessions.md',
      'guides/auth/troubleshooting.md',
    ]);
    expect(scoped.nodes[0]?.parentId).toBeNull();
    expect(scoped.version).not.toBe((await provider.getTree()).version);
  });

  it('rejects an unknown scope root', async () => {
    await expect(corpusProvider().getTree({ rootId: 'nope' })).rejects.toSatisfy(
      (error: unknown) => isProviderError(error) && error.code === 'not_found',
    );
  });

  it('surfaces walk warnings only once the tree has been read', async () => {
    const provider = createFileStoreProvider(
      new MemoryFileStore({
        'a.md': '---\nid: dup\n---\n\n# A\n',
        'b.md': '---\nid: dup\n---\n\n# B\n',
      }),
    );
    expect(provider.warnings).toEqual([]);
    await provider.getTree();
    expect(provider.warnings).toEqual([
      expect.objectContaining({ code: 'duplicate_id', path: 'b.md' }),
    ]);
  });
});

describe('getPage', () => {
  it('returns the body without frontmatter and the sha256 of the whole file', async () => {
    const provider = corpusProvider();
    const node = await nodeAt(provider, 'guides/auth/tokens.md');
    const page = await provider.getPage(node.id);

    const raw = corpus.read('guides/auth/tokens.md');
    expect(page.version).toBe(`sha256:${await sha256Hex(raw)}`);
    // The body is the file after the closing delimiter, byte for byte.
    expect(raw.endsWith(page.body)).toBe(true);
    expect(page.body.trimStart().startsWith('# Tokens')).toBe(true);
    expect(page.body).not.toContain('title: Tokens');
    expect(page.meta.title).toBe('Tokens');
    expect(page.eol).toBeUndefined();
  });

  it('reports a CRLF file as crlf and hands back an LF body', async () => {
    const provider = corpusProvider();
    const node = await nodeAt(provider, 'specs/legacy-notes.md');
    const page = await provider.getPage(node.id);
    expect(page.eol).toBe('crlf');
    expect(page.body).not.toContain('\r');
  });

  it('reads a page that has no frontmatter at all', async () => {
    const provider = corpusProvider();
    const node = await nodeAt(provider, 'product/pricing.md');
    const page = await provider.getPage(node.id);
    expect(page.meta).toEqual({});
    expect(page.body.startsWith('# Pricing')).toBe(true);
  });

  it('prefers a frontmatter updatedAt over the store mtime', async () => {
    const provider = corpusProvider({
      'dated.md': '---\nupdatedAt: 2024-03-04T05:06:07Z\n---\n\n# D\n',
    });
    const node = await nodeAt(provider, 'dated.md');
    expect((await provider.getPage(node.id)).updatedAt).toBe('2024-03-04T05:06:07.000Z');
  });

  it('falls back to the store mtime', async () => {
    const store = new MemoryFileStore(
      { 'a.md': '# A\n' },
      { now: () => Date.parse('2025-06-07T08:09:10Z') },
    );
    const provider = createFileStoreProvider(store);
    const snapshot = await provider.getTree();
    const id = snapshot.nodes[0]?.id ?? '';
    expect((await provider.getPage(id)).updatedAt).toBe('2025-06-07T08:09:10.000Z');
  });

  it('rejects an unknown id and a folder node', async () => {
    const provider = corpusProvider();
    await expect(provider.getPage('nope')).rejects.toSatisfy(
      (error: unknown) => isProviderError(error) && error.code === 'not_found',
    );
    const folder = await nodeAt(provider, 'archive');
    await expect(provider.getPage(folder.id)).rejects.toThrow(/folder/);
  });
});

describe('assetUrl', () => {
  it('resolves against the page directory and caches the url', async () => {
    const provider = corpusProvider();
    const page = await nodeAt(provider, 'guides/auth/index.md');
    const first = await provider.assetUrl('./assets/flow.png', page);
    const second = await provider.assetUrl('assets/flow.png', page);
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(0);
  });

  it('resolves an index page relative to its own directory, not its parent', async () => {
    const provider = corpusProvider();
    const index = await nodeAt(provider, 'product/index.md');
    await expect(provider.assetUrl('../assets/logo.svg', index)).resolves.toBeTruthy();
    await expect(provider.assetUrl('assets/logo.svg', index)).rejects.toThrow();
  });

  it('accepts a root-absolute asset path', async () => {
    const provider = corpusProvider();
    const page = await nodeAt(provider, 'guides/auth/tokens.md');
    await expect(provider.assetUrl('/assets/logo.svg', page)).resolves.toBeTruthy();
  });

  it('rejects traversal above the root', async () => {
    const provider = corpusProvider();
    const page = await nodeAt(provider, 'guides/auth/tokens.md');
    await expect(provider.assetUrl('../../../../etc/passwd', page)).rejects.toSatisfy(
      (error: unknown) => isProviderError(error) && error.code === 'validation',
    );
  });

  it('hands an absolute URL straight back', async () => {
    const provider = corpusProvider();
    const page = await nodeAt(provider, 'index.md');
    const external = 'https://example.com/logo.png';
    expect(await provider.assetUrl(external, page)).toBe(external);
  });

  it('falls back to a data URL when the platform has no object URLs', async () => {
    const create = URL.createObjectURL.bind(URL);
    // @ts-expect-error deleting an optional platform API for the duration of this test
    delete URL.createObjectURL;
    try {
      const provider = corpusProvider();
      const page = await nodeAt(provider, 'index.md');
      const url = await provider.assetUrl('assets/diagram.png', page);
      expect(url.startsWith('data:image/png;base64,')).toBe(true);
      expect(url.length).toBeGreaterThan(`data:image/png;base64,`.length);
      expect(PNG.byteLength).toBeGreaterThan(0);
    } finally {
      URL.createObjectURL = create;
    }
  });

  it('revokes object URLs on dispose', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const provider = corpusProvider();
    const page = await nodeAt(provider, 'index.md');
    const url = await provider.assetUrl('assets/logo.svg', page);
    provider.dispose?.();
    expect(revoke).toHaveBeenCalledWith(url);
    revoke.mockRestore();
  });
});

describe('subscribe', () => {
  it('reports a tree change when the store is written to', async () => {
    const store = new MemoryFileStore({ 'a.md': '# A\n' });
    const provider = createFileStoreProvider(store);
    await provider.getTree();

    const events: string[] = [];
    const stop = provider.subscribe?.((event) => events.push(event.type));
    await store.writeText('b.md', '# B\n');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual(['tree']);
    expect((await provider.getTree()).nodes.length).toBe(2);

    stop?.();
    await store.writeText('c.md', '# C\n');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual(['tree']);
  });

  it('is absent when the store cannot watch', () => {
    const store = new MemoryFileStore({ 'a.md': 'x' });
    const provider = createFileStoreProvider(store, { capabilities: { subscribe: false } });
    expect('subscribe' in provider).toBe(false);
  });
});
