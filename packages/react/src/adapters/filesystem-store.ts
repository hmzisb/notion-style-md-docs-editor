import {
  ProviderError,
  basename,
  dirname,
  isHidden,
  normalizePath,
  type FileEntry,
  type FileStore,
} from '@hmzisb/notion-docs-core';

/**
 * `FileStore` over a `FileSystemDirectoryHandle` (docs/03 section 3). The web API is a tree of
 * handles; every method here turns a posix path into a walk down that tree, so core keeps its
 * one implementation of ids, ordering and slugs (D-03) over a local folder or OPFS alike.
 */

/** Chromium ships an atomic rename; elsewhere a write lands straight on the target. */
interface MovableHandle {
  move: (parent: FileSystemDirectoryHandle, name: string) => Promise<void>;
}

/** `move` is not in `lib.dom` and not in every engine, so it is looked for, never assumed. */
function movableOf(handle: FileSystemHandle): MovableHandle | null {
  return 'move' in handle && typeof handle.move === 'function'
    ? (handle as unknown as MovableHandle)
    : null;
}

export interface FileSystemStoreOptions {
  /** Provider identity for cache namespacing. Defaults to `fs:<handle name>`. */
  key?: string;
  readOnly?: boolean;
  /** The handle API has no change events, so `watch` polls the listing (docs/03 section 3). */
  watch?: boolean;
  /** Poll period when `watch` is on. */
  pollIntervalMs?: number;
}

/** docs/04 section 5 polls the open page every 5 s; one listing covers every page at once. */
const DEFAULT_POLL_MS = 5000;

/** A `FileEntry` reduced to what decides whether a cached read is still good. */
export function stampOf(entry: FileEntry | undefined): string | undefined {
  return entry === undefined
    ? undefined
    : `${String(entry.size ?? -1)}:${String(entry.mtime ?? -1)}`;
}

export class FileSystemDirectoryStore implements FileStore {
  readonly key: string;
  readonly readOnly: boolean;

  /**
   * Awaited at the top of `list()`. Core reads the listing before it reads any page, so this
   * is where the IndexedDB index hydrates without making the provider factory async.
   */
  beforeList: Promise<unknown> = Promise.resolve();

  #root: FileSystemDirectoryHandle;
  #entries = new Map<string, FileEntry>();
  #watchers = new Set<(paths: string[]) => void>();
  #timer: ReturnType<typeof setInterval> | null = null;
  #pollMs: number;
  #seq = 0;

  constructor(root: FileSystemDirectoryHandle, opts: FileSystemStoreOptions = {}) {
    this.#root = root;
    this.readOnly = opts.readOnly ?? false;
    this.key = opts.key ?? `fs:${root.name === '' ? 'root' : root.name}`;
    this.#pollMs = opts.pollIntervalMs ?? DEFAULT_POLL_MS;
    if (opts.watch === true) this.watch = this.#watch.bind(this);
  }

  /** The last listing, which is what `stat` and the index cache check freshness against. */
  entries(): ReadonlyMap<string, FileEntry> {
    return this.#entries;
  }

  async list(): Promise<FileEntry[]> {
    await this.beforeList;
    const files: FileEntry[] = [];
    await this.#walk(this.#root, '', files);

    // Directories are derived from the paths of the files under them, exactly as the memory
    // store derives them: an empty folder left behind by a move is not a node in the tree.
    const dirs = new Set<string>();
    for (const file of files) {
      const parts = file.path.split('/');
      for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
    }

    const entries = [...files, ...[...dirs].map((path): FileEntry => ({ path, kind: 'dir' }))];
    entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    this.#entries = new Map(files.map((entry) => [entry.path, entry]));
    return entries;
  }

  async readText(path: string): Promise<string> {
    return (await this.#file(path)).text();
  }

  /** The handle API already hands back a typed `File`, which is the Blob `assetUrl` wants. */
  async readBinary(path: string): Promise<Blob> {
    return this.#file(path);
  }

  async writeText(path: string, content: string): Promise<void> {
    await this.#write(path, content);
  }

  async writeBinary(path: string, data: Blob | ArrayBuffer): Promise<void> {
    await this.#write(path, data instanceof ArrayBuffer ? new Blob([data]) : data);
  }

  /** Recursive for directories: `removeEntry` takes the whole subtree in one call. */
  async remove(path: string): Promise<void> {
    this.#mutable();
    const full = this.#normalize(path);
    const parent = await this.#dirOf(full, false);
    try {
      await parent.removeEntry(basename(full), { recursive: true });
    } catch (error) {
      throw asProviderError(error, `No file or directory at ${path}`);
    }
    this.#notify([full]);
  }

  /**
   * A file moves natively where the platform has `FileSystemFileHandle.move`; a directory,
   * and any platform without it, is copy + remove (docs/03 section 3).
   */
  async move(from: string, to: string): Promise<void> {
    this.#mutable();
    const source = this.#normalize(from);
    const target = this.#normalize(to);
    if (source === target) return;
    if (target.startsWith(`${source}/`)) {
      throw new ProviderError('validation', `Cannot move ${from} into its own subtree.`);
    }

    const parent = await this.#dirOf(target, true);
    const file = await this.#fileHandle(source);
    if (file !== null) {
      const movable = movableOf(file);
      if (movable !== null) {
        await movable.move(parent, basename(target));
      } else {
        await this.#write(target, await file.getFile());
        await this.remove(source);
      }
      this.#notify([source, target]);
      return;
    }

    const dir = await this.#dirHandle(source);
    if (dir === null) throw new ProviderError('not_found', `No file or directory at ${from}`);
    await copyTree(dir, await parent.getDirectoryHandle(basename(target), { create: true }));
    await this.remove(source);
    this.#notify([source, target]);
  }

  async exists(path: string): Promise<boolean> {
    const full = this.#normalize(path);
    return (await this.#fileHandle(full)) !== null || (await this.#dirHandle(full)) !== null;
  }

  async stat(path: string): Promise<FileEntry | null> {
    const full = this.#normalize(path);
    const handle = await this.#fileHandle(full);
    if (handle !== null) {
      const file = await handle.getFile();
      return { path: full, kind: 'file', size: file.size, mtime: file.lastModified };
    }
    return (await this.#dirHandle(full)) === null ? null : { path: full, kind: 'dir' };
  }

  /** Present only when the host asked for it, because it is a poll and it costs a listing. */
  watch?: (listener: (paths: string[]) => void) => () => void;

  #watch(listener: (paths: string[]) => void): () => void {
    this.#watchers.add(listener);
    this.#timer ??= setInterval(() => {
      void this.#poll();
    }, this.#pollMs);

    return () => {
      this.#watchers.delete(listener);
      if (this.#watchers.size === 0 && this.#timer !== null) {
        clearInterval(this.#timer);
        this.#timer = null;
      }
    };
  }

  /** One listing against the last one: added, removed and rewritten files are all changes. */
  async #poll(): Promise<void> {
    const before = this.#entries;
    await this.list().catch(() => undefined);
    const after = this.#entries;
    if (after === before) return;

    const changed: string[] = [];
    for (const [path, entry] of after) {
      if (stampOf(before.get(path)) !== stampOf(entry)) changed.push(path);
    }
    for (const path of before.keys()) if (!after.has(path)) changed.push(path);
    if (changed.length > 0) this.#notify(changed);
  }

  #notify(paths: string[]): void {
    for (const listener of this.#watchers) listener(paths);
  }

  #mutable(): void {
    if (this.readOnly) throw new ProviderError('forbidden', 'This store is read-only.');
  }

  /** Rejects traversal at the boundary: a store path is always relative to the root. */
  #normalize(path: string): string {
    const normalized = normalizePath(path);
    if (normalized === null || normalized === '') {
      throw new ProviderError('validation', `Invalid store path: ${JSON.stringify(path)}`);
    }
    return normalized;
  }

  async #walk(dir: FileSystemDirectoryHandle, prefix: string, out: FileEntry[]): Promise<void> {
    for await (const [name, handle] of dir.entries()) {
      const path = prefix === '' ? name : `${prefix}/${name}`;
      if (isHidden(path)) continue;
      if (handle.kind === 'directory') {
        await this.#walk(handle as FileSystemDirectoryHandle, path, out);
      } else {
        const file = await (handle as FileSystemFileHandle).getFile();
        out.push({ path, kind: 'file', size: file.size, mtime: file.lastModified });
      }
    }
  }

  /** The directory holding `path`, walked from the root. `create` makes the parents. */
  async #dirOf(path: string, create: boolean): Promise<FileSystemDirectoryHandle> {
    const parent = dirname(path);
    if (parent === '') return this.#root;
    let dir = this.#root;
    for (const part of parent.split('/')) {
      try {
        dir = await dir.getDirectoryHandle(part, { create });
      } catch (error) {
        throw asProviderError(error, `No directory at ${parent}`);
      }
    }
    return dir;
  }

  async #fileHandle(path: string): Promise<FileSystemFileHandle | null> {
    const full = this.#normalize(path);
    try {
      return await (await this.#dirOf(full, false)).getFileHandle(basename(full));
    } catch {
      return null;
    }
  }

  async #dirHandle(path: string): Promise<FileSystemDirectoryHandle | null> {
    const full = this.#normalize(path);
    try {
      return await (await this.#dirOf(full, false)).getDirectoryHandle(basename(full));
    } catch {
      return null;
    }
  }

  async #file(path: string): Promise<File> {
    const handle = await this.#fileHandle(path);
    if (handle === null) throw new ProviderError('not_found', `No file at ${path}`);
    return handle.getFile();
  }

  /**
   * An overwrite goes through a dot-prefixed temp file and renames it over the target where the
   * platform has `move`, so a failed write leaves the old file intact rather than a truncated
   * one. The temp name is hidden, which is what keeps a crashed write out of the listing. A new
   * file has nothing to protect, so it is written where it belongs.
   */
  async #write(path: string, data: string | Blob): Promise<void> {
    this.#mutable();
    const full = this.#normalize(path);
    const dir = await this.#dirOf(full, true);
    const name = basename(full);
    const existing = await this.#fileHandle(full);
    const atomic = existing !== null && movableOf(existing) !== null;

    this.#seq += 1;
    const handle = atomic
      ? await dir.getFileHandle(`.${name}.${String(this.#seq)}.tmp`, { create: true })
      : await dir.getFileHandle(name, { create: true });

    const stream = await handle.createWritable();
    try {
      await stream.write(data);
      await stream.close();
    } catch (error) {
      await stream.abort().catch(() => undefined);
      throw error instanceof Error ? error : new Error(String(error));
    }
    if (atomic) await movableOf(handle)?.move(dir, name);
    this.#notify([full]);
  }
}

/** Recursive copy, skipping the same dot-dirs and `node_modules` the listing skips. */
export async function copyTree(
  from: FileSystemDirectoryHandle,
  to: FileSystemDirectoryHandle,
): Promise<void> {
  for await (const [name, handle] of from.entries()) {
    if (isHidden(name)) continue;
    if (handle.kind === 'directory') {
      await copyTree(
        handle as FileSystemDirectoryHandle,
        await to.getDirectoryHandle(name, { create: true }),
      );
      continue;
    }
    const file = await (handle as FileSystemFileHandle).getFile();
    const stream = await (await to.getFileHandle(name, { create: true })).createWritable();
    await stream.write(file);
    await stream.close();
  }
}

/** Everything the handle API can throw, mapped onto the codes the provider contract uses. */
function asProviderError(error: unknown, notFound: string): ProviderError {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotFoundError' || name === 'TypeMismatchError') {
    return new ProviderError('not_found', notFound);
  }
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new ProviderError('forbidden', 'Permission to this folder was not granted.');
  }
  if (name === 'QuotaExceededError') {
    return new ProviderError('quota', 'This browser is out of storage for this folder.');
  }
  return new ProviderError('internal', error instanceof Error ? error.message : String(error));
}
