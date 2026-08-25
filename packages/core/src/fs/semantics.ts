import type {
  BackendMeta,
  ChangeEvent,
  NodeId,
  PageDocument,
  PageMeta,
  PageMetaPatch,
  ProviderCapabilities,
  SaveResult,
  TreeIndex,
  TreeNode,
  TreeSnapshot,
} from '../model.js';
import type { DocumentProvider, FileEntry, FileStore } from '../provider.js';
import { CONTRACT_VERSION } from '../contract/version.js';
import { ConflictError, ProviderError } from '../errors.js';
import { pageVersion } from '../hash.js';
import { generateId } from '../ids.js';
import { parseIcon } from '../icon.js';
import { parseHref } from '../links.js';
import { buildIndex, childIdsOf, isDescendant, isIndexPath, subtreeIds } from '../tree.js';
import { joinFrontmatter, setMetaKey, splitFrontmatter, type SplitResult } from '../frontmatter.js';
import { midpointOrder, renumber } from './ordering.js';
import {
  INDEX_FILE,
  assetBaseFor,
  basename,
  dirPathFor,
  dirname,
  extname,
  isMarkdown,
  joinPath,
  normalizePath,
  pagePathFor,
  slugify,
  stem,
  uniqueSlug,
} from './paths.js';
import { buildSnapshotFromEntries, firstH1, type PageInfo, type WalkWarning } from './walk.js';

/**
 * One implementation of filesystem semantics (docs/03 section 4) over any `FileStore`.
 * Memory, a directory handle and OPFS all reach the same behaviour through this file,
 * and an HTTP backend that wants interoperable files follows the same published rules.
 */

export interface FileStoreProviderOptions {
  /** Provider identity for cache namespacing. Defaults to the store's key. */
  key?: string;
  /** Overrides on top of what the store can actually do. */
  capabilities?: Partial<ProviderCapabilities>;
  /** Workspace display name, surfaced by `getMeta`. */
  title?: string;
  /** Serve only this subtree. */
  rootId?: NodeId;
  /** Clock for `updatedAt`. Injected by tests. */
  now?: () => Date;
  /**
   * docs/03 section 4.7 host policy: rename every file whose title changes and rewrite
   * the links that pointed at it. Rejected with `unsupported` until P4 implements the
   * link rewrite, because renaming without it silently breaks other pages.
   */
  renameFilesOnTitleChange?: boolean;
  /**
   * A move ran out of representable midpoints and rewrote `count` sibling files
   * (docs/03 section 4.4). The React layer turns this into `tree:renumbered`.
   */
  onRenumber?: (count: number) => void;
}

export interface FileStoreProvider extends DocumentProvider {
  /** Non-fatal problems found while walking, e.g. a duplicate frontmatter id. */
  readonly warnings: readonly WalkWarning[];
  /** Drops the cached tree so the next `getTree` re-reads the store. */
  invalidate(): void;
}

interface LoadedTree {
  snapshot: TreeSnapshot;
  index: TreeIndex;
  warnings: WalkWarning[];
  /** The listing the walk ran on. Slug collisions are checked against it, not the tree,
   * because an asset or an empty directory takes a name a new page cannot reuse. */
  entries: readonly FileEntry[];
}

const MIME: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function mimeFor(path: string): string {
  return MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

/** Frontmatter `updatedAt` wins, then the store's mtime, then the clock. */
function toIso(value: unknown, fallback: Date): string {
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return fallback.toISOString();
}

/** What a file that does not exist yet splits into. */
const EMPTY_SPLIT: SplitResult = { meta: {}, body: '', eol: 'lf', hasFrontmatter: false, yaml: '' };

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function createFileStoreProvider(
  store: FileStore,
  opts: FileStoreProviderOptions = {},
): FileStoreProvider {
  const now = opts.now ?? ((): Date => new Date());
  const writable = !store.readOnly;
  const capabilities: ProviderCapabilities = {
    write: writable,
    move: writable,
    delete: writable,
    // `uploadAsset` and `search` arrive in later phases; advertising a capability with
    // no method behind it is what breaks the callers that trust the flag.
    upload: false,
    search: false,
    subscribe: typeof store.watch === 'function',
    ...opts.capabilities,
  };

  let cached: Promise<LoadedTree> | null = null;
  let warnings: readonly WalkWarning[] = [];
  const assetCache = new Map<string, string>();
  const listeners = new Set<(event: ChangeEvent) => void>();
  let disposed = false;

  /**
   * Frontmatter and first-H1 per page, kept across re-walks. A write invalidates the
   * tree, and re-reading every file to rebuild it would put the whole corpus in the
   * path of one save; the entries this cache holds are dropped explicitly by `touch`,
   * so a re-walk only reads what actually changed.
   */
  const infoCache = new Map<string, PageInfo>();

  const readPageInfo = async (path: string): Promise<PageInfo> => {
    const hit = infoCache.get(path);
    if (hit) return hit;
    const split = splitFrontmatter(await store.readText(path));
    const info: PageInfo = { meta: split.meta, firstH1: firstH1(split.body) ?? undefined };
    infoCache.set(path, info);
    return info;
  };

  /** Forgets `paths` and everything beneath them, then the tree they were walked into. */
  function touch(...paths: readonly string[]): void {
    for (const path of paths) {
      infoCache.delete(path);
      const prefix = `${path}/`;
      for (const key of infoCache.keys()) {
        if (key.startsWith(prefix)) infoCache.delete(key);
      }
    }
    invalidate();
  }

  function load(): Promise<LoadedTree> {
    cached ??= (async (): Promise<LoadedTree> => {
      const entries = await store.list();
      const walked = await buildSnapshotFromEntries(entries, readPageInfo);
      warnings = walked.warnings;
      return {
        snapshot: walked.snapshot,
        index: buildIndex(walked.snapshot),
        warnings: walked.warnings,
        entries,
      };
    })().catch((error: unknown) => {
      cached = null;
      throw error;
    });
    return cached;
  }

  function invalidate(): void {
    cached = null;
  }

  /** docs/03 section 4.4: only a finite frontmatter number counts as an order. */
  function orderOf(path: string): number | undefined {
    const value = infoCache.get(path)?.meta.order;
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  async function nodeById(id: NodeId): Promise<TreeNode> {
    const { index } = await load();
    const node = index.byId[id];
    if (!node) throw new ProviderError('not_found', `No node with id ${id}`);
    return node;
  }

  /**
   * Scoped snapshot: the node plus its descendants, in the order the walk produced.
   * The version is the full-tree version plus the scope id, so an edit outside the
   * scope still moves it. That over-invalidates rather than under-invalidates, which
   * is the safe direction; a scope-local hash would need the walk's order map.
   */
  async function snapshotFor(rootId: NodeId | undefined): Promise<TreeSnapshot> {
    const { snapshot, index } = await load();
    const scope = rootId ?? opts.rootId;
    if (scope === undefined) return snapshot;
    if (!index.byId[scope]) throw new ProviderError('not_found', `No node with id ${scope}`);

    const keep = new Set(subtreeIds(index, scope));
    return {
      version: `${snapshot.version}:${scope}`,
      nodes: snapshot.nodes
        .filter((node) => keep.has(node.id))
        .map((node) => (node.id === scope ? { ...node, parentId: null } : node)),
    };
  }

  // ------------------------------------------------------------------ writes

  function requireWrite(what: string): void {
    if (!capabilities.write) {
      throw new ProviderError('unsupported', `${what} needs a writable store.`);
    }
  }

  async function writeFile(path: string, raw: string): Promise<SaveResult> {
    await store.writeText(path, raw);
    touch(path);
    const stat = await store.stat?.(path);
    return { version: await pageVersion(raw), updatedAt: toIso(stat?.mtime, now()) };
  }

  /** The file as it is now, or an empty document when it does not exist yet. */
  async function splitOf(path: string): Promise<SplitResult> {
    if (!(await store.exists(path))) return EMPTY_SPLIT;
    return splitFrontmatter(await store.readText(path));
  }

  /**
   * docs/03 sections 4.5, 4.6 and 10 all require ids to survive a move, and a page whose
   * id came from its path would get a different one the moment the path changed. Writing
   * the id it has right now into frontmatter is what makes the move id-preserving.
   */
  async function persistId(node: TreeNode): Promise<void> {
    if (node.kind !== 'page') return;
    const split = await splitOf(node.path);
    if (typeof split.meta.id === 'string' && split.meta.id !== '') return;
    const meta = setMetaKey(split.meta, 'id', node.id);
    await writeFile(node.path, joinFrontmatter(meta, split.body, split.eol, { source: split }));
  }

  /** Slugs already in use directly inside `dir`: page stems, subdirectories, other files. */
  function takenIn(entries: readonly FileEntry[], dir: string): Set<string> {
    const taken = new Set<string>();
    for (const entry of entries) {
      if (dirname(entry.path) !== dir) continue;
      const name = basename(entry.path);
      taken.add(entry.kind === 'file' && isMarkdown(name) ? stem(name) : name);
    }
    return taken;
  }

  /**
   * `parentId: null` names the store root directory, but when a root `index.md` owns it
   * the siblings to order against are that page's children, not `rootIds`. The empty
   * path is the directory alias the walk registers for the root page.
   */
  function siblingParentOf(tree: TreeIndex, parentId: NodeId | null): NodeId | null {
    return parentId ?? tree.idByPath[''] ?? null;
  }

  /** The file or directory that moves when the node moves. */
  function movableRootOf(node: TreeNode): string {
    if (node.kind === 'folder') return node.path;
    return isIndexPath(node.path) ? dirname(node.path) : node.path;
  }

  /** docs/03 section 4.5 case 4: `x.md` becomes `x/index.md` so it can hold children. */
  async function convertToDirectory(node: TreeNode): Promise<string> {
    const dir = dirPathFor(node.path);
    await persistId(node);
    await store.move(node.path, joinPath(dir, INDEX_FILE));
    touch(node.path, dir);
    return dir;
  }

  /**
   * docs/03 section 4.7: a page the user has just created renames its file (or its
   * directory, for an index page) to match the title it was given, keeping its id.
   */
  async function renameToTitle(node: TreeNode, title: string): Promise<void> {
    const from = movableRootOf(node);
    // The root index page has no name of its own; renaming it would rename the root.
    if (from === '') return;
    const md = isMarkdown(from);
    const home = dirname(from);
    const currentName = md ? stem(from) : basename(from);

    const { entries } = await load();
    const taken = takenIn(entries, home);
    taken.delete(currentName);
    const slug = uniqueSlug(slugify(title) || 'untitled', taken);
    if (slug === currentName) return;

    await persistId(node);
    const to = md ? pagePathFor(home, slug) : joinPath(home, slug);
    await store.move(from, to);
    touch(from, to);
  }

  /** docs/03 section 4.5: the directory a new child of `parentId` is written into. */
  async function childDirFor(parentId: NodeId | null): Promise<string> {
    if (parentId === null) return '';
    const parent = await nodeById(parentId);
    if (parent.kind === 'folder') return parent.path;
    if (isIndexPath(parent.path)) return dirname(parent.path);
    return convertToDirectory(parent);
  }

  /**
   * docs/03 section 4.4: the order for a node landing at `index` under `parentId`.
   * The neighbours are the nearest siblings that actually carry an order, so a drop
   * next to an unordered page still lands between the numbers around it.
   */
  async function orderAt(
    parentId: NodeId | null,
    index: number,
    exclude: NodeId | null,
  ): Promise<{ order: number; needsRenumber: boolean }> {
    const { index: tree } = await load();
    const siblings = childIdsOf(tree, siblingParentOf(tree, parentId))
      .filter((sid) => sid !== exclude)
      .map((sid) => tree.byId[sid])
      .filter((node): node is TreeNode => node !== undefined);

    const at = Math.max(0, Math.min(index, siblings.length));
    let prev: number | undefined;
    for (let i = at - 1; i >= 0 && prev === undefined; i--) prev = orderOf(siblings[i]?.path ?? '');
    let next: number | undefined;
    for (let i = at; i < siblings.length && next === undefined; i++)
      next = orderOf(siblings[i]?.path ?? '');

    return midpointOrder(prev, next);
  }

  async function writeOrder(path: string, order: number): Promise<void> {
    const split = await splitOf(path);
    const meta = setMetaKey(split.meta, 'order', order);
    await writeFile(path, joinFrontmatter(meta, split.body, split.eol, { source: split }));
  }

  /**
   * docs/03 section 4.4: no midpoint is representable any more, so the whole sibling
   * group is rewritten in steps of 10. Folders cannot carry an order and are skipped.
   */
  async function renumberSiblings(
    parentId: NodeId | null,
    movedId: NodeId,
    index: number,
  ): Promise<void> {
    const { index: tree } = await load();
    const others = childIdsOf(tree, siblingParentOf(tree, parentId)).filter(
      (sid) => sid !== movedId,
    );
    const at = Math.max(0, Math.min(index, others.length));
    const ordered = [...others.slice(0, at), movedId, ...others.slice(at)]
      .map((sid) => tree.byId[sid])
      .filter((node): node is TreeNode => node?.kind === 'page');

    const values = renumber(ordered.length);
    for (const [i, node] of ordered.entries()) {
      await writeOrder(node.path, values[i] ?? (i + 1) * 10);
    }
    opts.onRenumber?.(ordered.length);
  }

  const unwatch = store.watch?.((paths) => {
    // An external write is the one case where the page cache cannot be trusted.
    if (paths.length === 0) infoCache.clear();
    else touch(...paths);
    void load().then(
      ({ snapshot }) => {
        for (const listener of listeners) listener({ type: 'tree', version: snapshot.version });
      },
      // The cache is already dropped; a failed re-walk must not become an unhandled
      // rejection in a watcher callback nobody can catch. The next read reports it.
      () => undefined,
    );
  });

  const provider: FileStoreProvider = {
    key: opts.key ?? store.key,
    capabilities,

    /** Empty until the first `getTree`: reading them must never trigger a walk. */
    get warnings(): readonly WalkWarning[] {
      return warnings;
    },

    invalidate,

    getMeta(): Promise<BackendMeta> {
      const meta: BackendMeta = { contractVersion: CONTRACT_VERSION, capabilities };
      if (opts.title !== undefined) meta.title = opts.title;
      if (opts.rootId !== undefined) meta.rootId = opts.rootId;
      return Promise.resolve(meta);
    },

    getTree(treeOpts?: { rootId?: NodeId }): Promise<TreeSnapshot> {
      return snapshotFor(treeOpts?.rootId);
    },

    async getPage(id: NodeId): Promise<PageDocument> {
      const node = await nodeById(id);
      if (node.kind !== 'page') {
        throw new ProviderError('not_found', `${node.path} is a folder and has no document`);
      }
      const raw = await store.readText(node.path);
      const split = splitFrontmatter(raw);
      const stat = await store.stat?.(node.path);
      const document: PageDocument = {
        id,
        meta: split.meta,
        body: split.body,
        version: await pageVersion(raw),
        updatedAt: toIso(split.meta.updatedAt ?? stat?.mtime, now()),
      };
      if (split.eol === 'crlf') document.eol = 'crlf';
      return document;
    },

    /**
     * docs/03 section 4.2: a save with a null base on a folder writes its `index.md`
     * and flips the node to a page, carrying the folder's id across. Everything else
     * about the file survives: unknown frontmatter keys, their order, and the EOL.
     */
    async savePage(
      id: NodeId,
      input: { body: string; baseVersion: string | null },
    ): Promise<SaveResult> {
      requireWrite('savePage');
      const node = await nodeById(id);
      const isConversion = node.kind === 'folder';
      const path = isConversion ? joinPath(node.path, INDEX_FILE) : node.path;

      const exists = await store.exists(path);
      if (!exists && input.baseVersion !== null) {
        throw new ProviderError('not_found', `${path} no longer exists.`);
      }
      const split = exists ? splitFrontmatter(await store.readText(path)) : EMPTY_SPLIT;
      if (input.baseVersion !== null) {
        const current = await pageVersion(await store.readText(path));
        if (current !== input.baseVersion) throw new ConflictError(current);
      }

      let meta = split.meta.id === undefined ? setMetaKey(split.meta, 'id', id) : split.meta;
      // A folder's title lives in its directory name; the new index page must carry it.
      if (isConversion && meta.title === undefined) meta = setMetaKey(meta, 'title', node.title);

      const raw = joinFrontmatter(meta, input.body, split.eol, { source: split });
      return writeFile(path, raw);
    },

    /** docs/03 section 4.7: title and icon go into frontmatter; the body is not touched. */
    async updateMeta(
      id: NodeId,
      patch: PageMetaPatch,
      metaOpts?: { renameFile?: boolean },
    ): Promise<TreeNode> {
      requireWrite('updateMeta');
      if (opts.renameFilesOnTitleChange === true) {
        throw new ProviderError(
          'unsupported',
          'renameFilesOnTitleChange needs the link rewrite that docs/03 section 4.7 defers to P4.',
        );
      }
      const node = await nodeById(id);
      if (node.kind === 'folder') {
        throw new ProviderError(
          'unsupported',
          `${node.path} is a folder: it has no frontmatter to write. Save an index page first.`,
        );
      }
      if (typeof patch.icon === 'string' && patch.icon !== '' && !parseIcon(patch.icon)) {
        throw new ProviderError(
          'validation',
          `"${patch.icon}" is not an emoji or a "lucide:<name>" icon.`,
        );
      }

      const split = splitFrontmatter(await store.readText(node.path));
      let meta = split.meta.id === undefined ? setMetaKey(split.meta, 'id', id) : split.meta;
      if ('title' in patch) meta = setMetaKey(meta, 'title', patch.title);
      if ('icon' in patch)
        meta = setMetaKey(meta, 'icon', patch.icon === '' ? undefined : patch.icon);
      await writeFile(node.path, joinFrontmatter(meta, split.body, split.eol, { source: split }));

      if (metaOpts?.renameFile === true && typeof patch.title === 'string') {
        await renameToTitle(node, patch.title);
      }
      return nodeById(id);
    },

    /** docs/03 section 4.5. The four parent cases differ only in the directory they pick. */
    async createPage(input: {
      parentId: NodeId | null;
      title: string;
      index?: number;
    }): Promise<TreeNode> {
      requireWrite('createPage');
      const dir = await childDirFor(input.parentId);
      const { entries } = await load();

      const title = input.title.trim();
      const slug = uniqueSlug(slugify(title) || 'untitled', takenIn(entries, dir));
      const id = generateId();

      let meta: PageMeta = { id, title: title === '' ? 'Untitled' : title };
      if (input.index !== undefined) {
        const { order } = await orderAt(input.parentId, input.index, null);
        meta = setMetaKey(meta, 'order', order);
      }
      await writeFile(pagePathFor(dir, slug), joinFrontmatter(meta, '', 'lf'));
      return nodeById(id);
    },

    /** docs/03 section 4.6. A move inside the current directory only rewrites `order`. */
    async movePage(
      id: NodeId,
      input: { parentId: NodeId | null; index: number },
    ): Promise<TreeNode> {
      requireWrite('movePage');
      const { index: tree } = await load();
      const node = tree.byId[id];
      if (!node) throw new ProviderError('not_found', `No node with id ${id}`);
      if (
        input.parentId === id ||
        (input.parentId !== null && isDescendant(tree, input.parentId, id))
      ) {
        throw new ProviderError('validation', 'A page cannot be moved into its own subtree.');
      }

      const from = movableRootOf(node);
      // Persisted before the move, so the id does not follow the path (docs/03 section 4.2).
      await persistId(node);
      const targetDir = await childDirFor(input.parentId);

      let movedId = id;
      if (dirname(from) !== targetDir) {
        const { entries } = await load();
        const name = basename(from);
        const md = isMarkdown(name);
        const taken = takenIn(entries, targetDir);
        const slug = uniqueSlug(md ? stem(name) : name, taken);
        const to = joinPath(targetDir, md ? `${slug}.md` : slug);
        await store.move(from, to);
        touch(from, to);

        // A page carries its id in frontmatter, but a folder's is a hash of its path
        // (docs/03 section 4.2), so a moved folder is found again by where it landed.
        if (node.kind === 'folder') {
          const relocated = (await load()).index.idByPath[to];
          if (relocated === undefined) {
            throw new ProviderError('internal', `The folder moved to ${to} is not in the tree.`);
          }
          movedId = relocated;
        }
      }

      const moved = await nodeById(movedId);
      // docs/03 section 4.4: folders cannot carry an order.
      if (moved.kind === 'page') {
        const { order, needsRenumber } = await orderAt(input.parentId, input.index, movedId);
        if (needsRenumber) await renumberSiblings(input.parentId, movedId, input.index);
        else await writeOrder(moved.path, order);
      }
      return nodeById(movedId);
    },

    /** docs/03 section 4.8: the file, or the whole directory for a page that owns one. */
    async deletePage(id: NodeId): Promise<void> {
      requireWrite('deletePage');
      const node = await nodeById(id);
      const root = movableRootOf(node);
      // The root index page owns the store root; removing that would wipe the workspace.
      await store.remove(root === '' ? node.path : root);
      touch(root === '' ? node.path : root);
    },

    /**
     * docs/03 section 4.10: resolve against the page's directory, reject traversal above
     * the root, hand back an object URL where the platform has one and a data URL where
     * it does not, so the same code path serves the browser and a Node test.
     */
    async assetUrl(relativePath: string, page: TreeNode): Promise<string> {
      const href = parseHref(relativePath);
      // An absolute URL is already addressable; handing it back beats a broken image.
      if (href.external) return relativePath;

      const rooted = href.path.startsWith('/');
      const target = normalizePath(
        rooted ? href.path : joinPath(assetBaseFor(page.path), href.path),
      );
      if (target === null || target === '') {
        throw new ProviderError('validation', `Asset path escapes the root: ${relativePath}`);
      }

      const stat = await store.stat?.(target);
      const cacheKey = `${target}:${stat?.mtime?.toString() ?? ''}`;
      const hit = assetCache.get(cacheKey);
      if (hit !== undefined) return hit;

      const blob = await store.readBinary(target);
      const url =
        typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(blob)
          : `data:${mimeFor(target)};base64,${base64(new Uint8Array(await blob.arrayBuffer()))}`;
      assetCache.set(cacheKey, url);
      return url;
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (typeof URL.revokeObjectURL === 'function') {
        for (const url of assetCache.values()) {
          if (url.startsWith('blob:')) URL.revokeObjectURL(url);
        }
      }
      assetCache.clear();
      listeners.clear();
      cached = null;
      unwatch?.();
    },
  };

  if (capabilities.subscribe) {
    provider.subscribe = (listener: (event: ChangeEvent) => void): (() => void) => {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    };
  }

  return provider;
}
