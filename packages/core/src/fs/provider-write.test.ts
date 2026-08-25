import { describe, expect, it, vi } from 'vitest';
import { createFileStoreProvider, type FileStoreProviderOptions } from './semantics.js';
import { MemoryFileStore, type MemoryFileSeed } from './memory-store.js';
import { isConflictError, isProviderError } from '../errors.js';
import { splitFrontmatter } from '../frontmatter.js';
import { isGeneratedId } from '../ids.js';
import type { NodeId, TreeNode } from '../model.js';

interface Harness {
  store: MemoryFileStore;
  provider: ReturnType<typeof createFileStoreProvider>;
  at(path: string): Promise<TreeNode>;
  paths(): Promise<string[]>;
}

function harness(seed: MemoryFileSeed, opts: FileStoreProviderOptions = {}): Harness {
  const store = new MemoryFileStore(seed);
  const provider = createFileStoreProvider(store, opts);
  return {
    store,
    provider,
    async at(path) {
      const { nodes } = await provider.getTree();
      const node = nodes.find((candidate) => candidate.path === path);
      if (!node) throw new Error(`no node at ${path}; have ${nodes.map((n) => n.path).join(', ')}`);
      return node;
    },
    async paths() {
      return (await store.list()).filter((entry) => entry.kind === 'file').map((entry) => entry.path);
    },
  };
}

const pathOf = async (provider: Harness['provider'], id: NodeId): Promise<string> => {
  const { nodes } = await provider.getTree();
  return nodes.find((node) => node.id === id)?.path ?? '(gone)';
};

const orderIn = (raw: string): unknown => splitFrontmatter(raw).meta.order;

describe('savePage', () => {
  const seed = {
    'a.md': '---\ntitle: A\nreviewer: "  ada  "\norder: 10\n---\n\n# A\n\nBody.\n',
  };

  it('writes the body, returns the new version and leaves unknown keys and their order alone', async () => {
    const h = harness(seed);
    const node = await h.at('a.md');
    const before = await h.provider.getPage(node.id);

    const result = await h.provider.savePage(node.id, { body: '\n# A\n\nRewritten.\n', baseVersion: before.version });
    expect(result.version).not.toBe(before.version);
    expect(result.updatedAt).toMatch(/^\d{4}-/);

    const raw = await h.store.readText('a.md');
    expect(raw).toContain('reviewer: "  ada  "');
    expect(raw.indexOf('title: A')).toBeLessThan(raw.indexOf('reviewer'));
    expect(raw).toContain('Rewritten.');
    expect(raw).not.toContain('Body.');
    expect(await h.provider.getPage(node.id)).toMatchObject({ version: result.version });
  });

  it('rejects a stale base with the current version attached', async () => {
    const h = harness(seed);
    const node = await h.at('a.md');
    await expect(
      h.provider.savePage(node.id, { body: '# A\n', baseVersion: 'sha256:stale' }),
    ).rejects.toSatisfy((error: unknown) => {
      if (!isConflictError(error)) return false;
      expect(error.currentVersion).toMatch(/^sha256:[0-9a-f]{64}$/);
      return true;
    });
    expect(await h.store.readText('a.md')).toContain('Body.');
  });

  it('writes the id into frontmatter on the first write and keeps it', async () => {
    const h = harness({ 'plain.md': '# Plain\n' });
    const node = await h.at('plain.md');
    expect(node.id.startsWith('h_')).toBe(true);

    await h.provider.savePage(node.id, { body: '# Plain\n\nMore.\n', baseVersion: null });
    expect(await h.store.readText('plain.md')).toContain(`id: ${node.id}`);
    expect((await h.at('plain.md')).id).toBe(node.id);
  });

  it('preserves CRLF', async () => {
    const h = harness({ 'crlf.md': '---\r\ntitle: C\r\n---\r\n\r\n# C\r\n' });
    const node = await h.at('crlf.md');
    await h.provider.savePage(node.id, { body: '\n# C\n\nNext.\n', baseVersion: null });
    const raw = await h.store.readText('crlf.md');
    expect(raw).toContain('\r\n');
    expect(raw.split('\n').every((line) => line === '' || line.endsWith('\r'))).toBe(true);
  });

  it('converts a folder into a page, carrying the folder id and title', async () => {
    const h = harness({ 'archive/old.md': '# Old\n' });
    const folder = await h.at('archive');
    expect(folder.kind).toBe('folder');

    await h.provider.savePage(folder.id, { body: '# Archive\n', baseVersion: null });

    const converted = await h.at('archive/index.md');
    expect(converted.id).toBe(folder.id);
    expect(converted.kind).toBe('page');
    expect(converted.title).toBe('Archive');
    expect(await h.store.readText('archive/index.md')).toContain(`id: ${folder.id}`);
  });

  it('reports a file deleted behind it as not_found', async () => {
    const h = harness(seed);
    const node = await h.at('a.md');
    const { version } = await h.provider.getPage(node.id);
    await h.store.remove('a.md');
    await expect(h.provider.savePage(node.id, { body: 'x', baseVersion: version })).rejects.toSatisfy(
      (error: unknown) => isProviderError(error) && error.code === 'not_found',
    );
  });
});

describe('updateMeta', () => {
  const seed = { 'a.md': '---\ntitle: A\n---\n\n# Heading\n\nBody stays.\n' };

  it('writes title and icon without touching the body', async () => {
    const h = harness(seed);
    const node = await h.at('a.md');
    const updated = await h.provider.updateMeta(node.id, { title: 'Renamed', icon: 'lucide:book-open' });

    expect(updated).toMatchObject({ id: node.id, title: 'Renamed', path: 'a.md' });
    expect(updated.icon).toEqual({ kind: 'lucide', name: 'book-open' });
    const raw = await h.store.readText('a.md');
    expect(raw).toContain('# Heading\n\nBody stays.\n');
    expect(splitFrontmatter(raw).meta).toMatchObject({ title: 'Renamed', icon: 'lucide:book-open' });
  });

  it('clears an icon with an empty string', async () => {
    const h = harness({ 'a.md': '---\ntitle: A\nicon: "\u{1F510}"\n---\n\n# A\n' });
    const node = await h.at('a.md');
    const updated = await h.provider.updateMeta(node.id, { icon: '' });
    expect(updated.icon).toBeUndefined();
    expect(await h.store.readText('a.md')).not.toContain('icon:');
  });

  it('refuses an icon that is neither an emoji nor a lucide name', async () => {
    const h = harness(seed);
    const node = await h.at('a.md');
    await expect(h.provider.updateMeta(node.id, { icon: 'not an icon at all' })).rejects.toSatisfy(
      (error: unknown) => isProviderError(error) && error.code === 'validation',
    );
  });

  it('renames a fresh page to its title when asked, keeping the id', async () => {
    const h = harness({ 'untitled.md': '---\nid: keep-me\ntitle: Untitled\n---\n\n' });
    const node = await h.at('untitled.md');
    const renamed = await h.provider.updateMeta(node.id, { title: 'Auth flow' }, { renameFile: true });
    expect(renamed).toMatchObject({ id: 'keep-me', path: 'auth-flow.md' });
    expect(await h.paths()).toEqual(['auth-flow.md']);
  });

  it('renames the directory of an index page, taking its children along', async () => {
    const h = harness({ 'old/index.md': '---\nid: dir-page\n---\n\n# Old\n', 'old/child.md': '# Child\n' });
    const node = await h.at('old/index.md');
    const renamed = await h.provider.updateMeta(node.id, { title: 'New home' }, { renameFile: true });
    expect(renamed.path).toBe('new-home/index.md');
    expect(await h.paths()).toEqual(['new-home/child.md', 'new-home/index.md']);
  });

  it('suffixes a rename that would collide', async () => {
    const h = harness({ 'untitled.md': '# U\n', 'auth-flow.md': '# Taken\n' });
    const node = await h.at('untitled.md');
    const renamed = await h.provider.updateMeta(node.id, { title: 'Auth flow' }, { renameFile: true });
    expect(renamed.path).toBe('auth-flow-2.md');
  });

  it('rejects a folder and the deferred host-wide rename policy', async () => {
    const h = harness({ 'archive/a.md': '# A\n' });
    const folder = await h.at('archive');
    await expect(h.provider.updateMeta(folder.id, { title: 'X' })).rejects.toSatisfy(
      (error: unknown) => isProviderError(error) && error.code === 'unsupported',
    );

    const policy = harness({ 'a.md': '# A\n' }, { renameFilesOnTitleChange: true });
    const node = await policy.at('a.md');
    await expect(policy.provider.updateMeta(node.id, { title: 'X' })).rejects.toSatisfy(
      (error: unknown) => isProviderError(error) && error.code === 'unsupported',
    );
  });
});

describe('createPage', () => {
  it('writes at the root with a generated id, a title and an empty body', async () => {
    const h = harness({ 'index.md': '# Home\n' });
    const created = await h.provider.createPage({ parentId: null, title: 'Getting started' });

    expect(created.path).toBe('getting-started.md');
    expect(isGeneratedId(created.id)).toBe(true);
    expect(created.title).toBe('Getting started');
    const page = await h.provider.getPage(created.id);
    expect(page.body.trim()).toBe('');
    expect(page.meta).toEqual({ id: created.id, title: 'Getting started' });
  });

  it('writes into a folder', async () => {
    const h = harness({ 'archive/a.md': '# A\n' });
    const folder = await h.at('archive');
    const created = await h.provider.createPage({ parentId: folder.id, title: 'Notes' });
    expect(created.path).toBe('archive/notes.md');
    expect(created.parentId).toBe(folder.id);
  });

  it('writes into the directory a page already owns', async () => {
    const h = harness({ 'guides/index.md': '# Guides\n', 'guides/intro.md': '# Intro\n' });
    const parent = await h.at('guides/index.md');
    const created = await h.provider.createPage({ parentId: parent.id, title: 'Auth' });
    expect(created.path).toBe('guides/auth.md');
  });

  it('converts a leaf parent into a directory, keeping its id', async () => {
    const h = harness({ 'guides.md': '# Guides\n\nIntro text.\n' });
    const parent = await h.at('guides.md');

    const created = await h.provider.createPage({ parentId: parent.id, title: 'Auth' });

    expect(created.path).toBe('guides/auth.md');
    expect(await pathOf(h.provider, parent.id)).toBe('guides/index.md');
    expect(await h.store.readText('guides/index.md')).toContain('Intro text.');
    expect(await h.paths()).toEqual(['guides/auth.md', 'guides/index.md']);
  });

  it('suffixes a slug that is already taken by a page, a directory or an asset', async () => {
    const h = harness({ 'notes.md': '# Taken\n' });
    expect((await h.provider.createPage({ parentId: null, title: 'Notes' })).path).toBe('notes-2.md');

    const dirs = harness({ 'notes/a.md': '# A\n' });
    expect((await dirs.provider.createPage({ parentId: null, title: 'Notes' })).path).toBe('notes-2.md');
  });

  it('falls back to untitled for an empty title', async () => {
    const h = harness({ 'index.md': '# Home\n' });
    const first = await h.provider.createPage({ parentId: null, title: '   ' });
    expect(first).toMatchObject({ path: 'untitled.md', title: 'Untitled' });
    expect((await h.provider.createPage({ parentId: null, title: '' })).path).toBe('untitled-2.md');
  });

  it('writes an order only when the caller places it at an index', async () => {
    const h = harness({
      'index.md': '# Home\n',
      'a.md': '---\norder: 10\n---\n\n# A\n',
      'b.md': '---\norder: 20\n---\n\n# B\n',
    });
    const appended = await h.provider.createPage({ parentId: null, title: 'Appended' });
    expect(orderIn(await h.store.readText(appended.path))).toBeUndefined();

    const between = await h.provider.createPage({ parentId: null, title: 'Between', index: 1 });
    expect(orderIn(await h.store.readText(between.path))).toBe(15);

    const root = await h.at('index.md');
    const children = (await h.provider.getTree()).nodes.filter((node) => node.parentId === root.id);
    expect(children.map((node) => node.path)).toEqual(['a.md', 'between.md', 'b.md', 'appended.md']);
  });
});

describe('movePage', () => {
  const seed = {
    'index.md': '# Home\n',
    'guides/index.md': '---\norder: 10\n---\n\n# Guides\n',
    'guides/a.md': '---\norder: 10\n---\n\n# A\n',
    'guides/b.md': '---\norder: 20\n---\n\n# B\n',
    'specs/index.md': '---\norder: 20\n---\n\n# Specs\n',
  };

  it('moves a leaf between parents, keeping its id and rewriting the path', async () => {
    const h = harness(seed);
    const page = await h.at('guides/a.md');
    const specs = await h.at('specs/index.md');

    const moved = await h.provider.movePage(page.id, { parentId: specs.id, index: 0 });
    expect(moved.id).toBe(page.id);
    expect(moved.path).toBe('specs/a.md');
    expect(moved.parentId).toBe(specs.id);
    expect(await h.paths()).not.toContain('guides/a.md');
    expect(await h.store.readText('specs/a.md')).toContain(`id: ${page.id}`);
  });

  it('moves a page with a directory and takes the subtree with it', async () => {
    const h = harness({ ...seed, 'guides/auth/index.md': '# Auth\n', 'guides/auth/tokens.md': '# Tokens\n' });
    const auth = await h.at('guides/auth/index.md');
    const specs = await h.at('specs/index.md');

    const moved = await h.provider.movePage(auth.id, { parentId: specs.id, index: 0 });
    expect(moved.path).toBe('specs/auth/index.md');
    expect(await h.paths()).toContain('specs/auth/tokens.md');
  });

  it('only rewrites order when the page stays in its own directory', async () => {
    const h = harness(seed);
    const guides = await h.at('guides/index.md');
    const b = await h.at('guides/b.md');
    const moves = vi.spyOn(h.store, 'move');

    const moved = await h.provider.movePage(b.id, { parentId: guides.id, index: 0 });
    expect(moves).not.toHaveBeenCalled();
    expect(moved.path).toBe('guides/b.md');
    expect(orderIn(await h.store.readText('guides/b.md'))).toBe(0);
    expect(guides.childIds.length).toBe(2);
    expect((await h.at('guides/index.md')).childIds.map((id) => id)).toEqual([b.id, (await h.at('guides/a.md')).id]);
  });

  it('renumbers the sibling group when no midpoint is left', async () => {
    const onRenumber = vi.fn();
    const h = harness(
      {
        'index.md': '# Home\n',
        'a.md': '---\norder: 10\n---\n\n# A\n',
        'b.md': '---\norder: 10\n---\n\n# B\n',
        'c.md': '---\norder: 30\n---\n\n# C\n',
      },
      { onRenumber },
    );
    const c = await h.at('c.md');
    await h.provider.movePage(c.id, { parentId: (await h.at('index.md')).id, index: 1 });

    expect(onRenumber).toHaveBeenCalledWith(3);
    expect(orderIn(await h.store.readText('a.md'))).toBe(10);
    expect(orderIn(await h.store.readText('c.md'))).toBe(20);
    expect(orderIn(await h.store.readText('b.md'))).toBe(30);
    expect(await h.store.readText('b.md')).toContain('# B');
  });

  it('refuses a move into its own subtree', async () => {
    const h = harness({ ...seed, 'guides/auth/index.md': '# Auth\n' });
    const guides = await h.at('guides/index.md');
    const auth = await h.at('guides/auth/index.md');

    for (const target of [guides.id, auth.id]) {
      await expect(h.provider.movePage(guides.id, { parentId: target, index: 0 })).rejects.toSatisfy(
        (error: unknown) => isProviderError(error) && error.code === 'validation',
      );
    }
    expect(await h.paths()).toContain('guides/auth/index.md');
  });

  it('converts a leaf target parent before moving into it', async () => {
    const h = harness({ 'index.md': '# Home\n', 'leaf.md': '# Leaf\n', 'other.md': '# Other\n' });
    const leaf = await h.at('leaf.md');
    const other = await h.at('other.md');

    const moved = await h.provider.movePage(other.id, { parentId: leaf.id, index: 0 });
    expect(moved.path).toBe('leaf/other.md');
    expect(await pathOf(h.provider, leaf.id)).toBe('leaf/index.md');
  });

  it('moves a folder without giving it an order', async () => {
    const h = harness({ 'index.md': '# Home\n', 'archive/a.md': '# A\n', 'specs/index.md': '# Specs\n' });
    const folder = await h.at('archive');
    const specs = await h.at('specs/index.md');

    const moved = await h.provider.movePage(folder.id, { parentId: specs.id, index: 0 });
    expect(moved.path).toBe('specs/archive');
    expect(moved.kind).toBe('folder');
    expect(await h.paths()).toEqual(['index.md', 'specs/archive/a.md', 'specs/index.md']);
  });
});

describe('deletePage', () => {
  it('removes a leaf file', async () => {
    const h = harness({ 'index.md': '# Home\n', 'a.md': '# A\n' });
    await h.provider.deletePage((await h.at('a.md')).id);
    expect(await h.paths()).toEqual(['index.md']);
  });

  it('removes the whole subtree of a page that owns a directory', async () => {
    const h = harness({
      'index.md': '# Home\n',
      'guides/index.md': '# Guides\n',
      'guides/a.md': '# A\n',
      'guides/deep/b.md': '# B\n',
    });
    await h.provider.deletePage((await h.at('guides/index.md')).id);
    expect(await h.paths()).toEqual(['index.md']);
  });

  it('removes a folder and everything under it', async () => {
    const h = harness({ 'index.md': '# Home\n', 'archive/a.md': '# A\n' });
    await h.provider.deletePage((await h.at('archive')).id);
    expect(await h.paths()).toEqual(['index.md']);
  });

  it('never deletes the workspace when the root index page is removed', async () => {
    const h = harness({ 'index.md': '# Home\n', 'a.md': '# A\n' });
    await h.provider.deletePage((await h.at('index.md')).id);
    expect(await h.paths()).toEqual(['a.md']);
  });
});

describe('a read-only store', () => {
  it('rejects every write with unsupported and changes nothing', async () => {
    const store = new MemoryFileStore({ 'a.md': '# A\n' }, { readOnly: true });
    const provider = createFileStoreProvider(store);
    const id = (await provider.getTree()).nodes[0]?.id ?? '';

    for (const call of [
      (): Promise<unknown> => provider.savePage(id, { body: '', baseVersion: null }),
      (): Promise<unknown> => provider.updateMeta(id, { title: 'x' }),
      (): Promise<unknown> => provider.createPage({ parentId: null, title: 'x' }),
      (): Promise<unknown> => provider.movePage(id, { parentId: null, index: 0 }),
      (): Promise<unknown> => provider.deletePage(id),
    ]) {
      await expect(call()).rejects.toSatisfy(
        (error: unknown) => isProviderError(error) && error.code === 'unsupported',
      );
    }
    expect(await store.readText('a.md')).toBe('# A\n');
  });
});
