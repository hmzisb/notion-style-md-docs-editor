/**
 * `FileStore` over `node:fs` (docs/03 section 3), for the tools in this folder. Not part of
 * either package: the module ships browser stores, and the doctor is the only thing here
 * that needs a real directory. Paths are posix and relative to the root, like every store.
 */
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  ProviderError,
  isHidden,
  normalizePath,
  type FileEntry,
  type FileStore,
} from '@hmzisb/notion-docs-core';

export interface NodeFileStoreOptions {
  /** Provider identity. Defaults to `node:<absolute root>`. */
  key?: string;
  readOnly?: boolean;
}

/** ENOENT is the only error worth translating; the rest are the host's problem. */
function rethrow(error: unknown, path: string): never {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
    throw new ProviderError('not_found', `No file at ${path}`);
  }
  throw error;
}

export class NodeFileStore implements FileStore {
  readonly key: string;
  readonly readOnly: boolean;

  readonly #root: string;

  constructor(root: string, opts: NodeFileStoreOptions = {}) {
    this.#root = root;
    this.key = opts.key ?? `node:${root}`;
    this.readOnly = opts.readOnly ?? false;
  }

  /** Rejects traversal at the boundary: a store path never climbs above the root. */
  #resolve(path: string): string {
    const normalized = normalizePath(path);
    if (normalized === null || normalized === '') {
      throw new ProviderError('validation', `Invalid store path: ${JSON.stringify(path)}`);
    }
    return join(this.#root, normalized);
  }

  #mutable(): void {
    if (this.readOnly) throw new ProviderError('forbidden', 'This store is read-only.');
  }

  /** Writes through a sibling temp file, so a crash never leaves half a page on disk. */
  async #write(path: string, data: string | Uint8Array): Promise<void> {
    this.#mutable();
    const full = this.#resolve(path);
    await mkdir(dirname(full), { recursive: true });
    const temp = `${full}.${String(process.pid)}.tmp`;
    await writeFile(temp, data);
    await rename(temp, full);
  }

  async #walk(dir: string, prefix: string, into: FileEntry[]): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (isHidden(entry.name)) continue;
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        into.push({ path, kind: 'dir' });
        await this.#walk(join(dir, entry.name), path, into);
      } else if (entry.isFile()) {
        into.push({ path, kind: 'file' });
      }
    }
  }

  async list(): Promise<FileEntry[]> {
    const out: FileEntry[] = [];
    await this.#walk(this.#root, '', out);
    return out;
  }

  async readText(path: string): Promise<string> {
    try {
      return await readFile(this.#resolve(path), 'utf8');
    } catch (error) {
      rethrow(error, path);
    }
  }

  async readBinary(path: string): Promise<Blob> {
    try {
      const bytes = await readFile(this.#resolve(path));
      return new Blob([new Uint8Array(bytes)]);
    } catch (error) {
      rethrow(error, path);
    }
  }

  writeText(path: string, content: string): Promise<void> {
    return this.#write(path, content);
  }

  async writeBinary(path: string, data: Blob | ArrayBuffer): Promise<void> {
    const bytes =
      data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : new Uint8Array(data);
    await this.#write(path, bytes);
  }

  async remove(path: string): Promise<void> {
    this.#mutable();
    const full = this.#resolve(path);
    if (!(await this.exists(path))) throw new ProviderError('not_found', `No file at ${path}`);
    await rm(full, { recursive: true });
  }

  async move(from: string, to: string): Promise<void> {
    this.#mutable();
    const target = this.#resolve(to);
    await mkdir(dirname(target), { recursive: true });
    try {
      await rename(this.#resolve(from), target);
    } catch (error) {
      rethrow(error, from);
    }
  }

  async exists(path: string): Promise<boolean> {
    return (await stat(this.#resolve(path)).catch(() => null)) !== null;
  }

  async stat(path: string): Promise<FileEntry | null> {
    const info = await stat(this.#resolve(path)).catch(() => null);
    if (info === null) return null;
    return {
      path,
      kind: info.isDirectory() ? 'dir' : 'file',
      size: info.size,
      mtime: info.mtimeMs,
    };
  }
}
