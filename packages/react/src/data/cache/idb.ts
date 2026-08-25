import { clear, createStore, del, entries, get, set, type UseStore } from 'idb-keyval';
import type { AsyncStorage } from '@tanstack/query-persist-client-core';

/** IndexedDB databases the module owns (docs/04 section 1). One database, one store each. */
export const QUERIES_STORE = 'docs-queries';
export const DRAFTS_STORE = 'docs-drafts';
export const INDEX_STORE = 'docs-index';

/** `entries` is required, not optional: `persisterGc` walks it to drop stale records. */
export interface DocsStorage extends AsyncStorage {
  getItem: (key: string) => Promise<string | undefined>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  entries: () => Promise<[string, string][]>;
  clear: () => Promise<void>;
  /** False once a call has failed and this instance fell back to memory. */
  readonly persistent: boolean;
}

function memoryStorage(): DocsStorage {
  const map = new Map<string, string>();
  return {
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

/**
 * IndexedDB behind the same interface, degrading to memory on the first failure
 * (docs/04 section 6). Private mode, a `SecurityError`, a full quota and a browser without
 * IndexedDB all land here: the module keeps working, the host hears about it once, and every
 * later call goes straight to the fallback rather than retrying a broken database.
 */
export function createDocsStorage(name: string, onUnavailable?: () => void): DocsStorage {
  let store: UseStore | undefined;
  let fallback: DocsStorage | undefined;

  const degrade = (): DocsStorage => {
    fallback ??= memoryStorage();
    return fallback;
  };

  async function run<T>(
    onIdb: (store: UseStore) => Promise<T>,
    onMemory: (storage: DocsStorage) => Promise<T>,
  ): Promise<T> {
    if (fallback !== undefined) return onMemory(fallback);
    try {
      store ??= createStore(name, name);
      return await onIdb(store);
    } catch {
      const memory = degrade();
      onUnavailable?.();
      return onMemory(memory);
    }
  }

  return {
    getItem: (key) =>
      run(
        (s) => get<string>(key, s),
        (s) => s.getItem(key),
      ),
    setItem: (key, value) =>
      run(
        (s) => set(key, value, s),
        (s) => s.setItem(key, value),
      ),
    removeItem: (key) =>
      run(
        (s) => del(key, s),
        (s) => s.removeItem(key),
      ),
    entries: () =>
      run(
        (s) => entries<string, string>(s),
        (s) => s.entries(),
      ),
    clear: () =>
      run(
        (s) => clear(s),
        (s) => s.clear(),
      ),
    get persistent() {
      return fallback === undefined;
    },
  };
}
