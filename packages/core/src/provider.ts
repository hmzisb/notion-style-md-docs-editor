import type {
  BackendMeta,
  ChangeEvent,
  NodeId,
  PageDocument,
  PageMetaPatch,
  ProviderCapabilities,
  SaveResult,
  SearchHit,
  TreeNode,
  TreeSnapshot,
} from './model.js';

/**
 * The single seam between the module and any storage. Frontend only (D-01): the
 * module never opens a socket or a file itself, it calls one of these.
 */
export interface DocumentProvider {
  /** Stable identity: `http:/api/docs`, `fs:<dirName>:<handleId>`, `memory:<seedHash>`. Part of every cache namespace (D-04). */
  readonly key: string;
  /** Static for memory and filesystem; the http adapter fills it from `getMeta` before use. */
  readonly capabilities: ProviderCapabilities;

  getMeta(): Promise<BackendMeta>;
  getTree(opts?: { rootId?: NodeId }): Promise<TreeSnapshot>;
  getPage(id: NodeId): Promise<PageDocument>;
  savePage(id: NodeId, input: { body: string; baseVersion: string | null }): Promise<SaveResult>;
  updateMeta(id: NodeId, patch: PageMetaPatch, opts?: { renameFile?: boolean }): Promise<TreeNode>;
  createPage(input: { parentId: NodeId | null; title: string; index?: number }): Promise<TreeNode>;
  movePage(id: NodeId, input: { parentId: NodeId | null; index: number }): Promise<TreeNode>;
  /** Deletes the node and its whole subtree. */
  deletePage(id: NodeId): Promise<void>;
  /** Local stores return object URLs; remote stores return absolute URLs. */
  assetUrl(relativePath: string, page: TreeNode): Promise<string>;

  /**
   * Sibling files a write had to renumber since the last call (docs/03 section 4.4), and zero
   * when nothing was rewritten. Reading it clears the count: the UI layer reads it after a
   * move and reports it as `tree:renumbered`.
   */
  takeRenumbered?(): number;

  uploadAsset?(pageId: NodeId, file: File): Promise<{ path: string; url: string }>;
  search?(query: string, opts?: { rootId?: NodeId; limit?: number }): Promise<SearchHit[]>;
  subscribe?(listener: (e: ChangeEvent) => void): () => void;
  /** Revoke object URLs, close watchers. */
  dispose?(): void;
}

export interface FileEntry {
  path: string;
  kind: 'file' | 'dir';
  size?: number;
  mtime?: number;
}

/**
 * What `memory` and `filesystem` implement. All docs semantics (ids, ordering, slugs,
 * moves, folder conversion, hashing) live once in core on top of this (D-03), so a new
 * store is a dumb byte layer, never a re-implementation of the rules.
 */
export interface FileStore {
  readonly key: string;
  readonly readOnly: boolean;
  /** Recursive; posix paths relative to the root; excludes dot-dirs and `node_modules`. */
  list(): Promise<FileEntry[]>;
  readText(path: string): Promise<string>;
  readBinary(path: string): Promise<Blob>;
  /** Creates parent dirs; atomic where the platform allows. */
  writeText(path: string, content: string): Promise<void>;
  writeBinary(path: string, data: Blob | ArrayBuffer): Promise<void>;
  /** Recursive for directories. */
  remove(path: string): Promise<void>;
  /** File or directory; may be emulated by copy + remove. */
  move(from: string, to: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat?(path: string): Promise<FileEntry | null>;
  /** Optional; the filesystem adapter polls when absent. */
  watch?(listener: (paths: string[]) => void): () => void;
}
