import { describe, expect, it } from 'vitest';
import { buildSnapshotFromEntries, firstH1, type PageInfo } from './walk.js';
import { MemoryFileStore } from './memory-store.js';
import { splitFrontmatter } from '../frontmatter.js';
import { buildIndex } from '../tree.js';
import { loadCorpus } from '../testing/fixtures.js';
import type { FileEntry } from '../provider.js';
import type { TreeIndex, TreeNode } from '../model.js';

const corpus = await loadCorpus();

function readPageInfo(store: MemoryFileStore): (path: string) => Promise<PageInfo> {
  return async (path) => {
    const split = splitFrontmatter(await store.readText(path));
    return { meta: split.meta, firstH1: firstH1(split.body) ?? undefined };
  };
}

async function walkStore(
  store: MemoryFileStore,
): Promise<{ index: TreeIndex; warnings: string[] }> {
  const { snapshot, warnings } = await buildSnapshotFromEntries(
    await store.list(),
    readPageInfo(store),
  );
  return { index: buildIndex(snapshot), warnings: warnings.map((w) => `${w.code}:${w.path}`) };
}

// Pages and assets only: `rules/*.md` are codec goldens, not part of the walked tree.
const corpusStore = new MemoryFileStore({
  ...Object.fromEntries(corpus.manifest.pages.map((page) => [page.path, corpus.read(page.path)])),
  ...Object.fromEntries(corpus.assets),
  '.hidden/secret.md': '# Secret\n',
  'node_modules/pkg/readme.md': '# Vendored\n',
});
const { index: corpusIndex, warnings: corpusWarnings } = await walkStore(corpusStore);
const nodeAt = (path: string): TreeNode | undefined => {
  const id = corpusIndex.idByPath[path];
  return id === undefined ? undefined : corpusIndex.byId[id];
};

describe('firstH1', () => {
  it('finds a top-level heading and trims it', () => {
    expect(firstH1('# Title  \n\nBody\n')).toBe('Title');
    expect(firstH1('Intro\n\n#  Spaced  \n')).toBe('Spaced');
  });

  it('ignores deeper headings, hashtags and fenced code', () => {
    expect(firstH1('## Sub\n\nText\n')).toBeNull();
    expect(firstH1('#NotAHeading\n')).toBeNull();
    expect(firstH1('```\n# In code\n```\n\n# Real\n')).toBe('Real');
    expect(firstH1('~~~md\n# In code\n~~~\n')).toBeNull();
  });
});

describe('walking the corpus', () => {
  it('produces exactly the nodes the manifest declares', () => {
    const { pages, folders } = corpus.manifest;
    expect(Object.keys(corpusIndex.byId).length).toBe(pages.length + folders.length);
    expect(corpusWarnings).toEqual([]);
  });

  it('never makes a node from a hidden entry, a vendored file or an asset', () => {
    for (const path of [...corpus.manifest.ignored, ...corpus.manifest.assets]) {
      expect(nodeAt(path)).toBeUndefined();
    }
  });

  it('has one root, the root index page', () => {
    expect(corpusIndex.rootIds.length).toBe(1);
    expect(nodeAt('index.md')?.id).toBe(corpusIndex.rootIds[0]);
  });

  for (const page of corpus.manifest.pages) {
    it(`maps ${page.path}`, () => {
      const node = nodeAt(page.path);
      expect(node).toBeDefined();
      expect(node?.kind).toBe('page');
      expect(node?.title).toBe(page.title);
      expect(node?.icon ?? null).toEqual(page.icon);
      const parent =
        node?.parentId === null || node?.parentId === undefined
          ? null
          : (corpusIndex.byId[node.parentId]?.path ?? null);
      expect(parent).toBe(page.parentPath);
    });
  }

  for (const folder of corpus.manifest.folders) {
    it(`maps ${folder.path} as a folder`, () => {
      const node = nodeAt(folder.path);
      expect(node?.kind).toBe('folder');
      expect(node?.title).toBe(folder.title);
      expect(node?.id.startsWith('f_')).toBe(true);
    });
  }

  it('registers all three path forms for an index page and two for a leaf', () => {
    const billing = nodeAt('guides/billing/README.md')?.id;
    expect(corpusIndex.idByPath['guides/billing']).toBe(billing);
    expect(corpusIndex.idByPath['guides/billing/']).toBe(billing);

    const auth = nodeAt('guides/auth/tokens.md')?.id;
    expect(corpusIndex.idByPath['guides/auth/tokens']).toBe(auth);
    expect(corpusIndex.idByPath['guides/auth/tokens/']).toBeUndefined();
  });

  it('orders siblings by order first, then natural name, folders last', () => {
    const childPaths = (path: string): (string | undefined)[] =>
      (nodeAt(path)?.childIds ?? []).map((id) => corpusIndex.byId[id]?.path);

    expect(childPaths('index.md')).toEqual([
      'product/index.md',
      'guides/index.md',
      'specs/index.md',
      'decisions/index.md',
      'meeting-notes/index.md',
      'archive',
    ]);
    expect(childPaths('guides/index.md')).toEqual([
      'guides/getting-started.md',
      'guides/auth/index.md',
      'guides/billing/README.md',
      'guides/api/index.md',
    ]);
    expect(childPaths('guides/api/rest/index.md')).toEqual([
      'guides/api/rest/errors.md',
      'guides/api/rest/pagination.md',
      'guides/api/rest/rate limits.md',
    ]);
    expect(childPaths('specs/index.md')).toEqual([
      'specs/import-export.md',
      'specs/large-page.md',
      'specs/legacy-notes.md',
      'specs/search.md',
    ]);
  });

  it('leaves no orphan and no duplicate id', () => {
    const ids = Object.keys(corpusIndex.byId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const node of Object.values(corpusIndex.byId)) {
      if (node.parentId === null) continue;
      expect(corpusIndex.byId[node.parentId]).toBeDefined();
      expect(corpusIndex.byId[node.parentId]?.childIds).toContain(node.id);
    }
  });

  it('takes the id from frontmatter when the author set one', () => {
    expect(nodeAt('index.md')?.id).toBe('h_corpus_root');
  });
});

describe('snapshot version', () => {
  const entries: FileEntry[] = [
    { path: 'index.md', kind: 'file' },
    { path: 'a.md', kind: 'file' },
  ];
  const build = (title: string): Promise<string> =>
    buildSnapshotFromEntries(entries, (path) =>
      Promise.resolve({ meta: path === 'a.md' ? { title } : { title: 'Home' } }),
    ).then((result) => result.snapshot.version);

  it('is stable for the same tree and moves when a title changes', async () => {
    expect(await build('A')).toBe(await build('A'));
    expect(await build('A')).not.toBe(await build('B'));
  });
});

describe('mapping rules', () => {
  const walk = async (files: Record<string, string>): Promise<TreeIndex> =>
    (await walkStore(new MemoryFileStore(files))).index;

  it('makes a folder node for a directory with no index or README', async () => {
    const index = await walk({ 'archive/a.md': '# A\n' });
    const folder = index.byId[index.idByPath.archive ?? ''];
    expect(folder?.kind).toBe('folder');
    expect(folder?.title).toBe('Archive');
    expect(index.rootIds.length).toBe(1);
  });

  it('prefers index.md over README.md when both are present', async () => {
    const index = await walk({ 'g/index.md': '# Index\n', 'g/README.md': '# Readme\n' });
    const owner = index.byId[index.idByPath.g ?? ''];
    expect(owner?.path).toBe('g/index.md');
    expect(owner?.childIds.map((id) => index.byId[id]?.path)).toEqual(['g/README.md']);
  });

  it('makes every root entry a root when there is no root index page', async () => {
    const index = await walk({ 'a.md': '# A\n', 'b/index.md': '# B\n' });
    expect(index.rootIds.map((id) => index.byId[id]?.path).sort()).toEqual(['a.md', 'b/index.md']);
  });

  it('falls back from frontmatter title to the H1 to the humanised stem', async () => {
    const index = await walk({
      'a.md': '---\ntitle: From frontmatter\n---\n\n# From heading\n',
      'b.md': '# From heading\n',
      'meeting_notes-2.md': 'No heading here.\n',
      'dir/index.md': 'No heading here either.\n',
    });
    const title = (path: string): string | undefined =>
      index.byId[index.idByPath[path] ?? '']?.title;
    expect(title('a.md')).toBe('From frontmatter');
    expect(title('b.md')).toBe('From heading');
    expect(title('meeting_notes-2.md')).toBe('Meeting notes 2');
    expect(title('dir/index.md')).toBe('Dir');
  });

  it('gives the first file in walk order a duplicate id and hashes the rest', async () => {
    const store = new MemoryFileStore({
      'a.md': '---\nid: dup\norder: 1\n---\n\n# A\n',
      'b.md': '---\nid: dup\norder: 2\n---\n\n# B\n',
    });
    const { index, warnings } = await walkStore(store);
    expect(index.idByPath['a.md']).toBe('dup');
    expect(index.idByPath['b.md']).toMatch(/^h_[0-9a-f]{16}$/);
    expect(warnings).toEqual(['duplicate_id:b.md']);
  });

  it('ignores hidden entries even when the listing includes them', async () => {
    const { snapshot } = await buildSnapshotFromEntries(
      [
        { path: '.git/config.md', kind: 'file' },
        { path: 'node_modules/x/a.md', kind: 'file' },
        { path: 'keep.md', kind: 'file' },
      ],
      () => Promise.resolve({ meta: {} }),
    );
    expect(snapshot.nodes.map((node) => node.path)).toEqual(['keep.md']);
  });

  it('leaves a directory with no Markdown beneath it out of the tree', async () => {
    const { snapshot } = await buildSnapshotFromEntries(
      [
        { path: 'assets', kind: 'dir' },
        { path: 'assets/logo.svg', kind: 'file' },
        { path: 'full', kind: 'dir' },
        { path: 'full/a.md', kind: 'file' },
      ],
      () => Promise.resolve({ meta: {} }),
    );
    expect(snapshot.nodes.map((node) => node.path).sort()).toEqual(['full', 'full/a.md']);
  });
});
