import { describe, expect, it } from 'vitest';
import { createFileStoreProvider } from './semantics.js';
import { MemoryFileStore } from './memory-store.js';
import type { ChangeEvent } from '../model.js';

/**
 * docs/04 section 5. A store that reports its own changes turns them into `ChangeEvent`s: a
 * `page` event for bytes that changed, a `tree` event for a walk that came out different, and
 * nothing at all for the echo of a write this provider just made.
 */

const SEED = {
  'index.md': '---\ntitle: Handbook\n---\n\nRoot.\n',
  'guides/writing.md': '---\ntitle: Writing\n---\n\nFirst.\n',
};

function harness(): {
  store: MemoryFileStore;
  provider: ReturnType<typeof createFileStoreProvider>;
  events: ChangeEvent[];
  settled: () => Promise<void>;
} {
  const store = new MemoryFileStore(SEED);
  const provider = createFileStoreProvider(store);
  const events: ChangeEvent[] = [];
  provider.subscribe?.((event) => events.push(event));
  // The watcher answers on its own chain: a walk, a read and a `crypto.subtle` digest, which
  // is not a microtask. A few turns of the event loop is what waiting for it looks like.
  const settled = async (): Promise<void> => {
    for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { store, provider, events, settled };
}

async function idOf(
  provider: ReturnType<typeof createFileStoreProvider>,
  path: string,
): Promise<string> {
  const tree = await provider.getTree();
  const node = tree.nodes.find((candidate) => candidate.path === path);
  if (!node) throw new Error(`no node at ${path}`);
  return node.id;
}

describe('file store subscribe (docs/04 section 5)', () => {
  it('is advertised only when the store watches', () => {
    expect(createFileStoreProvider(new MemoryFileStore(SEED)).capabilities.subscribe).toBe(true);
    // A store without `watch` is the plain `FileStore` of docs/03 section 3. `watch` is on the
    // prototype, so it is shadowed rather than deleted.
    const blind = new MemoryFileStore(SEED);
    Object.defineProperty(blind, 'watch', { value: undefined });
    const provider = createFileStoreProvider(blind);
    expect(provider.capabilities.subscribe).toBe(false);
    expect(typeof provider.subscribe).toBe('undefined');
  });

  it('reports an external write to a page as a page event with the new version', async () => {
    const { store, provider, events, settled } = harness();
    const id = await idOf(provider, 'guides/writing.md');
    const before = await provider.getPage(id);

    await store.writeText('guides/writing.md', '---\ntitle: Writing\n---\n\nSecond.\n');
    await settled();

    const page = events.filter((event) => event.type === 'page');
    expect(page).toHaveLength(1);
    expect(page[0]).toMatchObject({ id });
    expect(page[0]?.type === 'page' && page[0].version).not.toBe(before.version);
    // The body is unchanged in the tree, so nothing structural happened.
    expect(events.filter((event) => event.type === 'tree')).toHaveLength(0);
    expect((await provider.getPage(id)).body.trim()).toBe('Second.');
  });

  it('stays quiet for the echo of its own save', async () => {
    const { provider, events, settled } = harness();
    const id = await idOf(provider, 'guides/writing.md');
    const page = await provider.getPage(id);

    await provider.savePage(id, { body: 'Mine.\n', baseVersion: page.version });
    await settled();

    expect(events).toEqual([]);
  });

  it('reports a rename as a tree event, once', async () => {
    const { store, provider, events, settled } = harness();
    await provider.getPage(await idOf(provider, 'guides/writing.md'));

    await store.writeText('guides/writing.md', '---\ntitle: Renamed\n---\n\nFirst.\n');
    await settled();

    expect(events.filter((event) => event.type === 'tree')).toHaveLength(1);
    // The bytes changed as well, so the open page hears about it too.
    expect(events.filter((event) => event.type === 'page')).toHaveLength(1);
  });

  it('says nothing about a page it has never read', async () => {
    const { store, provider, events, settled } = harness();
    await provider.getTree();

    await store.writeText('guides/writing.md', '---\ntitle: Writing\n---\n\nElsewhere.\n');
    await settled();

    // Nothing holds a version of that page, so there is nothing to invalidate.
    expect(events).toEqual([]);
  });

  it('reports a new file as a tree event and an unsubscribed listener hears nothing', async () => {
    const { store, provider, events, settled } = harness();
    await provider.getTree();
    const off = provider.subscribe?.(() => {
      throw new Error('this listener was removed');
    });
    off?.();

    await store.writeText('guides/new.md', '# New\n');
    await settled();

    expect(events.filter((event) => event.type === 'tree')).toHaveLength(1);
    expect((await provider.getTree()).nodes.some((node) => node.path === 'guides/new.md')).toBe(
      true,
    );
  });

  it('reports a delete as a tree event and no page event for the file that is gone', async () => {
    const { store, provider, events, settled } = harness();
    await provider.getTree();

    await store.remove('guides/writing.md');
    await settled();

    expect(events.map((event) => event.type)).toEqual(['tree']);
  });
});
