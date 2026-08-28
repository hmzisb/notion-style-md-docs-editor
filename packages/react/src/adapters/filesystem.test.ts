import 'fake-indexeddb/auto';
import { isProviderError } from '@hmzisb/notion-docs-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDirectory } from './filesystem-fake.js';
import { FileSystemDirectoryStore } from './filesystem-store.js';
import {
  createFileSystemProvider,
  exportToDirectory,
  getOpfsRoot,
  importFromDirectory,
} from './filesystem.js';

const page = (title: string, body = `# ${title}\n`): string =>
  `---\ntitle: ${title}\n---\n\n${body}`;

const seed = {
  'index.md': page('Home'),
  'guides/index.md': page('Guides'),
  'guides/auth.md': page('Auth'),
  'assets/logo.svg': '<svg />',
  '.git/config': 'secret',
  'node_modules/pkg/readme.md': page('Nope'),
};

const paths = (entries: { path: string; kind: string }[], kind = 'file'): string[] =>
  entries.filter((entry) => entry.kind === kind).map((entry) => entry.path);

/** The index cache saves on a debounce; this is how a test waits for the write to land. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 320));

describe('FileSystemDirectoryStore', () => {
  it('lists every file recursively and derives the folders from their paths', async () => {
    const store = new FileSystemDirectoryStore(createFakeDirectory(seed));
    const entries = await store.list();

    expect(paths(entries)).toEqual([
      'assets/logo.svg',
      'guides/auth.md',
      'guides/index.md',
      'index.md',
    ]);
    expect(paths(entries, 'dir')).toEqual(['assets', 'guides']);
  });

  it('reads text, and binary as a File the object URL can type itself from', async () => {
    const store = new FileSystemDirectoryStore(createFakeDirectory(seed));

    await expect(store.readText('index.md')).resolves.toBe(seed['index.md']);
    const blob = await store.readBinary('assets/logo.svg');
    expect(blob).toBeInstanceOf(File);
    expect(await blob.text()).toBe('<svg />');
  });

  it('rejects a path that climbs out of the root', async () => {
    const store = new FileSystemDirectoryStore(createFakeDirectory(seed));
    const error = await store.readText('../../etc/passwd').catch((e: unknown) => e);
    expect(isProviderError(error) && error.code).toBe('validation');
  });

  it('reports not_found for a missing file and for a missing removal', async () => {
    const store = new FileSystemDirectoryStore(createFakeDirectory(seed));

    const read = await store.readText('nope.md').catch((e: unknown) => e);
    expect(isProviderError(read) && read.code).toBe('not_found');
    const removed = await store.remove('nope.md').catch((e: unknown) => e);
    expect(isProviderError(removed) && removed.code).toBe('not_found');
  });

  it('creates the parent directories a write needs', async () => {
    const store = new FileSystemDirectoryStore(createFakeDirectory(seed));
    await store.writeText('a/b/c/deep.md', page('Deep'));

    await expect(store.readText('a/b/c/deep.md')).resolves.toContain('Deep');
    expect(paths(await store.list(), 'dir')).toContain('a/b/c');
  });

  describe.each([
    { label: 'with a native rename', move: true },
    { label: 'without one', move: false },
  ])('writing $label', ({ move }) => {
    it('replaces the file and leaves no temp file in the listing', async () => {
      const store = new FileSystemDirectoryStore(createFakeDirectory(seed, { move }));
      await store.writeText('index.md', page('Renamed'));

      await expect(store.readText('index.md')).resolves.toContain('Renamed');
      expect(paths(await store.list())).toEqual([
        'assets/logo.svg',
        'guides/auth.md',
        'guides/index.md',
        'index.md',
      ]);
    });
  });

  it('removes a directory with everything under it', async () => {
    const store = new FileSystemDirectoryStore(createFakeDirectory(seed));
    await store.remove('guides');

    expect(paths(await store.list())).toEqual(['assets/logo.svg', 'index.md']);
    await expect(store.exists('guides')).resolves.toBe(false);
  });

  it('moves a file, and a directory by copying it across', async () => {
    const store = new FileSystemDirectoryStore(createFakeDirectory(seed));

    await store.move('index.md', 'archive/index.md');
    await expect(store.readText('archive/index.md')).resolves.toContain('Home');
    await expect(store.exists('index.md')).resolves.toBe(false);

    await store.move('guides', 'archive/guides');
    expect(paths(await store.list())).toEqual([
      'archive/guides/auth.md',
      'archive/guides/index.md',
      'archive/index.md',
      'assets/logo.svg',
    ]);
  });

  it('refuses to move a directory into its own subtree', async () => {
    const store = new FileSystemDirectoryStore(createFakeDirectory(seed));
    const error = await store.move('guides', 'guides/deeper').catch((e: unknown) => e);
    expect(isProviderError(error) && error.code).toBe('validation');
  });

  it('stats a file and a directory, and nothing else', async () => {
    const store = new FileSystemDirectoryStore(createFakeDirectory(seed));

    expect(await store.stat('index.md')).toMatchObject({
      kind: 'file',
      size: seed['index.md'].length,
    });
    expect(await store.stat('guides')).toMatchObject({ kind: 'dir' });
    expect(await store.stat('gone.md')).toBeNull();
  });

  it('refuses every write when the host opened the folder read-only', async () => {
    const store = new FileSystemDirectoryStore(createFakeDirectory(seed), { readOnly: true });
    const error = await store.writeText('index.md', 'x').catch((e: unknown) => e);
    expect(isProviderError(error) && error.code).toBe('forbidden');
  });

  it('offers no watch until the host asks for one, then polls for outside edits', async () => {
    const dir = createFakeDirectory(seed);
    expect(new FileSystemDirectoryStore(dir).watch).toBeUndefined();

    const store = new FileSystemDirectoryStore(dir, { watch: true, pollIntervalMs: 5 });
    await store.list();
    const seen: string[][] = [];
    const stop = store.watch?.((changed) => seen.push(changed));

    await new FileSystemDirectoryStore(dir).writeText('outside.md', page('Outside'));
    await vi.waitFor(() => {
      expect(seen.flat()).toContain('outside.md');
    });
    stop?.();
  });
});

describe('createFileSystemProvider', () => {
  it('serves the tree the shared semantics build, over a directory handle', async () => {
    const provider = createFileSystemProvider(createFakeDirectory(seed), { title: 'Folder' });

    const snapshot = await provider.getTree();
    // No `assets` node: a directory with no page under it is not part of the tree.
    expect(snapshot.nodes.map((node) => node.path)).toEqual([
      'index.md',
      'guides/index.md',
      'guides/auth.md',
    ]);
    await expect(provider.getMeta()).resolves.toMatchObject({ title: 'Folder' });
    expect(provider.capabilities).toMatchObject({ write: true, subscribe: false });
  });

  it('advertises subscribe only when the host asked the folder to be watched', () => {
    const provider = createFileSystemProvider(createFakeDirectory(seed), { watch: true });
    expect(provider.capabilities.subscribe).toBe(true);
    provider.dispose?.();
  });

  describe('index cache (docs/03 section 4.11)', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('re-reads only the files that changed since the last run', async () => {
      const dir = createFakeDirectory(seed, { move: false });
      const first = createFileSystemProvider(dir, { key: 'cached', indexCache: true });
      await first.getTree();
      await settle();

      const reads = vi.spyOn(FileSystemDirectoryStore.prototype, 'readText');
      const second = createFileSystemProvider(dir, { key: 'cached', indexCache: true });
      expect((await second.getTree()).nodes).toHaveLength(3);
      expect(reads).not.toHaveBeenCalled();

      await new FileSystemDirectoryStore(dir).writeText('guides/auth.md', page('Renamed'));
      const third = createFileSystemProvider(dir, { key: 'cached', indexCache: true });
      const titles = (await third.getTree()).nodes.map((node) => node.title);
      expect(titles).toContain('Renamed');
      expect(reads.mock.calls.map(([path]) => path)).toEqual(['guides/auth.md']);
    });

    it('forgets a file that was deleted while the app was closed', async () => {
      const dir = createFakeDirectory(seed);
      await createFileSystemProvider(dir, { key: 'pruned', indexCache: true }).getTree();
      await settle();

      await new FileSystemDirectoryStore(dir).remove('guides/auth.md');
      const next = createFileSystemProvider(dir, { key: 'pruned', indexCache: true });
      expect((await next.getTree()).nodes.map((node) => node.path)).not.toContain('guides/auth.md');
    });

    it('counts the pages of a cold build for the indexing message', async () => {
      const onProgress = vi.fn();
      const provider = createFileSystemProvider(createFakeDirectory(seed), {
        key: 'progress',
        indexCache: true,
        onProgress,
      });
      await provider.getTree();

      expect(onProgress.mock.calls.flat()).toEqual([
        { done: 1, total: 3 },
        { done: 2, total: 3 },
        { done: 3, total: 3 },
      ]);
    });
  });
});

describe('OPFS and directory copies (docs/08 section 7)', () => {
  it('explains itself where the origin private file system does not exist', async () => {
    const error = await getOpfsRoot('workspace').catch((e: unknown) => e);
    expect(isProviderError(error) && error.code).toBe('unsupported');
  });

  it('creates the subdirectory it is asked for', async () => {
    const root = createFakeDirectory();
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { getDirectory: () => Promise.resolve(root) },
    });

    const dir = await getOpfsRoot('workspace/docs');
    await new FileSystemDirectoryStore(dir).writeText('a.md', page('A'));
    expect(paths(await new FileSystemDirectoryStore(root).list())).toEqual(['workspace/docs/a.md']);
    Reflect.deleteProperty(navigator, 'storage');
  });

  it('copies a workspace out, skipping what the listing skips', async () => {
    const to = createFakeDirectory();
    await exportToDirectory(createFakeDirectory(seed), to);

    expect(paths(await new FileSystemDirectoryStore(to).list())).toEqual([
      'assets/logo.svg',
      'guides/auth.md',
      'guides/index.md',
      'index.md',
    ]);
  });

  it('imports over a workspace, replacing it when asked to clear', async () => {
    const to = createFakeDirectory({ 'old.md': page('Old'), 'guides/gone.md': page('Gone') });
    await importFromDirectory(createFakeDirectory(seed), to, { clear: true });

    expect(paths(await new FileSystemDirectoryStore(to).list())).toEqual([
      'assets/logo.svg',
      'guides/auth.md',
      'guides/index.md',
      'index.md',
    ]);
  });

  it('merges into a workspace when it is not', async () => {
    const to = createFakeDirectory({ 'old.md': page('Old') });
    await importFromDirectory(createFakeDirectory(seed), to);

    expect(paths(await new FileSystemDirectoryStore(to).list())).toContain('old.md');
  });
});
