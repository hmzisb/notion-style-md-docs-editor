/**
 * L3 (docs/04 section 1): parsed values keyed by `ns:id:version`. Same version means the same
 * bytes, so the same object comes back and the editor never re-parses a page it already has.
 * The cache is generic because the parsed type lives in `platejs`, which only the editor and
 * view entries load.
 */
export const VALUE_CACHE_SIZE = 20;

export const valueCacheKey = (ns: string, id: string, version: string): string =>
  `${ns}:${id}:${version}`;

export interface Lru<T> {
  get: (key: string) => T | undefined;
  set: (key: string, value: T) => void;
  getOrCreate: (key: string, create: () => T) => T;
  has: (key: string) => boolean;
  delete: (key: string) => void;
  clear: () => void;
  readonly size: number;
}

/** Insertion-ordered `Map` as the LRU: re-inserting on read moves an entry to the young end. */
export function createLru<T>(max: number = VALUE_CACHE_SIZE): Lru<T> {
  const entries = new Map<string, T>();

  const touch = (key: string, value: T): T => {
    entries.delete(key);
    entries.set(key, value);
    return value;
  };

  return {
    get: (key) => {
      const value = entries.get(key);
      return value === undefined ? undefined : touch(key, value);
    },
    set: (key, value) => {
      touch(key, value);
      for (const oldest of entries.keys()) {
        if (entries.size <= max) break;
        entries.delete(oldest);
      }
    },
    getOrCreate(key, create) {
      const found = entries.get(key);
      if (found !== undefined) return touch(key, found);
      const created = create();
      this.set(key, created);
      return created;
    },
    has: (key) => entries.has(key),
    delete: (key) => {
      entries.delete(key);
    },
    clear: () => {
      entries.clear();
    },
    get size() {
      return entries.size;
    },
  };
}
