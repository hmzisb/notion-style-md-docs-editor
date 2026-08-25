import { describe, expect, it } from 'vitest';
import { MemoryFileStore } from './memory-store.js';
import { isProviderError } from '../errors.js';

const seed = (): MemoryFileStore =>
  new MemoryFileStore({
    'index.md': '# Home\n',
    'guides/index.md': '# Guides\n',
    'guides/auth.md': '# Auth\n',
    'guides/assets/logo.svg': new Uint8Array([1, 2, 3]),
    '.hidden/secret.md': '# Secret\n',
    'node_modules/pkg/readme.md': '# Vendored\n',
  });

describe('list', () => {
  it('is recursive, synthesises directories and excludes hidden entries', async () => {
    const entries = await seed().list();
    expect(entries.map((entry) => `${entry.kind}:${entry.path}`)).toEqual(
      [
        'file:guides/auth.md',
        'dir:guides/assets',
        'file:guides/assets/logo.svg',
        'file:guides/index.md',
        'dir:guides',
        'file:index.md',
      ].sort(),
    );
  });

  it('reports size in bytes and a monotonic mtime', async () => {
    const store = new MemoryFileStore({ 'a.md': 'héllo' });
    const [entry] = await store.list();
    expect(entry?.size).toBe(6);
    await store.writeText('b.md', 'x');
    const [, second] = await store.list();
    expect(second?.mtime).toBeGreaterThan(entry?.mtime ?? 0);
  });
});

describe('read and write', () => {
  it('round-trips text', async () => {
    const store = seed();
    await store.writeText('guides/new.md', '# New\n');
    expect(await store.readText('guides/new.md')).toBe('# New\n');
  });

  it('reads bytes written as text and text written as bytes', async () => {
    const store = seed();
    expect(await (await store.readBinary('index.md')).text()).toBe('# Home\n');
    await store.writeBinary('bin.md', new TextEncoder().encode('# Bin\n').buffer);
    expect(await store.readText('bin.md')).toBe('# Bin\n');
  });

  it('creates parent directories implicitly', async () => {
    const store = seed();
    await store.writeText('a/b/c/deep.md', 'x');
    expect(await store.exists('a/b/c')).toBe(true);
    expect((await store.stat('a/b'))?.kind).toBe('dir');
  });

  it('reports a missing file as not_found, not undefined', async () => {
    await expect(seed().readText('nope.md')).rejects.toSatisfy(
      (error: unknown) => isProviderError(error) && error.code === 'not_found',
    );
  });
});

describe('remove', () => {
  it('removes a single file', async () => {
    const store = seed();
    await store.remove('guides/auth.md');
    expect(await store.exists('guides/auth.md')).toBe(false);
    expect(await store.exists('guides/index.md')).toBe(true);
  });

  it('is recursive for a directory', async () => {
    const store = seed();
    await store.remove('guides');
    expect(Object.keys(store.toJSON())).toEqual([
      '.hidden/secret.md',
      'index.md',
      'node_modules/pkg/readme.md',
    ]);
  });

  it('rejects a path that holds nothing', async () => {
    await expect(seed().remove('guides/missing')).rejects.toThrow(/No file or directory/);
  });
});

describe('move', () => {
  it('moves a file', async () => {
    const store = seed();
    await store.move('guides/auth.md', 'guides/authentication.md');
    expect(await store.exists('guides/auth.md')).toBe(false);
    expect(await store.readText('guides/authentication.md')).toBe('# Auth\n');
  });

  it('moves a directory with everything under it', async () => {
    const store = seed();
    await store.move('guides', 'docs/guides');
    expect(Object.keys(store.toJSON())).toContain('docs/guides/assets/logo.svg');
    expect(await store.exists('guides')).toBe(false);
  });

  it('refuses a move into its own subtree', async () => {
    await expect(seed().move('guides', 'guides/nested')).rejects.toSatisfy(
      (error: unknown) => isProviderError(error) && error.code === 'validation',
    );
  });

  it('is a no-op when source and target are the same', async () => {
    const store = seed();
    const before = store.toJSON();
    await store.move('index.md', './index.md');
    expect(store.toJSON()).toEqual(before);
  });
});

describe('boundaries', () => {
  it('rejects traversal above the root', async () => {
    await expect(seed().readText('../etc/passwd')).rejects.toSatisfy(
      (error: unknown) => isProviderError(error) && error.code === 'validation',
    );
  });

  it('rejects every write on a read-only store', async () => {
    const store = new MemoryFileStore({ 'a.md': 'x' }, { readOnly: true });
    expect(store.readOnly).toBe(true);
    await expect(store.writeText('a.md', 'y')).rejects.toSatisfy(
      (error: unknown) => isProviderError(error) && error.code === 'forbidden',
    );
    await expect(store.remove('a.md')).rejects.toThrow(/read-only/);
    await expect(store.move('a.md', 'b.md')).rejects.toThrow(/read-only/);
    expect(await store.readText('a.md')).toBe('x');
  });

  it('derives a stable key from the seed and accepts an override', () => {
    expect(new MemoryFileStore({ 'a.md': 'x' }).key).toBe(new MemoryFileStore({ 'a.md': 'y' }).key);
    expect(new MemoryFileStore({ 'a.md': 'x' }).key).not.toBe(
      new MemoryFileStore({ 'b.md': 'x' }).key,
    );
    expect(new MemoryFileStore({}, { key: 'memory:demo' }).key).toBe('memory:demo');
  });
});

describe('watch', () => {
  it('reports written, removed and moved paths until unsubscribed', async () => {
    const store = seed();
    const seen: string[][] = [];
    const stop = store.watch((paths) => seen.push(paths));
    await store.writeText('new.md', 'x');
    await store.move('new.md', 'moved.md');
    await store.remove('moved.md');
    stop();
    await store.writeText('after.md', 'x');
    expect(seen).toEqual([['new.md'], ['new.md', 'moved.md'], ['moved.md']]);
  });
});
