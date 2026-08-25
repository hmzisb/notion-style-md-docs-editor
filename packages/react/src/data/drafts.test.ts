import { describe, expect, it, vi } from 'vitest';
import { createDraftStore, draftStoreFor } from './drafts.js';
import type { DocsStorage } from './cache/idb.js';

function memory(): DocsStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => Promise.resolve(map.get(key)),
    setItem: (key, value) => {
      map.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key) => {
      map.delete(key);
      return Promise.resolve();
    },
    entries: () => Promise.resolve([...map.entries()]),
    clear: () => {
      map.clear();
      return Promise.resolve();
    },
    persistent: false,
  };
}

const draft = { body: '# Draft\n', baseVersion: 'sha256:a', updatedAt: 1_000 };

describe('draft store (docs/04 section 1, L4)', () => {
  it('keys records `ns:d:<pageId>` and round-trips them', async () => {
    const storage = memory();
    const store = createDraftStore({ ns: 'docs:default:ff', storage });

    await store.write('p_guide', draft);
    expect([...storage.map.keys()]).toEqual(['docs:default:ff:d:p_guide']);
    await expect(store.read('p_guide')).resolves.toEqual(draft);

    await store.remove('p_guide');
    await expect(store.read('p_guide')).resolves.toBeNull();
  });

  it('reads a missing page as no draft', async () => {
    const store = createDraftStore({ ns: 'ns', storage: memory() });
    await expect(store.read('p_missing')).resolves.toBeNull();
  });

  it('drops a record another schema or a killed tab left behind', async () => {
    const storage = memory();
    const store = createDraftStore({ ns: 'ns', storage });

    storage.map.set('ns:d:p_a', '{"body":"x"');
    storage.map.set('ns:d:p_b', '{"body":"x","baseVersion":7,"updatedAt":1}');

    await expect(store.read('p_a')).resolves.toBeNull();
    await expect(store.read('p_b')).resolves.toBeNull();
  });

  it('keeps a draft written before the file had a version', async () => {
    const store = createDraftStore({ ns: 'ns', storage: memory() });
    const fresh = { ...draft, baseVersion: null };
    await store.write('p_new', fresh);
    await expect(store.read('p_new')).resolves.toEqual(fresh);
  });

  it('writes nothing when the host turned drafts off', async () => {
    const storage = memory();
    const store = createDraftStore({ ns: 'ns', enabled: false, storage });

    await store.write('p_guide', draft);
    expect(storage.map.size).toBe(0);
    await expect(store.read('p_guide')).resolves.toBeNull();
  });

  it('degrades to memory when IndexedDB is unreachable, and says so once', async () => {
    const onUnavailable = vi.fn();
    // jsdom has no IndexedDB, so the real storage takes its fallback path here.
    const store = createDraftStore({ ns: 'ns:idb', onUnavailable });

    await store.write('p_guide', draft);
    await expect(store.read('p_guide')).resolves.toEqual(draft);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it('hands every page of one namespace the same store', () => {
    const store = draftStoreFor({ ns: 'ns:shared', storage: memory() });
    expect(draftStoreFor({ ns: 'ns:shared', storage: memory() })).toBe(store);
    expect(draftStoreFor({ ns: 'ns:other', storage: memory() })).not.toBe(store);
  });
});
