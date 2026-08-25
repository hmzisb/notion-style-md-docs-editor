import type {
  BackendMeta,
  ChangeEvent,
  NodeId,
  PageDocument,
  ProviderCapabilities,
  TreeIndex,
  TreeNode,
  TreeSnapshot,
} from '../model.js';
import type { DocumentProvider, FileStore } from '../provider.js';
import { CONTRACT_VERSION } from '../contract/version.js';
import { ProviderError } from '../errors.js';
import { pageVersion } from '../hash.js';
import { parseHref } from '../links.js';
import { buildIndex, subtreeIds } from '../tree.js';
import { splitFrontmatter } from '../frontmatter.js';
import { assetBaseFor, extname, joinPath, normalizePath } from './paths.js';
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
    upload: writable,
    search: false,
    subscribe: typeof store.watch === 'function',
    ...opts.capabilities,
  };

  let cached: Promise<LoadedTree> | null = null;
  let warnings: readonly WalkWarning[] = [];
  const assetCache = new Map<string, string>();
  const listeners = new Set<(event: ChangeEvent) => void>();
  let disposed = false;

  const readPageInfo = async (path: string): Promise<PageInfo> => {
    const split = splitFrontmatter(await store.readText(path));
    return { meta: split.meta, firstH1: firstH1(split.body) ?? undefined };
  };

  function load(): Promise<LoadedTree> {
    cached ??= (async (): Promise<LoadedTree> => {
      const entries = await store.list();
      const walked = await buildSnapshotFromEntries(entries, readPageInfo);
      warnings = walked.warnings;
      return { snapshot: walked.snapshot, index: buildIndex(walked.snapshot), warnings: walked.warnings };
    })().catch((error: unknown) => {
      cached = null;
      throw error;
    });
    return cached;
  }

  function invalidate(): void {
    cached = null;
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

  const unsupported = (what: string): Promise<never> =>
    Promise.reject(new ProviderError('unsupported', `${what} is not implemented yet (P0-T11).`));

  const unwatch = store.watch?.(() => {
    invalidate();
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

    savePage: () => unsupported('savePage'),
    updateMeta: () => unsupported('updateMeta'),
    createPage: () => unsupported('createPage'),
    movePage: () => unsupported('movePage'),
    deletePage: () => unsupported('deletePage'),

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
      const target = normalizePath(rooted ? href.path : joinPath(assetBaseFor(page.path), href.path));
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
