/**
 * Core models. Markdown files are canonical (D-02); everything here describes the
 * shape a provider hands to the UI, never a storage format.
 */

/** Opaque, stable identity issued by the provider. Never a path. */
export type NodeId = string;

export type NodeKind = 'page' | 'folder';

export type PageMode = 'read' | 'edit';

export type PageIcon = { kind: 'emoji'; value: string } | { kind: 'lucide'; name: string };

export interface TreeNode {
  id: NodeId;
  kind: NodeKind;
  /** `meta.title` ?? first H1 ?? humanised filename stem. */
  title: string;
  /** Posix, relative to root: `guides/auth/index.md`, or `guides/auth` for a folder. */
  path: string;
  parentId: NodeId | null;
  /** Ordered and authoritative: the tree never re-sorts children itself. */
  childIds: NodeId[];
  icon?: PageIcon;
  /** ISO 8601. */
  updatedAt?: string;
}

export interface TreeSnapshot {
  version: string;
  nodes: TreeNode[];
}

export interface TreeIndex {
  version: string;
  rootIds: NodeId[];
  byId: Readonly<Record<NodeId, TreeNode>>;
  /** Both `a/b.md` and the directory form `a/b` map to the page id. */
  idByPath: Readonly<Record<string, NodeId>>;
}

/** Typed subset of frontmatter. Unknown keys pass through untouched. */
export interface PageMeta {
  id?: NodeId;
  title?: string;
  icon?: string;
  order?: number;
  [key: string]: unknown;
}

export interface PageDocument {
  id: NodeId;
  meta: PageMeta;
  /** Markdown without frontmatter, LF line endings. */
  body: string;
  /** `sha256:<hex>` of the full file bytes. */
  version: string;
  updatedAt: string;
  /** Original line ending style, preserved on write. */
  eol?: 'lf' | 'crlf';
}

export type PageMetaPatch = Partial<Pick<PageMeta, 'title' | 'icon'>>;

export interface ProviderCapabilities {
  write: boolean;
  move: boolean;
  delete: boolean;
  upload: boolean;
  search: boolean;
  subscribe: boolean;
}

export interface BackendMeta {
  contractVersion: number;
  capabilities: ProviderCapabilities;
  /** Workspace display name. */
  title?: string;
  /** Set when the provider serves a scoped subtree. */
  rootId?: NodeId;
}

export type ChangeEvent =
  { type: 'tree'; version: string } | { type: 'page'; id: NodeId; version: string };

export interface SearchHit {
  id: NodeId;
  title: string;
  snippet?: string;
}

export interface SaveResult {
  version: string;
  updatedAt: string;
}
