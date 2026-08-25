import type { FileEntry, FileStore } from '../provider.js';
import { ProviderError } from '../errors.js';
import { fnv1a64 } from '../hash.js';
import { isHidden, normalizePath } from './paths.js';

/**
 * `FileStore` over a Map (docs/03 section 3). Directories are implied by the paths of
 * the files under them: there is nothing to create and nothing to leave behind, which
 * is what makes recursive `remove` and directory `move` a prefix operation here.
 */

export type MemoryFileSeed = Record<string, string | Uint8Array>;

export interface MemoryFileStoreOptions {
  /** Provider identity. Defaults to `memory:<hash of the seed paths>`. */
  key?: string;
  readOnly?: boolean;
  /** Monotonic clock for `mtime`. Defaults to a counter, so listings are deterministic. */
  now?: () => number;
}

interface StoredFile {
  data: string | Uint8Array<ArrayBuffer>;
  mtime: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function byteLength(data: string | Uint8Array<ArrayBuffer>): number {
  return typeof data === 'string' ? encoder.encode(data).length : data.byteLength;
}

export class MemoryFileStore implements FileStore {
  readonly key: string;
  readonly readOnly: boolean;

  #files = new Map<string, StoredFile>();
  #now: () => number;
  #tick = 0;
  #watchers = new Set<(paths: string[]) => void>();

  constructor(seed: MemoryFileSeed = {}, opts: MemoryFileStoreOptions = {}) {
    this.readOnly = opts.readOnly ?? false;
    this.#now = opts.now ?? ((): number => ++this.#tick);
    this.key = opts.key ?? `memory:${fnv1a64(Object.keys(seed).sort().join('\n'))}`;
    for (const [path, data] of Object.entries(seed)) {
      const bytes = typeof data === 'string' ? data : new Uint8Array(data);
      this.#files.set(this.#normalize(path), { data: bytes, mtime: this.#now() });
    }
  }

  /** Rejects traversal at the boundary: a store path is always relative to the root. */
  #normalize(path: string): string {
    const normalized = normalizePath(path);
    if (normalized === null || normalized === '') {
      throw new ProviderError('validation', `Invalid store path: ${JSON.stringify(path)}`);
    }
    return normalized;
  }

  #mutable(): void {
    if (this.readOnly) throw new ProviderError('forbidden', 'This store is read-only.');
  }

  #get(path: string): StoredFile {
    const file = this.#files.get(this.#normalize(path));
    if (!file) throw new ProviderError('not_found', `No file at ${path}`);
    return file;
  }

  #notify(paths: string[]): void {
    for (const listener of this.#watchers) listener(paths);
  }

  /** Keeps the `FileStore` contract: every failure arrives as a rejected promise. */
  #run<T>(fn: () => T): Promise<T> {
    try {
      return Promise.resolve(fn());
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  list(): Promise<FileEntry[]> {
    return this.#run(() => {
      const entries: FileEntry[] = [];
      const dirs = new Set<string>();
      for (const [path, file] of this.#files) {
        if (isHidden(path)) continue;
        const parts = path.split('/');
        for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
        entries.push({ path, kind: 'file', size: byteLength(file.data), mtime: file.mtime });
      }
      for (const path of dirs) entries.push({ path, kind: 'dir' });
      entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      return entries;
    });
  }

  readText(path: string): Promise<string> {
    return this.#run(() => {
      const { data } = this.#get(path);
      return typeof data === 'string' ? data : decoder.decode(data);
    });
  }

  readBinary(path: string): Promise<Blob> {
    return this.#run(() => {
      const { data } = this.#get(path);
      return new Blob([typeof data === 'string' ? encoder.encode(data) : data]);
    });
  }

  writeText(path: string, content: string): Promise<void> {
    return this.#run(() => {
      this.#mutable();
      const normalized = this.#normalize(path);
      this.#files.set(normalized, { data: content, mtime: this.#now() });
      this.#notify([normalized]);
    });
  }

  async writeBinary(path: string, data: Blob | ArrayBuffer): Promise<void> {
    this.#mutable();
    // Not routed through #run: awaiting the Blob makes this genuinely async already.
    const normalized = this.#normalize(path);
    const bytes =
      data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(await data.arrayBuffer());
    this.#files.set(normalized, { data: bytes, mtime: this.#now() });
    this.#notify([normalized]);
  }

  /** Recursive for directories: every path under `<path>/` goes with it. */
  remove(path: string): Promise<void> {
    return this.#run(() => {
      this.#mutable();
      const normalized = this.#normalize(path);
      const prefix = `${normalized}/`;
      const removed = [...this.#files.keys()].filter(
        (key) => key === normalized || key.startsWith(prefix),
      );
      if (removed.length === 0) {
        throw new ProviderError('not_found', `No file or directory at ${path}`);
      }
      for (const key of removed) this.#files.delete(key);
      this.#notify(removed);
    });
  }

  /** File or directory. Rejects a move into the source's own subtree. */
  move(from: string, to: string): Promise<void> {
    return this.#run(() => {
      this.#mutable();
      const source = this.#normalize(from);
      const target = this.#normalize(to);
      if (source === target) return;
      if (target.startsWith(`${source}/`)) {
        throw new ProviderError('validation', `Cannot move ${from} into its own subtree.`);
      }

      const prefix = `${source}/`;
      const moved = [...this.#files.entries()].filter(
        ([key]) => key === source || key.startsWith(prefix),
      );
      if (moved.length === 0) {
        throw new ProviderError('not_found', `No file or directory at ${from}`);
      }

      const touched: string[] = [];
      for (const [key, file] of moved) {
        const next = key === source ? target : `${target}/${key.slice(prefix.length)}`;
        this.#files.delete(key);
        this.#files.set(next, { data: file.data, mtime: this.#now() });
        touched.push(key, next);
      }
      this.#notify(touched);
    });
  }

  /** True for a file, and for a directory that holds at least one file. */
  exists(path: string): Promise<boolean> {
    return this.#run(() => {
      const normalized = this.#normalize(path);
      if (this.#files.has(normalized)) return true;
      const prefix = `${normalized}/`;
      for (const key of this.#files.keys()) {
        if (key.startsWith(prefix)) return true;
      }
      return false;
    });
  }

  stat(path: string): Promise<FileEntry | null> {
    return this.#run<FileEntry | null>(() => {
      const normalized = this.#normalize(path);
      const file = this.#files.get(normalized);
      if (file) {
        return { path: normalized, kind: 'file', size: byteLength(file.data), mtime: file.mtime };
      }
      const prefix = `${normalized}/`;
      for (const key of this.#files.keys()) {
        if (key.startsWith(prefix)) return { path: normalized, kind: 'dir' };
      }
      return null;
    });
  }

  watch(listener: (paths: string[]) => void): () => void {
    this.#watchers.add(listener);
    return () => this.#watchers.delete(listener);
  }

  /** Test helper: a plain snapshot of the store, for asserting on what was written. */
  toJSON(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [path, file] of [...this.#files].sort(([a], [b]) => (a < b ? -1 : 1))) {
      out[path] = typeof file.data === 'string' ? file.data : decoder.decode(file.data);
    }
    return out;
  }
}
