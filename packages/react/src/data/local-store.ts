import { create, type StateCreator, type StoreApi, type UseBoundStore } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

function memoryStorage(): StateStorage {
  const map = new Map<string, string>();
  return {
    getItem: (name) => map.get(name) ?? null,
    setItem: (name, value) => {
      map.set(name, value);
    },
    removeItem: (name) => {
      map.delete(name);
    },
  };
}

/**
 * `localStorage` when it works, memory when it does not: on the server there is no such global,
 * and in private mode a write throws even though the read before it succeeded. Preferences and
 * recents are conveniences, so losing them is never worth an exception in a render.
 *
 * The first failure degrades the whole instance, not just that one call: a half-degraded storage
 * would answer a read from `localStorage` after the matching write went to memory.
 */
export function localStorageOrMemory(): StateStorage {
  const memory = memoryStorage();
  let degraded = false;

  function run<T>(onLocal: () => T, onMemory: () => T): T {
    if (degraded) return onMemory();
    try {
      return onLocal();
    } catch {
      degraded = true;
      return onMemory();
    }
  }

  return {
    getItem: (name) =>
      run(
        () => localStorage.getItem(name),
        () => memory.getItem(name),
      ),
    setItem: (name, value) => {
      run(
        () => {
          localStorage.setItem(name, value);
        },
        () => {
          memory.setItem(name, value);
        },
      );
    },
    removeItem: (name) => {
      run(
        () => {
          localStorage.removeItem(name);
        },
        () => {
          memory.removeItem(name);
        },
      );
    },
  };
}

/**
 * One persisted store per namespace, created on first use (docs/04 section 1, L5 and L6: the
 * storage key is `ns:<suffix>`). Two `DocsProvider`s over different backends keep separate
 * preferences, and the same provider gets the same store back across remounts.
 *
 * Actions are not stripped before writing: `JSON.stringify` drops functions, and zustand merges
 * what it read over the initial state, so they come back from the initializer on rehydrate.
 */
export function perNamespace<T>(
  suffix: string,
  initializer: StateCreator<T>,
): (ns: string) => UseBoundStore<StoreApi<T>> {
  const stores = new Map<string, UseBoundStore<StoreApi<T>>>();

  return (ns) => {
    let store = stores.get(ns);
    if (store === undefined) {
      store = create<T>()(
        persist(initializer, {
          name: `${ns}:${suffix}`,
          storage: createJSONStorage(localStorageOrMemory),
        }),
      );
      stores.set(ns, store);
    }
    return store;
  };
}
