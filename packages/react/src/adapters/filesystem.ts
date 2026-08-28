import {
  ProviderError,
  createFileStoreProvider,
  isMarkdown,
  type DocumentProvider,
  type FileEntry,
  type PageInfo,
  type PageMeta,
} from '@hmzisb/notion-docs-core';
import { createStore, get as idbGet, set as idbSet, type UseStore } from 'idb-keyval';
import { FileSystemDirectoryStore, copyTree, stampOf } from './filesystem-store.js';

/**
 * filesystem adapter entry (docs/08 section 7): a provider over a directory handle, plus the
 * four helpers a host needs to get one — the picker, OPFS, and the two directory copies that
 * move a workspace between them.
 */

/* -------------------------------------------------------------------------- IndexedDB */

/** One database for everything this adapter persists: the index cache and picked handles. */
let area: UseStore | null = null;
function idbArea(): UseStore | null {
  if (typeof indexedDB === 'undefined') return null;
  area ??= createStore('docs-module', 'filesystem');
  return area;
}

/** The cache is an optimisation; a browser that refuses it (private mode) still works. */
async function idbRead<T>(key: string): Promise<T | undefined> {
  const store = idbArea();
  if (store === null) return undefined;
  return idbGet<T>(key, store).catch(() => undefined);
}

async function idbWrite(key: string, value: unknown): Promise<void> {
  const store = idbArea();
  if (store === null) return;
  await idbSet(key, value, store).catch(() => undefined);
}

/* ---------------------------------------------------------------------- index cache */

/** Bumping this discards every stored index, which is the "full re-read on schema change". */
const INDEX_VERSION = 1;
const SAVE_DELAY_MS = 250;

/** docs/03 section 4.11: `path -> { size, mtime, meta, firstH1 }`. */
interface IndexRecord {
  size: number;
  mtime: number;
  meta: PageMeta;
  firstH1?: string;
}

interface IndexFile {
  version: number;
  entries: Record<string, IndexRecord>;
}

/**
 * The provider's `path -> PageInfo` cache, kept in IndexedDB (docs/03 section 4.11). Reading
 * 5k frontmatters on every reload is what this exists to avoid: the listing already carries a
 * size and an mtime per file, so an entry survives exactly as long as the file it was read
 * from is unchanged, and only new or rewritten files reach the disk again.
 */
class PersistentIndex extends Map<string, PageInfo> {
  readonly ready: Promise<void>;

  #store: FileSystemDirectoryStore;
  #key: string;
  #onProgress: ((progress: { done: number; total: number }) => void) | undefined;
  #stamps = new Map<string, string>();
  #timer: ReturnType<typeof setTimeout> | null = null;
  /** The listing the current build is walking, and its page count: progress is per build. */
  #counted: ReadonlyMap<string, FileEntry> | null = null;
  #total = 0;
  #done = 0;

  constructor(
    store: FileSystemDirectoryStore,
    key: string,
    onProgress?: (progress: { done: number; total: number }) => void,
  ) {
    super();
    this.#store = store;
    this.#key = key;
    this.#onProgress = onProgress;
    this.ready = this.#hydrate();
  }

  async #hydrate(): Promise<void> {
    const saved = await idbRead<IndexFile>(this.#key);
    if (saved?.version !== INDEX_VERSION) return;
    for (const [path, record] of Object.entries(saved.entries)) {
      super.set(path, { meta: record.meta, firstH1: record.firstH1 });
      this.#stamps.set(path, `${String(record.size)}:${String(record.mtime)}`);
    }
  }

  /** A hit is only a hit while the file behind it still has the size and mtime it was read at. */
  override get(path: string): PageInfo | undefined {
    const hit = super.get(path);
    if (hit === undefined) return undefined;
    if (this.#stamps.get(path) !== stampOf(this.#store.entries().get(path))) {
      this.delete(path);
      return undefined;
    }
    return hit;
  }

  override set(path: string, info: PageInfo): this {
    super.set(path, info);
    const stamp = stampOf(this.#store.entries().get(path));
    if (stamp !== undefined) this.#stamps.set(path, stamp);
    this.#report();
    this.#schedule();
    return this;
  }

  override delete(path: string): boolean {
    this.#stamps.delete(path);
    return super.delete(path);
  }

  override clear(): void {
    this.#stamps.clear();
    super.clear();
    this.#schedule();
  }

  /** Every `set` is one page read from disk, which is what "Indexing 1,240 / 5,000" counts. */
  #report(): void {
    if (this.#onProgress === undefined) return;
    const entries = this.#store.entries();
    if (this.#counted !== entries) {
      this.#counted = entries;
      this.#total = [...entries.keys()].filter((path) => isMarkdown(path)).length;
      this.#done = 0;
    }
    this.#done += 1;
    this.#onProgress({ done: this.#done, total: Math.max(this.#total, this.#done) });
  }

  /** One write per burst: a cold build calls `set` once per page. */
  #schedule(): void {
    this.#timer ??= setTimeout(() => {
      this.#timer = null;
      void this.flush();
    }, SAVE_DELAY_MS);
  }

  /** Persists what is still on disk, which is also what prunes deleted files from the cache. */
  async flush(): Promise<void> {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    const live = this.#store.entries();
    const entries: Record<string, IndexRecord> = {};
    for (const [path, info] of this) {
      const entry = live.get(path);
      if (entry === undefined) continue;
      entries[path] = {
        size: entry.size ?? -1,
        mtime: entry.mtime ?? -1,
        meta: info.meta,
        ...(info.firstH1 === undefined ? {} : { firstH1: info.firstH1 }),
      };
    }
    await idbWrite(this.#key, { version: INDEX_VERSION, entries } satisfies IndexFile);
  }
}

/* ------------------------------------------------------------------------- provider */

export interface FileSystemProviderOptions {
  /** Provider identity for cache namespacing. Defaults to `fs:<handle name>`. */
  key?: string;
  /** Workspace display name, surfaced by `getMeta`. */
  title?: string;
  /** Keep `path -> { size, mtime, meta, firstH1 }` in IndexedDB (docs/03 section 4.11). */
  indexCache?: boolean;
  /** Poll the folder for outside edits. The handle API has no change events. */
  watch?: boolean;
  readOnly?: boolean;
  /** Fires per page during the first (uncached) index build, for "Indexing 1,240 / 5,000". */
  onProgress?: (progress: { done: number; total: number }) => void;
}

export function createFileSystemProvider(
  handle: FileSystemDirectoryHandle,
  opts: FileSystemProviderOptions = {},
): DocumentProvider {
  const store = new FileSystemDirectoryStore(handle, {
    key: opts.key,
    readOnly: opts.readOnly,
    watch: opts.watch,
  });
  if (opts.indexCache !== true) return createFileStoreProvider(store, { title: opts.title });

  const index = new PersistentIndex(store, `docs:${store.key}:index`, opts.onProgress);
  // Core lists before it reads any page, so the listing is where the cache hydrates.
  store.beforeList = index.ready;
  return createFileStoreProvider(store, { title: opts.title, infoCache: index });
}

/* -------------------------------------------------------------------------- picker */

type DirectoryPicker = (opts?: {
  mode?: 'read' | 'readwrite';
  id?: string;
}) => Promise<FileSystemDirectoryHandle>;

/** Neither the picker nor the permission API is in `lib.dom`, and neither is everywhere. */
interface PermissionApi {
  queryPermission: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
}

export interface PickDirectoryOptions {
  mode?: 'read' | 'readwrite';
  /** Remembers the handle under this id, so a reload only costs a permission prompt. */
  id?: string;
}

function directoryPicker(): DirectoryPicker | null {
  const scope = globalThis as unknown as { showDirectoryPicker?: DirectoryPicker };
  return typeof scope.showDirectoryPicker === 'function' ? scope.showDirectoryPicker : null;
}

/** True once the handle may be used in `mode`. An engine without the API grants by existing. */
async function permitted(
  handle: FileSystemDirectoryHandle,
  mode: 'read' | 'readwrite',
): Promise<boolean> {
  const api = handle as unknown as Partial<PermissionApi>;
  if (typeof api.queryPermission !== 'function') return true;
  if ((await api.queryPermission.call(handle, { mode })) === 'granted') return true;
  if (typeof api.requestPermission !== 'function') return false;
  return (await api.requestPermission.call(handle, { mode })) === 'granted';
}

/**
 * docs/08 section 7. Reuses the handle stored under `id` when the user still grants it, which
 * is what makes "reopen my folder" survive a reload; otherwise it opens the picker. Returns
 * null when the user cancels, and when the engine has no picker at all (Chromium-only).
 */
export async function pickDirectory(
  opts: PickDirectoryOptions = {},
): Promise<FileSystemDirectoryHandle | null> {
  const mode = opts.mode ?? 'readwrite';
  const id = opts.id;

  if (id !== undefined) {
    const saved = await idbRead<FileSystemDirectoryHandle>(handleKey(id));
    // Called from a click, so this is the user gesture the permission prompt needs.
    if (saved !== undefined && (await permitted(saved, mode))) return saved;
  }

  const picker = directoryPicker();
  if (picker === null) return null;

  let handle: FileSystemDirectoryHandle;
  try {
    handle = await picker({ mode, ...(id === undefined ? {} : { id }) });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return null;
    throw error;
  }
  if (id !== undefined) await idbWrite(handleKey(id), handle);
  return handle;
}

const handleKey = (id: string): string => `docs:handle:${id}`;

/* ---------------------------------------------------------------------------- OPFS */

/** The origin private file system, which every evergreen browser has. `subdir` is created. */
export async function getOpfsRoot(subdir?: string): Promise<FileSystemDirectoryHandle> {
  const storage: StorageManager | undefined =
    typeof navigator === 'undefined' ? undefined : navigator.storage;
  // Two ways to not have one: no `navigator.storage` at all, which is WebKit on Linux, and a
  // `StorageManager` that predates OPFS. Both are the same answer to the caller.
  if (typeof storage?.getDirectory !== 'function') {
    throw new ProviderError('unsupported', 'This browser has no origin private file system.');
  }

  let dir = await storage.getDirectory();
  for (const part of (subdir ?? '').split('/')) {
    if (part !== '') dir = await dir.getDirectoryHandle(part, { create: true });
  }
  return dir;
}

/* ------------------------------------------------------------------ import / export */

/** Copies a workspace out to a real folder, e.g. OPFS to the disk the user just picked. */
export async function exportToDirectory(
  from: FileSystemDirectoryHandle,
  to: FileSystemDirectoryHandle,
): Promise<void> {
  await copyTree(from, to);
}

export interface ImportOptions {
  /** Empty the destination first, so the import is a replacement rather than a merge. */
  clear?: boolean;
}

export async function importFromDirectory(
  from: FileSystemDirectoryHandle,
  to: FileSystemDirectoryHandle,
  opts: ImportOptions = {},
): Promise<void> {
  if (opts.clear === true) {
    const names: string[] = [];
    for await (const name of to.keys()) names.push(name);
    for (const name of names) await to.removeEntry(name, { recursive: true });
  }
  await copyTree(from, to);
}
