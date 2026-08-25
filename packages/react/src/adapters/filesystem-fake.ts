/**
 * An in-memory `FileSystemDirectoryHandle` (docs/09 P1-T09). jsdom has no File System Access
 * API and OPFS only exists in a real browser, so the adapter's unit tests and the provider
 * conformance suite run against this: one flat map of paths to bytes, exposed as the handle
 * tree the web API hands out.
 *
 * `move` is optional because it is: Chromium renames atomically and the rest of the world
 * does not, and the store has to be right on both.
 */

export interface FakeDirectoryOptions {
  /** Whether file handles carry `move`, which is what selects the temp-and-rename write. */
  move?: boolean;
}

interface FakeFile {
  data: Uint8Array;
  mtime: number;
}

/** Strictly increasing, so two writes in the same millisecond still look different. */
let clock = 0;
const tick = (): number => (clock = Math.max(Date.now(), clock + 1));

const encoder = new TextEncoder();

class FakeFs {
  files = new Map<string, FakeFile>();
  dirs = new Set<string>();
  readonly move: boolean;

  constructor(seed: Record<string, string | Uint8Array>, move: boolean) {
    this.move = move;
    for (const [path, data] of Object.entries(seed)) {
      this.write(path, typeof data === 'string' ? encoder.encode(data) : data);
    }
  }

  write(path: string, data: Uint8Array): void {
    this.files.set(path, { data, mtime: tick() });
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) this.dirs.add(parts.slice(0, i).join('/'));
  }

  /** Immediate children of `prefix`, as the handle API lists them: names, not paths. */
  children(prefix: string): Map<string, 'file' | 'directory'> {
    const out = new Map<string, 'file' | 'directory'>();
    const head = prefix === '' ? '' : `${prefix}/`;
    for (const path of this.files.keys()) {
      if (!path.startsWith(head)) continue;
      const rest = path.slice(head.length);
      const at = rest.indexOf('/');
      out.set(at === -1 ? rest : rest.slice(0, at), at === -1 ? 'file' : 'directory');
    }
    for (const dir of this.dirs) {
      if (!dir.startsWith(head)) continue;
      const rest = dir.slice(head.length);
      if (rest !== '' && !rest.includes('/')) out.set(rest, 'directory');
    }
    return out;
  }

  removeTree(path: string): void {
    const prefix = `${path}/`;
    for (const key of [...this.files.keys()]) {
      if (key === path || key.startsWith(prefix)) this.files.delete(key);
    }
    for (const key of [...this.dirs]) {
      if (key === path || key.startsWith(prefix)) this.dirs.delete(key);
    }
  }
}

/** The DOMException names the store maps onto provider error codes. */
function fail(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

class FakeFileHandle {
  readonly kind = 'file';
  readonly name: string;
  #fs: FakeFs;
  #path: string;

  constructor(fs: FakeFs, path: string) {
    this.#fs = fs;
    this.#path = path;
    this.name = path.slice(path.lastIndexOf('/') + 1);
    if (fs.move) {
      Object.defineProperty(this, 'move', {
        value: (parent: FakeDirectoryHandle, name: string): Promise<void> => {
          const file = fs.files.get(this.#path);
          if (file === undefined) throw fail('NotFoundError', `No file at ${this.#path}`);
          fs.files.delete(this.#path);
          this.#path = parent.pathOf(name);
          fs.write(this.#path, file.data);
          return Promise.resolve();
        },
      });
    }
  }

  getFile(): Promise<File> {
    const file = this.#fs.files.get(this.#path);
    if (file === undefined) throw fail('NotFoundError', `No file at ${this.#path}`);
    return Promise.resolve(
      new File([file.data as BlobPart], this.name, { lastModified: file.mtime }),
    );
  }

  createWritable(): Promise<{
    write: (data: unknown) => Promise<void>;
    close: () => Promise<void>;
    abort: () => Promise<void>;
  }> {
    const chunks: BlobPart[] = [];
    return Promise.resolve({
      write: (data: unknown): Promise<void> => {
        chunks.push(data as BlobPart);
        return Promise.resolve();
      },
      close: async (): Promise<void> => {
        const blob = new Blob(chunks);
        this.#fs.write(this.#path, new Uint8Array(await blob.arrayBuffer()));
      },
      abort: (): Promise<void> => Promise.resolve(),
    });
  }

  isSameEntry(other: { name: string }): Promise<boolean> {
    return Promise.resolve(other instanceof FakeFileHandle && other.#path === this.#path);
  }
}

class FakeDirectoryHandle {
  readonly kind = 'directory';
  readonly name: string;
  #fs: FakeFs;
  #path: string;

  constructor(fs: FakeFs, path: string) {
    this.#fs = fs;
    this.#path = path;
    this.name = path === '' ? 'fake' : path.slice(path.lastIndexOf('/') + 1);
  }

  pathOf(name: string): string {
    return this.#path === '' ? name : `${this.#path}/${name}`;
  }

  getFileHandle(name: string, options?: { create?: boolean }): Promise<FakeFileHandle> {
    const path = this.pathOf(name);
    if (!this.#fs.files.has(path)) {
      if (options?.create !== true) throw fail('NotFoundError', `No file at ${path}`);
      this.#fs.write(path, new Uint8Array());
    }
    return Promise.resolve(new FakeFileHandle(this.#fs, path));
  }

  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FakeDirectoryHandle> {
    const path = this.pathOf(name);
    if (this.#fs.files.has(path)) throw fail('TypeMismatchError', `${path} is a file`);
    if (!this.#fs.dirs.has(path)) {
      if (options?.create !== true) throw fail('NotFoundError', `No directory at ${path}`);
      this.#fs.dirs.add(path);
    }
    return Promise.resolve(new FakeDirectoryHandle(this.#fs, path));
  }

  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
    const path = this.pathOf(name);
    const isDir = this.#fs.dirs.has(path);
    if (!this.#fs.files.has(path) && !isDir) {
      throw fail('NotFoundError', `No entry at ${path}`);
    }
    if (isDir && options?.recursive !== true && this.#fs.children(path).size > 0) {
      throw fail('InvalidModificationError', `${path} is not empty`);
    }
    this.#fs.removeTree(path);
    return Promise.resolve();
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- the API is async; the fake is not.
  async *entries(): AsyncGenerator<[string, FakeFileHandle | FakeDirectoryHandle]> {
    for (const [name, kind] of this.#fs.children(this.#path)) {
      yield [
        name,
        kind === 'file'
          ? new FakeFileHandle(this.#fs, this.pathOf(name))
          : new FakeDirectoryHandle(this.#fs, this.pathOf(name)),
      ];
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- same: an async shape over a Map.
  async *keys(): AsyncGenerator<string> {
    for (const name of this.#fs.children(this.#path).keys()) yield name;
  }

  async *values(): AsyncGenerator<FakeFileHandle | FakeDirectoryHandle> {
    for await (const [, handle] of this.entries()) yield handle;
  }

  isSameEntry(other: { name: string }): Promise<boolean> {
    return Promise.resolve(other instanceof FakeDirectoryHandle && other.#path === this.#path);
  }
}

/**
 * The cast is the point of the fake: it implements the slice of the API the adapter uses, and
 * the adapter is typed against the real `FileSystemDirectoryHandle`, so any call it grows that
 * this does not answer fails loudly in these tests.
 */
export function createFakeDirectory(
  seed: Record<string, string | Uint8Array> = {},
  opts: FakeDirectoryOptions = {},
): FileSystemDirectoryHandle {
  const fs = new FakeFs(seed, opts.move ?? true);
  return new FakeDirectoryHandle(fs, '') as unknown as FileSystemDirectoryHandle;
}
