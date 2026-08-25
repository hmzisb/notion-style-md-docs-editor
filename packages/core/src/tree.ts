import type { NodeId, TreeIndex, TreeNode, TreeSnapshot } from './model.js';
import { fnv1a64 } from './hash.js';

/**
 * Pure, immutable tree operations over the flat index (reference v2 section 7).
 *
 * Flat and immutable on purpose: a rename replaces exactly one node object, so the
 * sidebar re-renders one row instead of an ancestor chain. Every `apply*` returns a
 * new index that shares every untouched node with the old one.
 */

const EMPTY_CHILDREN: readonly NodeId[] = Object.freeze([]);

/** Directory form of a page path: `guides/auth/index.md` -> `guides/auth`, `a/b.md` -> `a/b`. */
export function dirFormOf(path: string): string | null {
  if (path.endsWith('/index.md')) return path.slice(0, -'/index.md'.length);
  if (path === 'index.md') return '';
  if (path.endsWith('.md')) return path.slice(0, -'.md'.length);
  return null;
}

/**
 * Builds the lookup index. Nodes arrive flat and already ordered; `childIds` is
 * authoritative, so the index never re-sorts. A node whose `parentId` is unknown is
 * treated as a root rather than dropped: a partial snapshot should still render.
 */
export function buildIndex(snapshot: TreeSnapshot): TreeIndex {
  const byId: Record<NodeId, TreeNode> = Object.create(null) as Record<NodeId, TreeNode>;
  const idByPath: Record<string, NodeId> = Object.create(null) as Record<string, NodeId>;

  for (const node of snapshot.nodes) {
    byId[node.id] = node;
    idByPath[node.path] = node.id;
    const dirForm = dirFormOf(node.path);
    // A real folder node owning the same path wins over a page's directory alias.
    if (dirForm !== null && !(dirForm in idByPath)) idByPath[dirForm] = node.id;
  }
  // Second pass: a folder node listed after its index page must still own its path.
  for (const node of snapshot.nodes) {
    if (node.kind === 'folder') idByPath[node.path] = node.id;
  }

  const claimed = new Set<NodeId>();
  for (const node of snapshot.nodes) {
    for (const childId of node.childIds) {
      if (childId in byId) claimed.add(childId);
    }
  }

  const rootIds: NodeId[] = [];
  for (const node of snapshot.nodes) {
    if (!claimed.has(node.id)) rootIds.push(node.id);
  }

  return { version: snapshot.version, rootIds, byId, idByPath };
}

/** Root-first list of ancestor ids, excluding `id` itself. */
export function ancestorsOf(index: TreeIndex, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  const seen = new Set<NodeId>([id]);
  let current = index.byId[id]?.parentId ?? null;
  while (current !== null && !seen.has(current)) {
    seen.add(current);
    out.push(current);
    current = index.byId[current]?.parentId ?? null;
  }
  return out.reverse();
}

/** True when `id` sits anywhere under `maybeAncestor`. A node is not its own descendant. */
export function isDescendant(index: TreeIndex, id: NodeId, maybeAncestor: NodeId): boolean {
  if (id === maybeAncestor) return false;
  const seen = new Set<NodeId>([id]);
  let current = index.byId[id]?.parentId ?? null;
  while (current !== null && !seen.has(current)) {
    if (current === maybeAncestor) return true;
    seen.add(current);
    current = index.byId[current]?.parentId ?? null;
  }
  return false;
}

/** Number of nodes strictly below `id`. Drives the delete confirmation copy. */
export function descendantCount(index: TreeIndex, id: NodeId): number {
  let count = 0;
  const stack = [...(index.byId[id]?.childIds ?? EMPTY_CHILDREN)];
  const seen = new Set<NodeId>([id]);
  while (stack.length > 0) {
    const next = stack.pop();
    if (next === undefined || seen.has(next)) continue;
    seen.add(next);
    count++;
    const node = index.byId[next];
    if (node) stack.push(...node.childIds);
  }
  return count;
}

/** Every id in the subtree rooted at `id`, including `id`. */
export function subtreeIds(index: TreeIndex, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  const stack: NodeId[] = [id];
  const seen = new Set<NodeId>();
  while (stack.length > 0) {
    const next = stack.pop();
    if (next === undefined || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
    const node = index.byId[next];
    if (node) stack.push(...node.childIds);
  }
  return out;
}

/** Ordered ids of a parent's children, or the roots when `parentId` is null. */
export function childIdsOf(index: TreeIndex, parentId: NodeId | null): readonly NodeId[] {
  if (parentId === null) return index.rootIds;
  return index.byId[parentId]?.childIds ?? EMPTY_CHILDREN;
}

/**
 * Optimistic index versions are marked so a stale-cache check can tell a locally
 * patched index from one the provider actually returned.
 */
function nextVersion(index: TreeIndex, salt: string): string {
  return `local:${fnv1a64(`${index.version}|${salt}`)}`;
}

function replaceNode(
  index: TreeIndex,
  id: NodeId,
  update: (node: TreeNode) => TreeNode,
  salt: string,
): TreeIndex {
  const node = index.byId[id];
  if (!node) return index;
  const next = update(node);
  if (next === node) return index;

  const byId = { ...index.byId, [id]: next };
  let idByPath: Readonly<Record<string, NodeId>> = index.idByPath;
  if (next.path !== node.path) {
    const stale = new Set<string>([node.path]);
    const oldDir = dirFormOf(node.path);
    if (oldDir !== null && index.idByPath[oldDir] === id) stale.add(oldDir);
    const rebuilt: Record<string, NodeId> = Object.create(null) as Record<string, NodeId>;
    for (const [path, nodeId] of Object.entries(index.idByPath)) {
      if (!stale.has(path)) rebuilt[path] = nodeId;
    }
    rebuilt[next.path] = id;
    const newDir = dirFormOf(next.path);
    if (newDir !== null) rebuilt[newDir] = id;
    idByPath = rebuilt;
  }
  return { version: nextVersion(index, salt), rootIds: index.rootIds, byId, idByPath };
}

export function applyRename(index: TreeIndex, id: NodeId, title: string): TreeIndex {
  return replaceNode(index, id, (node) => (node.title === title ? node : { ...node, title }), `rename:${id}`);
}

/**
 * Patches display attributes. `id`, `parentId` and `childIds` are structural and are
 * ignored here: use `applyMove`, `applyInsert` and `applyRemove` so the two sides of
 * every edge stay consistent.
 */
export function applyMeta(index: TreeIndex, id: NodeId, patch: Partial<TreeNode>): TreeIndex {
  return replaceNode(
    index,
    id,
    (node) => {
      const { id: _id, parentId: _parentId, childIds: _childIds, ...safe } = patch;
      const next: TreeNode = { ...node, ...safe };
      if ('icon' in patch && patch.icon === undefined) {
        const { icon: _icon, ...withoutIcon } = next;
        return withoutIcon;
      }
      return next;
    },
    `meta:${id}`,
  );
}

function insertAt(ids: readonly NodeId[], id: NodeId, at: number): NodeId[] {
  const next = [...ids];
  const clamped = Math.max(0, Math.min(at, next.length));
  next.splice(clamped, 0, id);
  return next;
}

/** Inserts a node under `parentId` at `at`. Used for the temp-id optimistic create. */
export function applyInsert(
  index: TreeIndex,
  node: TreeNode,
  parentId: NodeId | null,
  at: number,
): TreeIndex {
  if (node.id in index.byId) return index;
  if (parentId !== null && !(parentId in index.byId)) return index;

  const inserted: TreeNode = { ...node, parentId, childIds: [...node.childIds] };
  const byId: Record<NodeId, TreeNode> = { ...index.byId, [node.id]: inserted };
  let rootIds = index.rootIds;

  if (parentId === null) {
    rootIds = insertAt(index.rootIds, node.id, at);
  } else {
    const parent = byId[parentId];
    if (parent) byId[parentId] = { ...parent, childIds: insertAt(parent.childIds, node.id, at) };
  }

  const idByPath = { ...index.idByPath, [node.path]: node.id };
  const dirForm = dirFormOf(node.path);
  if (dirForm !== null) idByPath[dirForm] = node.id;

  return { version: nextVersion(index, `insert:${node.id}`), rootIds, byId, idByPath };
}

/**
 * Moves a node under a new parent at `at`. Refuses a move into its own subtree.
 * Paths stay stale until the provider's refetch: the id is what the UI keys on.
 */
export function applyMove(
  index: TreeIndex,
  id: NodeId,
  parentId: NodeId | null,
  at: number,
): TreeIndex {
  const node = index.byId[id];
  if (!node) return index;
  if (parentId !== null && !(parentId in index.byId)) return index;
  if (parentId === id || (parentId !== null && isDescendant(index, parentId, id))) return index;

  const byId: Record<NodeId, TreeNode> = { ...index.byId };
  let rootIds = index.rootIds;

  // Detach.
  if (node.parentId === null) {
    rootIds = rootIds.filter((rootId) => rootId !== id);
  } else {
    const oldParent = byId[node.parentId];
    if (oldParent) {
      byId[node.parentId] = {
        ...oldParent,
        childIds: oldParent.childIds.filter((childId) => childId !== id),
      };
    }
  }

  // Attach.
  if (parentId === null) {
    rootIds = insertAt(rootIds, id, at);
  } else {
    const parent = byId[parentId];
    if (parent) byId[parentId] = { ...parent, childIds: insertAt(parent.childIds, id, at) };
  }

  byId[id] = { ...node, parentId };
  return { version: nextVersion(index, `move:${id}`), rootIds, byId, idByPath: index.idByPath };
}

/** Removes a node and its whole subtree. */
export function applyRemove(index: TreeIndex, id: NodeId): TreeIndex {
  const node = index.byId[id];
  if (!node) return index;

  const doomed = new Set(subtreeIds(index, id));
  const byId: Record<NodeId, TreeNode> = Object.create(null) as Record<NodeId, TreeNode>;
  for (const [nodeId, value] of Object.entries(index.byId)) {
    if (!doomed.has(nodeId)) byId[nodeId] = value;
  }

  let rootIds = index.rootIds;
  if (node.parentId === null) {
    rootIds = rootIds.filter((rootId) => rootId !== id);
  } else {
    const parent = byId[node.parentId];
    if (parent) {
      byId[node.parentId] = {
        ...parent,
        childIds: parent.childIds.filter((childId) => childId !== id),
      };
    }
  }

  const idByPath: Record<string, NodeId> = Object.create(null) as Record<string, NodeId>;
  for (const [path, nodeId] of Object.entries(index.idByPath)) {
    if (!doomed.has(nodeId)) idByPath[path] = nodeId;
  }

  return { version: nextVersion(index, `remove:${id}`), rootIds, byId, idByPath };
}

/** Depth-first flatten in display order. */
export function flatten(index: TreeIndex): NodeId[] {
  const out: NodeId[] = [];
  const seen = new Set<NodeId>();
  const walk = (ids: readonly NodeId[]) => {
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      const node = index.byId[id];
      if (node) walk(node.childIds);
    }
  };
  walk(index.rootIds);
  return out;
}
