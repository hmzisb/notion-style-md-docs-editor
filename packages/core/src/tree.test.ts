import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { NodeId, TreeIndex, TreeNode, TreeSnapshot } from './model.js';
import {
  ancestorsOf,
  applyInsert,
  applyMeta,
  applyMove,
  applyRemove,
  applyRename,
  buildIndex,
  childIdsOf,
  descendantCount,
  dirFormOf,
  flatten,
  isDescendant,
  isIndexPath,
  pathAliases,
  subtreeIds,
} from './tree.js';

function page(id: string, path: string, parentId: string | null, childIds: string[] = []): TreeNode {
  return { id, kind: 'page', title: id.toUpperCase(), path, parentId, childIds };
}

/**
 *  a ── b ── d
 *   └── c
 *  e (folder) ── f
 */
const SNAPSHOT: TreeSnapshot = {
  version: 'v1',
  nodes: [
    page('a', 'a.md', null, ['b', 'c']),
    page('b', 'a/b.md', 'a', ['d']),
    page('c', 'a/c.md', 'a'),
    page('d', 'a/b/d.md', 'b'),
    { id: 'e', kind: 'folder', title: 'E', path: 'e', parentId: null, childIds: ['f'] },
    page('f', 'e/f.md', 'e'),
  ],
};

const index = buildIndex(SNAPSHOT);

describe('dirFormOf', () => {
  it('maps page paths to their directory form', () => {
    expect(dirFormOf('guides/auth/index.md')).toBe('guides/auth');
    expect(dirFormOf('a/b.md')).toBe('a/b');
    expect(dirFormOf('index.md')).toBe('');
    expect(dirFormOf('assets/logo.png')).toBeNull();
  });
});

describe('buildIndex', () => {
  it('finds roots from unclaimed nodes', () => {
    expect(index.rootIds).toEqual(['a', 'e']);
  });

  it('maps both the file path and the directory form', () => {
    expect(index.idByPath['a/b.md']).toBe('b');
    expect(index.idByPath['a/b']).toBe('b');
  });

  it('lets a folder node keep its own path against a page alias', () => {
    const withIndexPage = buildIndex({
      version: 'v',
      nodes: [
        { id: 'dir', kind: 'folder', title: 'Dir', path: 'guides', parentId: null, childIds: [] },
        page('idx', 'guides/index.md', null),
      ],
    });
    expect(withIndexPage.idByPath.guides).toBe('dir');
    expect(withIndexPage.idByPath['guides/index.md']).toBe('idx');
  });

  it('keeps an orphan reachable as a root instead of dropping it', () => {
    const orphaned = buildIndex({ version: 'v', nodes: [page('x', 'x.md', 'missing')] });
    expect(orphaned.rootIds).toEqual(['x']);
  });
});

describe('lookups', () => {
  it('lists ancestors root first', () => {
    expect(ancestorsOf(index, 'd')).toEqual(['a', 'b']);
    expect(ancestorsOf(index, 'a')).toEqual([]);
  });

  it('answers descendancy without counting a node as its own descendant', () => {
    expect(isDescendant(index, 'd', 'a')).toBe(true);
    expect(isDescendant(index, 'a', 'd')).toBe(false);
    expect(isDescendant(index, 'a', 'a')).toBe(false);
  });

  it('counts descendants', () => {
    expect(descendantCount(index, 'a')).toBe(3);
    expect(descendantCount(index, 'b')).toBe(1);
    expect(descendantCount(index, 'c')).toBe(0);
  });

  it('flattens depth first in display order', () => {
    expect(flatten(index)).toEqual(['a', 'b', 'd', 'c', 'e', 'f']);
  });

  it('returns roots for a null parent', () => {
    expect(childIdsOf(index, null)).toEqual(['a', 'e']);
    expect(childIdsOf(index, 'a')).toEqual(['b', 'c']);
  });
});

describe('apply* immutability', () => {
  it('shares untouched nodes on rename', () => {
    const next = applyRename(index, 'b', 'Renamed');
    expect(next.byId.b?.title).toBe('Renamed');
    expect(index.byId.b?.title).toBe('B');
    expect(next.byId.c).toBe(index.byId.c);
    expect(next.byId.a).toBe(index.byId.a);
    expect(next.version).not.toBe(index.version);
  });

  it('returns the same index when a rename changes nothing', () => {
    expect(applyRename(index, 'b', 'B')).toBe(index);
    expect(applyRename(index, 'missing', 'X')).toBe(index);
  });

  it('remaps idByPath when applyMeta changes the path', () => {
    const next = applyMeta(index, 'b', { path: 'a/renamed.md' });
    expect(next.idByPath['a/renamed.md']).toBe('b');
    expect(next.idByPath['a/renamed']).toBe('b');
    expect(next.idByPath['a/b.md']).toBeUndefined();
    expect(next.idByPath['a/b']).toBeUndefined();
  });

  it('ignores structural fields in applyMeta', () => {
    const next = applyMeta(index, 'b', { parentId: 'e', childIds: [], id: 'zzz' });
    expect(next.byId.b?.parentId).toBe('a');
    expect(next.byId.b?.childIds).toEqual(['d']);
    expect(next.byId.zzz).toBeUndefined();
  });

  it('removes an icon when the patch sets it to undefined', () => {
    const withIcon = applyMeta(index, 'b', { icon: { kind: 'emoji', value: '🧠' } });
    expect(withIcon.byId.b?.icon).toEqual({ kind: 'emoji', value: '🧠' });
    const cleared = applyMeta(withIcon, 'b', { icon: undefined });
    expect('icon' in (cleared.byId.b ?? {})).toBe(false);
  });
});

describe('applyInsert', () => {
  it('inserts at an index under a parent', () => {
    const next = applyInsert(index, page('g', 'a/g.md', 'a'), 'a', 1);
    expect(next.byId.a?.childIds).toEqual(['b', 'g', 'c']);
    expect(next.idByPath['a/g']).toBe('g');
  });

  it('clamps an out of range index', () => {
    expect(applyInsert(index, page('g', 'a/g.md', 'a'), 'a', 99).byId.a?.childIds).toEqual([
      'b',
      'c',
      'g',
    ]);
    expect(applyInsert(index, page('g', 'a/g.md', 'a'), 'a', -5).byId.a?.childIds).toEqual([
      'g',
      'b',
      'c',
    ]);
  });

  it('inserts at root when the parent is null', () => {
    expect(applyInsert(index, page('g', 'g.md', null), null, 0).rootIds).toEqual(['g', 'a', 'e']);
  });

  it('refuses a duplicate id or an unknown parent', () => {
    expect(applyInsert(index, page('b', 'x.md', 'a'), 'a', 0)).toBe(index);
    expect(applyInsert(index, page('g', 'x.md', 'nope'), 'nope', 0)).toBe(index);
  });
});

describe('applyMove', () => {
  it('detaches and re-attaches, keeping both edges consistent', () => {
    const next = applyMove(index, 'c', 'b', 0);
    expect(next.byId.a?.childIds).toEqual(['b']);
    expect(next.byId.b?.childIds).toEqual(['c', 'd']);
    expect(next.byId.c?.parentId).toBe('b');
  });

  it('reorders inside the same parent', () => {
    expect(applyMove(index, 'c', 'a', 0).byId.a?.childIds).toEqual(['c', 'b']);
  });

  it('moves to root', () => {
    const next = applyMove(index, 'b', null, 0);
    expect(next.rootIds).toEqual(['b', 'a', 'e']);
    expect(next.byId.a?.childIds).toEqual(['c']);
    expect(next.byId.b?.parentId).toBeNull();
  });

  it('refuses a move into its own subtree or onto itself', () => {
    expect(applyMove(index, 'a', 'd', 0)).toBe(index);
    expect(applyMove(index, 'a', 'a', 0)).toBe(index);
    expect(applyMove(index, 'b', 'nope', 0)).toBe(index);
  });
});

describe('applyRemove', () => {
  it('removes the whole subtree and unlinks the parent', () => {
    const next = applyRemove(index, 'b');
    expect(next.byId.b).toBeUndefined();
    expect(next.byId.d).toBeUndefined();
    expect(next.byId.a?.childIds).toEqual(['c']);
    expect(next.idByPath['a/b.md']).toBeUndefined();
    expect(next.idByPath['a/b/d.md']).toBeUndefined();
  });

  it('removes a root', () => {
    expect(applyRemove(index, 'e').rootIds).toEqual(['a']);
  });

  it('is a no-op for an unknown id', () => {
    expect(applyRemove(index, 'nope')).toBe(index);
  });
});

// ---------------------------------------------------------------------------
// Property tests: the invariants must survive any sequence of operations.
// ---------------------------------------------------------------------------

type Op =
  | { kind: 'insert'; parent: number; at: number }
  | { kind: 'move'; node: number; parent: number; at: number }
  | { kind: 'remove'; node: number }
  | { kind: 'rename'; node: number; title: string };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    kind: fc.constant('insert' as const),
    parent: fc.integer({ min: -1, max: 20 }),
    at: fc.integer({ min: 0, max: 5 }),
  }),
  fc.record({
    kind: fc.constant('move' as const),
    node: fc.integer({ min: 0, max: 20 }),
    parent: fc.integer({ min: -1, max: 20 }),
    at: fc.integer({ min: 0, max: 5 }),
  }),
  fc.record({ kind: fc.constant('remove' as const), node: fc.integer({ min: 0, max: 20 }) }),
  fc.record({
    kind: fc.constant('rename' as const),
    node: fc.integer({ min: 0, max: 20 }),
    title: fc.string({ minLength: 1, maxLength: 12 }),
  }),
);

function pick(ids: NodeId[], i: number): NodeId | undefined {
  return ids.length === 0 ? undefined : ids[Math.abs(i) % ids.length];
}

function invariants(current: TreeIndex): void {
  const ids = Object.keys(current.byId);
  const idSet = new Set(ids);

  // Unique ids: byId is keyed by id, so this checks the childIds edges instead.
  const seenAsChild = new Set<NodeId>();
  for (const id of ids) {
    const node = current.byId[id];
    if (!node) throw new Error('byId hole');
    expect(node.id).toBe(id);
    expect(new Set(node.childIds).size).toBe(node.childIds.length);
    for (const childId of node.childIds) {
      // No orphans: every referenced child exists.
      expect(idSet.has(childId)).toBe(true);
      // Single parent: a child appears in exactly one childIds list.
      expect(seenAsChild.has(childId)).toBe(false);
      seenAsChild.add(childId);
      // childIds is consistent with parentId in both directions.
      expect(current.byId[childId]?.parentId).toBe(id);
    }
  }

  for (const id of ids) {
    const node = current.byId[id];
    if (!node) continue;
    if (node.parentId === null) {
      expect(current.rootIds).toContain(id);
    } else {
      expect(idSet.has(node.parentId)).toBe(true);
      expect(current.byId[node.parentId]?.childIds).toContain(id);
    }
  }

  expect(new Set(current.rootIds).size).toBe(current.rootIds.length);
  for (const rootId of current.rootIds) {
    expect(idSet.has(rootId)).toBe(true);
    expect(seenAsChild.has(rootId)).toBe(false);
  }

  // Everything is reachable from the roots: no detached island.
  expect(flatten(current).length).toBe(ids.length);

  // idByPath never points at a node that is gone.
  for (const nodeId of Object.values(current.idByPath)) expect(idSet.has(nodeId)).toBe(true);
}

describe('tree properties', () => {
  it('holds every structural invariant under any operation sequence', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 40 }), (ops) => {
        let current = index;
        let counter = 0;
        for (const op of ops) {
          const ids = Object.keys(current.byId);
          if (op.kind === 'insert') {
            const parent = op.parent < 0 ? null : (pick(ids, op.parent) ?? null);
            counter++;
            const id = `n${counter}`;
            current = applyInsert(current, page(id, `gen/${id}.md`, parent), parent, op.at);
          } else if (op.kind === 'move') {
            const node = pick(ids, op.node);
            if (!node) continue;
            const parent = op.parent < 0 ? null : (pick(ids, op.parent) ?? null);
            current = applyMove(current, node, parent, op.at);
          } else if (op.kind === 'remove') {
            const node = pick(ids, op.node);
            if (!node) continue;
            current = applyRemove(current, node);
          } else {
            const node = pick(ids, op.node);
            if (!node) continue;
            current = applyRename(current, node, op.title);
          }
          invariants(current);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('never lets a move create a cycle', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        (nodeSeed, parentSeed) => {
          const ids = Object.keys(index.byId);
          const node = pick(ids, nodeSeed);
          const parent = pick(ids, parentSeed);
          if (!node || !parent) return;
          const next = applyMove(index, node, parent, 0);
          // Walking up from every node must terminate at a root.
          for (const id of Object.keys(next.byId)) {
            const chain = ancestorsOf(next, id);
            expect(chain).not.toContain(id);
          }
          if (isDescendant(index, parent, node) || parent === node) expect(next).toBe(index);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('keeps subtreeIds and descendantCount in agreement', () => {
    for (const id of Object.keys(index.byId)) {
      expect(subtreeIds(index, id).length).toBe(descendantCount(index, id) + 1);
    }
  });
});

describe('path aliases', () => {
  it('gives an index page its directory and trailing-slash forms', () => {
    expect(pathAliases('guides/auth/index.md')).toEqual([
      'guides/auth/index.md',
      'guides/auth',
      'guides/auth/',
    ]);
    expect(pathAliases('index.md')).toEqual(['index.md', '', '/']);
  });

  it('treats README.md as an index filename', () => {
    expect(isIndexPath('guides/billing/README.md')).toBe(true);
    expect(dirFormOf('guides/billing/README.md')).toBe('guides/billing');
  });

  it('gives a leaf page only its extensionless form', () => {
    expect(pathAliases('guides/intro.md')).toEqual(['guides/intro.md', 'guides/intro']);
    expect(isIndexPath('guides/intro.md')).toBe(false);
  });

  it('lets index.md keep the directory when README.md is also present', () => {
    const index = buildIndex({
      version: 'v1',
      nodes: [
        page('p_index', 'guides/index.md', null),
        page('p_readme', 'guides/README.md', null),
      ],
    });
    expect(index.idByPath.guides).toBe('p_index');
    expect(index.idByPath['guides/']).toBe('p_index');
    expect(index.idByPath['guides/README.md']).toBe('p_readme');
  });
});
