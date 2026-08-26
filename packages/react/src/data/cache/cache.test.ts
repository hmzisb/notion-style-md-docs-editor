import 'fake-indexeddb/auto';
import { QueryClient, hashKey, type QueryKey } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QUERIES_STORE, createDocsStorage, type DocsStorage } from './idb.js';
import { queryPersister } from './persister.js';
import {
  CACHE_SCHEMA_VERSION,
  PERSIST_MAX_AGE,
  cacheBuster,
  createDocsPersister,
  isPersistable,
  resolvePersist,
  scheduleGc,
} from './persister.js';
import { VALUE_CACHE_SIZE, createLru, valueCacheKey } from './value-cache.js';

interface Doc {
  id: string;
}

const NS = 'docs:test:0123456789abcdef';
const pageKey = (id: string): QueryKey => [NS, 'page', id];
const storageKey = (key: QueryKey): string => `${NS}:q-${hashKey(key)}`;

const record = (
  key: QueryKey,
  data: unknown,
  over: { buster?: string; age?: number } = {},
): string =>
  JSON.stringify({
    buster: over.buster ?? cacheBuster,
    queryHash: hashKey(key),
    queryKey: key,
    state: { data, dataUpdatedAt: Date.now() - (over.age ?? 0), status: 'success' },
  });

/** In-memory `DocsStorage`, so a test can seed records and read them back synchronously. */
function fakeStorage(): DocsStorage & { map: Map<string, string> } {
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
    persistent: true,
  };
}

const client = (): QueryClient =>
  new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });

describe('value cache (L3)', () => {
  it('keys on namespace, id and version', () => {
    expect(valueCacheKey(NS, 'a', 'sha256:1')).toBe(`${NS}:a:sha256:1`);
    expect(VALUE_CACHE_SIZE).toBe(20);
  });

  it('evicts the least recently used entry past the limit', () => {
    const lru = createLru<number>(3);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.set('c', 3);
    lru.set('d', 4);

    expect(lru.size).toBe(3);
    expect(lru.has('a')).toBe(false);
    expect(lru.get('d')).toBe(4);
  });

  it('a read makes an entry young again', () => {
    const lru = createLru<number>(2);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.get('a');
    lru.set('c', 3);

    expect(lru.has('a')).toBe(true);
    expect(lru.has('b')).toBe(false);
  });

  it('drops every version of one page and leaves the rest', () => {
    const lru = createLru<number>(VALUE_CACHE_SIZE);
    lru.set(valueCacheKey(NS, 'a', 'sha256:1'), 1);
    lru.set(valueCacheKey(NS, 'a', 'sha256:2'), 2);
    lru.set(valueCacheKey(NS, 'ab', 'sha256:1'), 3);

    // docs/04 section 4: a deleted page has no versions left, and `ab` is not `a`.
    lru.deletePrefix(valueCacheKey(NS, 'a', ''));

    expect(lru.get(valueCacheKey(NS, 'a', 'sha256:1'))).toBeUndefined();
    expect(lru.get(valueCacheKey(NS, 'a', 'sha256:2'))).toBeUndefined();
    expect(lru.get(valueCacheKey(NS, 'ab', 'sha256:1'))).toBe(3);
  });

  it('getOrCreate builds once and reuses the same object', () => {
    const lru = createLru<{ v: number }>();
    const create = vi.fn(() => ({ v: 1 }));
    const first = lru.getOrCreate('a', create);

    expect(lru.getOrCreate('a', create)).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);

    lru.delete('a');
    expect(lru.getOrCreate('a', create)).not.toBe(first);
    lru.clear();
    expect(lru.size).toBe(0);
  });
});

describe('persistable queries', () => {
  it('persists the tree and pages, never meta or search', () => {
    expect(isPersistable([NS, 'tree', '*'])).toBe(true);
    expect(isPersistable(pageKey('a'))).toBe(true);
    expect(isPersistable([NS, 'meta'])).toBe(false);
    expect(isPersistable([NS, 'search', 'q'])).toBe(false);
  });

  it('resolves the persist option to its three layers', () => {
    expect(resolvePersist(true)).toEqual({
      queries: true,
      drafts: true,
      maxAgeMs: PERSIST_MAX_AGE,
    });
    expect(resolvePersist(false)).toEqual({
      queries: false,
      drafts: false,
      maxAgeMs: PERSIST_MAX_AGE,
    });
    expect(resolvePersist({ queries: false })).toEqual({
      queries: false,
      drafts: true,
      maxAgeMs: PERSIST_MAX_AGE,
    });
    expect(resolvePersist({ maxAgeMs: 5 }).maxAgeMs).toBe(5);
  });
});

describe('query persister (L2)', () => {
  it('writes a page after a fetch and restores it before the next one', async () => {
    const storage = fakeStorage();
    const persister = createDocsPersister({ ns: NS, storage });
    const key = pageKey('a');

    await client().query({
      queryKey: key,
      queryFn: () => Promise.resolve({ id: 'a' }),
      persister: queryPersister<Doc, QueryKey>(persister),
    });
    await vi.waitFor(() => {
      expect(storage.map.has(storageKey(key))).toBe(true);
    });

    // A cold client: the data can only come from storage, because the fetch would throw.
    const queryFn = vi.fn((): Promise<Doc> => Promise.reject(new Error('network')));
    const restored = await client().query({
      queryKey: key,
      queryFn,
      persister: queryPersister<Doc, QueryKey>(persister),
    });

    expect(restored).toEqual({ id: 'a' });
    expect(queryFn).not.toHaveBeenCalled();
  });

  it('never writes a query the filter excludes', async () => {
    const storage = fakeStorage();
    const persister = createDocsPersister({ ns: NS, storage });

    await client().query({
      queryKey: [NS, 'meta'] as QueryKey,
      queryFn: () => Promise.resolve({ capabilities: {} }),
      persister: queryPersister<{ capabilities: object }, QueryKey>(persister),
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(storage.map.size).toBe(0);
  });

  it('ignores a record written by another schema version', async () => {
    const storage = fakeStorage();
    const key = pageKey('b');
    storage.map.set(storageKey(key), record(key, { id: 'stale' }, { buster: '0:0' }));
    const persister = createDocsPersister({ ns: NS, storage });

    const fresh = await client().query({
      queryKey: key,
      queryFn: () => Promise.resolve({ id: 'fresh' }),
      persister: queryPersister<Doc, QueryKey>(persister),
    });

    expect(fresh).toEqual({ id: 'fresh' });
    expect(cacheBuster).toBe(`${String(CACHE_SCHEMA_VERSION)}:1`);
  });

  it('ignores a record older than maxAge', async () => {
    const storage = fakeStorage();
    const key = pageKey('c');
    storage.map.set(
      storageKey(key),
      record(key, { id: 'ancient' }, { age: PERSIST_MAX_AGE + 1000 }),
    );
    const persister = createDocsPersister({ ns: NS, storage });

    const fresh = await client().query({
      queryKey: key,
      queryFn: () => Promise.resolve({ id: 'fresh' }),
      persister: queryPersister<Doc, QueryKey>(persister),
    });

    expect(fresh).toEqual({ id: 'fresh' });
  });

  it('collects busted and expired records and keeps the live one', async () => {
    const storage = fakeStorage();
    const live = pageKey('live');
    const busted = pageKey('busted');
    const expired = pageKey('expired');
    storage.map.set(storageKey(live), record(live, { id: 'live' }));
    storage.map.set(storageKey(busted), record(busted, { id: 'busted' }, { buster: '0:0' }));
    storage.map.set(
      storageKey(expired),
      record(expired, { id: 'old' }, { age: PERSIST_MAX_AGE + 1 }),
    );
    storage.map.set('someone-elses-key', 'not ours');

    await createDocsPersister({ ns: NS, storage }).persisterGc();

    expect([...storage.map.keys()].sort()).toEqual([storageKey(live), 'someone-elses-key'].sort());
  });

  it('scheduleGc runs in idle time and can be cancelled', async () => {
    vi.useFakeTimers();
    try {
      const storage = fakeStorage();
      const key = pageKey('d');
      storage.map.set(storageKey(key), record(key, { id: 'x' }, { buster: '0:0' }));
      const persister = createDocsPersister({ ns: NS, storage });

      const cancel = scheduleGc(persister);
      cancel();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(storage.map.size).toBe(1);

      scheduleGc(persister);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(storage.map.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('IndexedDB storage', () => {
  /** Every route into IndexedDB goes through `open`, so this stands in for a browser that
   *  refuses one: private mode, a `SecurityError`, a full quota. */
  const breakIndexedDb = (name: string): void => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new DOMException(name, name);
    });
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('round-trips through IndexedDB', async () => {
    const storage = createDocsStorage(QUERIES_STORE);
    await storage.setItem('a', '1');
    await storage.setItem('b', '2');

    expect(await storage.getItem('a')).toBe('1');
    expect((await storage.entries()).sort()).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
    expect(storage.persistent).toBe(true);

    await storage.removeItem('a');
    expect(await storage.getItem('a')).toBeUndefined();
    await storage.clear();
    expect(await storage.entries()).toEqual([]);
  });

  it('degrades to memory once and warns once when the database cannot be opened', async () => {
    breakIndexedDb('QuotaExceededError');
    const onUnavailable = vi.fn();
    const storage = createDocsStorage(QUERIES_STORE, onUnavailable);

    await storage.setItem('a', '1');
    await storage.setItem('b', '2');

    expect(await storage.getItem('a')).toBe('1');
    expect(storage.persistent).toBe(false);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it('keeps a persister working on top of the degraded storage', async () => {
    breakIndexedDb('SecurityError');
    const onUnavailable = vi.fn();
    const persister = createDocsPersister({ ns: NS, onUnavailable });
    const key = pageKey('e');

    const data = await client().query({
      queryKey: key,
      queryFn: () => Promise.resolve({ id: 'e' }),
      persister: queryPersister<Doc, QueryKey>(persister),
    });

    expect(data).toEqual({ id: 'e' });
    await vi.waitFor(() => {
      expect(onUnavailable).toHaveBeenCalled();
    });
  });
});
