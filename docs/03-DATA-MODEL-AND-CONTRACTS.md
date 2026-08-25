# 03. Data Model and Contracts

All code in this document is normative for behavior and shape. Names are the ones to use. Where a library shapes an API (zod, Plate), verify against the installed version per `CLAUDE.md` section 4.

## 1. Core models (`packages/core/src/model.ts`)

```ts
export type NodeId = string;                          // opaque, stable, issued by the provider
export type NodeKind = 'page' | 'folder';
export type PageMode = 'read' | 'edit';

export type PageIcon =
  | { kind: 'emoji'; value: string }                  // "🧠"
  | { kind: 'lucide'; name: string };                 // "book-open"

export interface TreeNode {
  id: NodeId;
  kind: NodeKind;
  title: string;                                      // meta.title ?? first H1 ?? filename stem
  path: string;                                       // posix, relative to root: "guides/auth/index.md" | "guides/auth" (folder)
  parentId: NodeId | null;
  childIds: NodeId[];                                 // ordered, authoritative
  icon?: PageIcon;
  updatedAt?: string;                                 // ISO 8601
}

export interface TreeSnapshot { version: string; nodes: TreeNode[] }

export interface TreeIndex {
  version: string;
  rootIds: NodeId[];
  byId: Readonly<Record<NodeId, TreeNode>>;
  idByPath: Readonly<Record<string, NodeId>>;         // both "a/b.md" and "a/b" (dir form) map to the page id
}

export interface PageMeta {                           // typed subset of frontmatter; unknown keys pass through
  id?: NodeId; title?: string; icon?: string; order?: number;
  [key: string]: unknown;
}

export interface PageDocument {
  id: NodeId;
  meta: PageMeta;
  body: string;                                       // Markdown without frontmatter, LF line endings
  version: string;                                    // "sha256:<hex>" of the full file bytes
  updatedAt: string;
  eol?: 'lf' | 'crlf';                                // original line ending style, preserved on write
}

export type PageMetaPatch = Partial<Pick<PageMeta, 'title' | 'icon'>>;

export interface ProviderCapabilities {
  write: boolean; move: boolean; delete: boolean; upload: boolean; search: boolean; subscribe: boolean;
}

export interface BackendMeta {
  contractVersion: number;
  capabilities: ProviderCapabilities;
  title?: string;                                     // workspace display name
  rootId?: NodeId;                                    // when the provider serves a scoped subtree
}

export type ChangeEvent =
  | { type: 'tree'; version: string }
  | { type: 'page'; id: NodeId; version: string };

export interface SearchHit { id: NodeId; title: string; snippet?: string }
export interface SaveResult { version: string; updatedAt: string }
```

## 2. `DocumentProvider` (`packages/core/src/provider.ts`)

```ts
export interface DocumentProvider {
  readonly key: string;                               // stable identity: "http:/api/docs" | "fs:<dirName>:<handleId>" | "memory:<seedHash>"
  readonly capabilities: ProviderCapabilities;        // memory/filesystem: static; http: filled by getMeta before use
  getMeta(): Promise<BackendMeta>;
  getTree(opts?: { rootId?: NodeId }): Promise<TreeSnapshot>;
  getPage(id: NodeId): Promise<PageDocument>;
  savePage(id: NodeId, input: { body: string; baseVersion: string | null }): Promise<SaveResult>;
  updateMeta(id: NodeId, patch: PageMetaPatch, opts?: { renameFile?: boolean }): Promise<TreeNode>;   // renameFile: see 4.7
  createPage(input: { parentId: NodeId | null; title: string; index?: number }): Promise<TreeNode>;
  movePage(id: NodeId, input: { parentId: NodeId | null; index: number }): Promise<TreeNode>;
  deletePage(id: NodeId): Promise<void>;              // deletes the subtree
  assetUrl(relativePath: string, page: TreeNode): Promise<string>;   // local stores return object URLs
  uploadAsset?(pageId: NodeId, file: File): Promise<{ path: string; url: string }>;
  search?(query: string, opts?: { rootId?: NodeId; limit?: number }): Promise<SearchHit[]>;
  subscribe?(listener: (e: ChangeEvent) => void): () => void;
  dispose?(): void;                                   // revoke object URLs, close watchers
}
```

**Semantics every provider must honor** (the conformance suite checks these):
- `savePage` with `baseVersion` that does not equal the current version rejects with `ConflictError(currentVersion)`. `baseVersion: null` is allowed only for folder nodes (creates `index.md`) and returns the new page's version.
- `savePage` must not touch frontmatter except `id` assignment on first write. Body bytes are written as given, with the page's original EOL style.
- `createPage` returns the new node with `kind: 'page'`, ordered at `index` (default: last).
- `movePage` refuses a move into the node's own subtree with `ProviderError('validation')`.
- `deletePage` removes the node and all descendants; `getTree` afterwards has no orphans.
- Errors are `ProviderError` instances with a `code` from the union below. Never raw `Error`.

## 3. `FileStore` (`packages/core/src/provider.ts`)

The interface `memory` and `filesystem` implement. Any future store (Node fs, S3, Git) plugs in here and inherits all semantics.

```ts
export interface FileEntry { path: string; kind: 'file' | 'dir'; size?: number; mtime?: number }

export interface FileStore {
  readonly key: string;
  readonly readOnly: boolean;
  list(): Promise<FileEntry[]>;                               // recursive; paths posix relative; excludes dot-dirs and node_modules
  readText(path: string): Promise<string>;
  readBinary(path: string): Promise<Blob>;
  writeText(path: string, content: string): Promise<void>;    // creates parent dirs; atomic where the platform allows
  writeBinary(path: string, data: Blob | ArrayBuffer): Promise<void>;
  remove(path: string): Promise<void>;                        // recursive for dirs
  move(from: string, to: string): Promise<void>;              // file or dir; may be emulated by copy + remove
  exists(path: string): Promise<boolean>;
  stat?(path: string): Promise<FileEntry | null>;
  watch?(listener: (paths: string[]) => void): () => void;   // optional; filesystem adapter polls when absent
}
```

## 4. Filesystem semantics (`packages/core/src/fs/semantics.ts`)

`createFileStoreProvider(store, opts)` implements `DocumentProvider` over a `FileStore`. These rules are the single source of truth; an HTTP backend that wants interoperable files follows the same rules (published in `contract/HTTP-CONTRACT.md`).

### 4.1 Mapping files to nodes
- Every `*.md` file is a page. Every directory containing an `index.md` is that page's directory; the page's children are the directory's other `*.md` files and subdirectories.
- A directory without `index.md` is a `folder` node: expandable, not openable, convertible to a page.
- `README.md` is treated as `index.md` when `index.md` is absent (read only; new writes use `index.md`).
- Hidden entries (`.` prefix), `node_modules`, and non-`.md` files are not nodes. Non-`.md` files are assets reachable through `assetUrl`.
- Path forms in `idByPath`: for `guides/auth/index.md` register `guides/auth/index.md`, `guides/auth`, `guides/auth/`. For `guides/intro.md` register `guides/intro.md` and `guides/intro`.

### 4.2 Identity
- Page id: frontmatter `id` if present and unique; otherwise `pathHashId(path)` (`h_` + fnv1a64 hex) until the first write, when a fresh `generateId()` (ULID-style, 26 chars Crockford base32) is written into frontmatter. Read-only stores keep path hashes.
- Duplicate `id` across files: the first in walk order keeps it, later ones get path hashes and a `provider.warnings` entry surfaced through `onEvent({ type: 'warning' })`.
- Folder id: `f_` + fnv1a64 hex of the directory path. Folder → page conversion writes that same id into the new `index.md`.

### 4.3 Title
`meta.title` → else the first top-level `# H1` in the body (not stripped) → else filename stem (`index.md` uses the directory name), humanized (`auth-flow` → `Auth flow`).

### 4.4 Ordering among siblings
1. Nodes with `meta.order` ascending (numbers, ties by filename natural sort).
2. Then nodes without `order`, natural sort by filename; folders after pages within this group.
`createPage` at index `i`: `order = midpointOrder(prev, next)` (steps of 10 at the ends). `movePage` writes only the moved page's `order`; if a midpoint is not representable (precision), renumber the target's siblings in steps of 10 (writes N files; `onEvent({ type: 'tree:renumbered' })`). Folders cannot carry `order`; moving a folder is done by moving its directory and it sorts in the unordered group.

### 4.5 Create
- Slug from title: NFKD fold to ASCII, lowercase, non-alphanumerics to `-`, collapse, trim, max 64 chars, `-2`, `-3` on collision. Empty title → `untitled`.
- Under a `folder` node: write `<dir>/<slug>.md`.
- Under a page with a directory (`x/index.md`): write `x/<slug>.md`.
- Under a leaf page `x.md`: convert it to `x/index.md` (move, id preserved), then write `x/<slug>.md`.
- At root: `<slug>.md`.
- New file content: frontmatter `{ id, title }` (plus `order` when placed at an index) and an empty body.

### 4.6 Move
- Target page directory computed by the same rules as create. File or directory moves on disk. Ids are stable because they live in frontmatter. The returned node and the refreshed tree carry new paths. Moving into own subtree is rejected.
- If the moved page is a leaf `x.md` and the target is its current parent, only `order` changes (no file move).

### 4.7 Rename and icon
`updateMeta` writes `title` and `icon` into frontmatter. By default files are not renamed on title change (the slug stays; links from other files keep working). Two exceptions rename the file (or its directory for `index.md` pages) to `slugify(title)` with collision suffixes, keeping the id:
1. `opts.renameFile === true`, which the UI passes only while a page is **fresh**: created in this session, body still empty, file still named `untitled*.md`. This is how "New page → type a title" yields `auth-flow.md` instead of `untitled-3.md`.
2. Provider option `renameFilesOnTitleChange: true` (host policy, default false), which renames on every title change and rewrites relative links in other pages that point at the old path (P4 optional; until implemented the option is rejected with `unsupported`).
`createPage` with an empty or missing title writes `untitled.md` (`untitled-2.md`, …) with `title: Untitled` in frontmatter.

### 4.8 Delete
Removes the file, and for a page with a directory the whole directory. No trash. The UI confirms with `descendantCount`.

### 4.9 Versions
`version = "sha256:" + hex(sha256(fileBytes))` computed on read and after write. `TreeSnapshot.version = fnv1a64` over the ordered list of `(path, id, title, icon, order, kind)`. Both are strings; the http adapter quotes them for `ETag`/`If-Match` and unquotes on receipt.

### 4.10 Assets
`assetUrl(rel, page)` resolves `rel` against the page's directory (`dirname(path)` for `index.md`, otherwise the file's directory), rejects traversal above root, and returns an object URL for local stores (cached per path+mtime, revoked on `dispose`) or `<baseUrl>/assets/<path>` for http.

### 4.11 Index cache (filesystem adapter only)
`list()` on 5k files is fine; reading 5k frontmatters is not. The adapter keeps `docs:<ns>:index` in IndexedDB: `path → { size, mtime, meta, firstH1 }`. On `getTree` it stats entries, re-reads only changed or new files, and rebuilds the snapshot. Full re-read on cache schema change.

## 5. Frontmatter rules (`packages/core/src/frontmatter.ts`)

- Delimiters: file starts with `---\n`, ends at the next line that is exactly `---`. CRLF accepted; `eol` recorded.
- Parser: `yaml` package, core schema, no custom tags, size cap 64 KB (larger → `validation` error).
- Known keys: `id: string`, `title: string`, `icon: string` (`"🧠"` or `"lucide:book-open"`), `order: number`. Everything else is preserved as parsed and re-serialized in original key order. Comments are not preserved (documented limitation).
- `joinFrontmatter(meta, body, eol)` emits `---`, YAML with `yaml`'s default style, `---`, blank line, body. Body written verbatim.
- A file without frontmatter gets frontmatter only on first write, prepended.

## 6. Link resolution (`packages/core/src/links.ts`)

`resolvePageLink(currentPath, href, idByPath): NodeId | null` handles `./auth.md`, `../x/index.md`, `x/`, `x`, `/guides/auth.md` (root-absolute), strips `#fragment` and `?query` (fragment returned separately for in-page scroll), percent-decodes, normalizes `..`. Anything with a scheme or `//` returns `null`.

## 7. Errors (`packages/core/src/errors.ts`)

```ts
export type ProviderErrorCode = 'not_found' | 'conflict' | 'forbidden' | 'validation' | 'unsupported' | 'network' | 'quota' | 'internal';
export class ProviderError extends Error { constructor(public code: ProviderErrorCode, message: string, public details?: unknown) }
export class ConflictError extends ProviderError { constructor(public currentVersion: string) }
export class StorageQuotaError extends ProviderError { code = 'quota' }
```

## 8. Zod contract (`packages/core/src/contract/schemas.ts`)

Schemas for every wire type above: `PageIconSchema`, `TreeNodeSchema`, `TreeSnapshotSchema`, `PageMetaSchema` (loose object), `PageDocumentSchema`, `SavePageInputSchema`, `SaveResultSchema`, `PageMetaPatchSchema`, `CreatePageInputSchema`, `MovePageInputSchema`, `SearchHitSchema`, `CapabilitiesSchema`, `BackendMetaSchema`, `ErrorSchema` (`{ error: { code, message, currentVersion?, details? } }`). Validate: http adapter responses, fixtures, playground remote mode. Do not validate inside React components.

## 9. HTTP contract (for future backends; implemented client-side by the `http` adapter)

Base path host-defined, default `/api/docs`.

```
GET    /meta                        → BackendMeta
GET    /tree?root=                  → TreeSnapshot                      ETag: "<tree version>"
GET    /pages/:id                   → PageDocument                      ETag: "<version>"
PUT    /pages/:id  If-Match: "<v>"  { body }  → 200 SaveResult | 201 SaveResult (folder conversion, no If-Match)
                                              | 409 { error: { code: "conflict", currentVersion } } | 412 (If-Match missing on existing page)
PATCH  /pages/:id                   { title?, icon? }                   → TreeNode
POST   /pages                       { parentId, title, index? }         → 201 TreeNode
POST   /pages/:id/move              { parentId, index }                 → TreeNode
DELETE /pages/:id                   → 204
GET    /assets/*path                → bytes with content type
POST   /pages/:id/assets            multipart { file }                  → 201 { path, url }     capabilities.upload
GET    /search?q=&root=&limit=      → SearchHit[]                       capabilities.search
GET    /events                      → text/event-stream of ChangeEvent  capabilities.subscribe
```

Rules: JSON carries versions bare, headers quoted; errors always use the envelope; unsupported operations return 405 with `code: "unsupported"` and are never called because `capabilities` gate them; a `contractVersion` major above `CONTRACT_VERSION` makes the UI show the version-gap card instead of half-working. Adapter options: `baseUrl`, `fetch`, `headers()` (sync or async), `credentials`, `rootId`, `events: 'sse' | 'poll' | 'none'`, `pollIntervalMs`.

## 10. Conformance suite (`packages/core/src/testing/conformance.ts`)

`runProviderConformance(makeProvider: () => Promise<DocumentProvider>, opts)` registers Vitest cases. Runs against: memory (unit), filesystem over an in-memory `FileSystemDirectoryHandle` polyfill (unit) and over real OPFS (Playwright), http over `msw` handlers that implement the contract in-process (unit). Cases:

meta shape and capabilities; tree loads, no orphans, no duplicate ids, `idByPath` covers all forms; page read has version and LF body; save with correct base → new version, file diff is body-only; save with stale base → `ConflictError` with `currentVersion`; save with null base on folder → 201 semantics, kind flips to page, id preserved; create root / child of folder / child of directory page / child of leaf page (conversion, id preserved) / slug collision `-2`; move between parents updates paths and keeps ids; move into own subtree rejected; move within parent changes only `order`; delete subtree; updateMeta writes title and icon without touching body; unknown frontmatter keys and key order preserved across save; `order` renumbering on precision loss; asset resolution and traversal rejection; unsupported capability methods absent or rejecting with `unsupported`; search when advertised.
