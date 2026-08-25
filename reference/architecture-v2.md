# Docs Module: Generic Notion-like Markdown Editor for React

**Status:** Architecture v2 (final for this phase)
**Date:** 2026-08-25
**What it is:** A standalone, host-agnostic React module (packages, not an app) that gives any application a Notion-like sidebar + Markdown page editor over a small HTTP contract. Backends can be Laravel, Node, or anything that implements the contract.
**Principle:** Simplest thing with clean boundaries. Every abstraction below removes a known failure mode of embeddable modules, not a hypothetical one.

---

## 0. What changed since v1, and why

| Change | Reason |
|---|---|
| Monorepo with `core`, `react`, `server-node`, `contract-tests` packages and a `playground` app | Multiple consuming apps are now a stated requirement. v1's own trigger for extraction ("a second consumer exists") has fired |
| No design-system dependency. The module ships its own shadcn (Base UI) primitives internally and reads the standard shadcn CSS variable contract | The module must drop into any host; it cannot assume a specific UI package |
| Distribution: built ESM + types, Tailwind classes preserved, hosts add one `@source` line; precompiled fallback CSS for non-Tailwind hosts | Source-only packages break non-Vite hosts; unscoped precompiled Tailwind breaks every host |
| Backend contract promoted to a first-class artifact: zod schemas → generated OpenAPI, a conformance CLI, a reference Node backend, a Laravel implementation guide | Two backend stacks must agree on one spec, and the spec must be testable |
| `GET /meta` endpoint reporting contract version and capabilities | One frontend build must work against a read-only Laravel backend and a full Node backend |
| Instance namespacing (`instanceId`, `storageKey`) for query keys, stores and localStorage | Two hosts on one origin, or two module instances on one page, must not collide |
| Fidelity check upgraded from string compare to AST compare (`exact` / `reformat` / `lossy`) | v1 would have flagged harmless bullet-style differences as data loss |
| Asset and internal-link resolution added (`provider.assetUrl`, `idByPath`, in-app navigation for `./page.md` links) | Docs-as-code content is full of relative links and images; without this the module feels broken on day one |
| `uploadAsset` and `search` as optional provider capabilities with UI that hides when absent | Different hosts will implement different subsets |
| Folder-to-page conversion, subtree delete, and move semantics specified precisely, including ETag quoting | Interop bugs between backends live in these details |
| Keyboard path into edit mode, responsive sidebar drawer, `guardUnload` switch, `onEvent` hook, `strings` override | Embedding in unknown hosts needs these; v1 assumed one desktop app |

---

## 1. Decisions at a glance

| Decision | Choice | One-line why |
|---|---|---|
| Canonical format | Markdown files: YAML frontmatter + GFM body | Docs-as-code, git-diffable, AI-readable. Plate JSON is a transient runtime view |
| Editor | Plate v53 (`platejs`, `@platejs/*`) + Plate UI registry components | Verified two-way Markdown, static/view renderers, chunked rendering for large docs |
| Read mode | One `<Plate>` with `readOnly` toggled (app); `<PlateView>` for read-only embeds | Click-to-edit without remount; embeds get the small bundle |
| Tree data shape | Flat normalized index (`byId`, ordered `childIds`, `rootIds`, `idByPath`) | O(1) lookups, per-node immutable patches, in-app link resolution |
| Identity | Opaque stable `id` persisted in frontmatter by the backend; `path` is an attribute | Rename/move cannot break routes, cache keys, expanded state |
| Tree UI | headless-tree + TanStack Virtual | ARIA tree, keyboard nav, rename, DnD, flat rows built for virtualization |
| Server state | TanStack Query over a `DocumentProvider` interface | Cache, dedupe, optimistic patches, loading/error for free; backend swap = one adapter |
| UI state | Zustand (persisted, namespaced) for sidebar; Zustand (memory) for save sessions; local state otherwise; Context for DI only | Selective subscriptions; no god-store |
| Editor state | Owned by Plate; `onChange` marks dirty + schedules save | Never mirror keystrokes into a store |
| Saving | Debounced autosave (1.5 s idle) + flush on blur/route/hide/Cmd+S; dirty-only; `If-Match` version check | Notion feel, no write storms, no accidental reformatting |
| Routing | Router-agnostic module via a `DocsNavigation` adapter; playground uses TanStack Router | Each host brings its own router (Inertia, TanStack, React Router) |
| Packaging | pnpm monorepo: `@docs/core`, `@docs/react`, `@docs/server-node`, `@docs/contract-tests`, `apps/playground` | Logic shared by frontend and Node backend; contract testable against any backend |
| Styling | Tailwind v4 classes, shadcn CSS variable contract, no preflight; Plate UI (Radix) scoped inside the editor entry | Works in Tailwind hosts with one line; fallback CSS for the rest |
| Frontmatter | Backend-owned at runtime; frontend receives `{ meta, body }`; the parser lives in `core` so Node backends and fixtures share it | Frontend never re-serializes YAML |

Rename the `@docs/*` scope to your org scope; nothing else depends on the name.

---

## 2. Scope, constraints, assumptions

**Functional (v1 of the module):** hierarchical sidebar; open a page in read or edit mode; edit with Plate's block set; save Markdown; page icon (emoji or Lucide); create, rename, move, delete pages; collapsible and resizable sidebar; persisted expand state; active page; internal links and relative images; title search when the backend supports search.

**Non-functional:** thousands of tree nodes; documents up to a few thousand blocks; instant page switch from cache; imperceptible typing latency; embeddable in a Laravel (Inertia or Blade + Vite) host, a Node/Vite host, and a future canvas app; a read-only embed must not pay for the editor bundle.

**Constraints:** React 18.3+ or 19, TypeScript, Tailwind v4 in hosts (fallback CSS otherwise), Plate, docs live as `.md` files on a backend you may write in Laravel or Node. Small team driving an AI coding harness.

**Assumptions:**
1. Every node is a page (Notion model). A directory maps to a page whose body is `<dir>/index.md`. A directory without `index.md` is a `folder` node: expandable, not openable, convertible to a page.
2. Content is trusted (your own docs). Untrusted content is a documented later step (Section 20).
3. One active editor per page per user. Conflicts come from external edits (git pull, second tab). Version check, not CRDT.
4. Authentication is the host's job. The module sends whatever headers or cookies the host's adapter supplies.

---

## 3. Repository and package architecture

```
docs-module/                      pnpm workspace, Changesets, (Turborepo optional)
  packages/
    core/           @docs/core            no React, no DOM. Models, zod contract, tree ops, frontmatter,
                                          Markdown codec (headless Plate base plugins), fidelity check, errors
    react/          @docs/react           hooks, DocsProvider, PageTree, DocumentEditor, DocumentView, DocsShell,
                                          session, stores, adapters (memory, http). Built ESM + d.ts
    server-node/    @docs/server-node     reference backend (Hono) over a folder. Implements the contract.
                                          Used by playground, e2e, conformance suite. Template for Laravel
    contract-tests/ @docs/contract-tests  conformance CLI: `docs-contract --base-url http://host/api/docs`
  apps/
    playground/     the standalone Notion-like app (Vite + TanStack Router). Dogfooding, e2e, demo, docs
  contract/
    openapi.json    generated from zod schemas in core (script: `pnpm contract:gen`), committed
    LARAVEL.md      implementation guide for a Laravel backend (ETag/If-Match, YAML, atomic writes, ULIDs)
  fixtures/
    corpus/         real-world Markdown samples: golden tests, conformance, perf generators
```

**Why `core` is separate from `react`:** the Node backend and the frontend share the contract schemas, the frontmatter parser, tree utilities, and the codec (for a server-side "doctor" scan and migrations). Shared code with two consumers is a package; shared code with one consumer is a folder.

**Why a reference Node backend from day one:** "backend may be Laravel or Node" means the contract must be executable. The reference implementation is the executable spec; the conformance CLI proves a Laravel implementation matches it.

**Package exports (`@docs/react`):**

```jsonc
{
  "exports": {
    ".":                 "./dist/index.js",            // DocsProvider, hooks, types, createKeys
    "./tree":            "./dist/tree/index.js",       // PageTree
    "./editor":          "./dist/editor/index.js",     // DocumentEditor (heavy: Plate + kits)
    "./view":            "./dist/view/index.js",       // DocumentView (PlateView, light)
    "./shell":           "./dist/shell/index.js",      // DocsShell: the Notion layout, optional
    "./adapters/http":   "./dist/adapters/http.js",
    "./adapters/memory": "./dist/adapters/memory.js",
    "./styles.css":      "./dist/styles.css",          // component styles (editor base, prose spacing), no preflight
    "./theme.css":       "./dist/theme.css"            // default shadcn variables scoped to .docs-root; opt-in
  },
  "sideEffects": ["*.css"]
}
```

Subpaths matter: a read-only help drawer imports `./view` and `./tree` and never downloads the editor.

**Distribution and styling.**
- Build with tsup (or Vite library mode) to ESM + `.d.ts`. Tailwind class strings survive the build untouched.
- Tailwind hosts (all of yours): add `@source "../node_modules/@docs/react/dist";` to their CSS entry. Their Tailwind compiles the module's classes; the module reads the host's shadcn variables (`--background`, `--foreground`, `--muted`, `--accent`, `--border`, `--ring`, `--radius`, and friends). Zero theme work.
- Hosts without shadcn variables: import `@docs/react/theme.css` (defaults scoped to `.docs-root`, light and `.dark`).
- Hosts without Tailwind: import `@docs/react/styles.css` built with all used utilities, no preflight, wrapped in `@scope (.docs-root)`. Supported, not the primary path.
- Every module root element carries `.docs-root`. Nothing in the module styles `html`, `body`, or bare tags.
- Plate UI components (Radix-based) and the module's own shadcn primitives (Base UI) live inside the package and are not exported. They coexist without conflict.

**Peer vs bundled dependencies.**
- Peers: `react`, `react-dom`, `@tanstack/react-query` (^5), `platejs` and the `@platejs/*` plugins the kits use (^53). Peers because a host that already uses Plate must not get a second Slate instance, and Query must share one client with the host.
- Bundled: `@headless-tree/*`, `@tanstack/react-virtual`, `zustand`, `zod` (v4), `frimousse`, `lucide-react` (per-icon imports), `remark-gfm`, `yaml` (core only).
- pnpm auto-installs peers by default; document the `pnpm add` line per host type.

**Versioning.** Changesets, semver per package, one `CHANGELOG` per package. The contract has its own integer version reported by `GET /meta`; the frontend refuses to run against a higher major than it knows.

---

## 4. Runtime architecture inside `@docs/react`

```
┌───────────────────────────────────────────────────────────────────────┐
│ shell/        DocsShell: sidebar + content layout, header, banners    │ optional, composable
├───────────────────────────────────────────────────────────────────────┤
│ tree/         PageTree      editor/ DocumentEditor    view/ DocumentView│ reusable React
│ data/         DocsProvider, queries, mutations, session, stores        │
├───────────────────────────────────────────────────────────────────────┤
│ @docs/core    models, contract, tree ops, codec, frontmatter, errors   │ no React, no DOM
├───────────────────────────────────────────────────────────────────────┤
│ adapters/     memory, http   (implement DocumentProvider from core)    │ swappable I/O
└───────────────────────────────────────────────────────────────────────┘
                 imports flow downward only
```

**Dependency rules (ESLint boundaries, CI-enforced):**
- `core` imports no other workspace package. It may import `platejs` base entry points and `@platejs/markdown`, never `/react` subpaths.
- `data`, `tree`, `editor`, `view` import `core` and the internal `ui/` primitives. Never each other. `shell` imports all of them.
- `adapters` import `core` only.
- Only `editor` and `view` import `platejs*`. Only `tree` imports `@headless-tree/*`.
- Nothing in the package reads `window.location`, `document.title`, or global CSS.

---

## 5. Folder structure

```
packages/core/src/
  model.ts            NodeId, TreeNode, TreeIndex, PageMeta, PageDocument, PageIcon, capabilities
  contract/
    schemas.ts        zod schemas for every wire type (source of truth)
    openapi.ts        schema → OpenAPI generator (build script)
    version.ts        CONTRACT_VERSION = 1
  tree.ts             buildIndex, ancestorsOf, isDescendant, applyRename/Meta/Insert/Move/Remove
  frontmatter.ts      splitFrontmatter, joinFrontmatter (yaml), known keys, id/order helpers
  icon.ts             parseIcon / formatIcon  ("🧠" | "lucide:book-open")
  codec/
    base-kit.ts       Base* Plate plugins + Markdown config (no React)
    codec.ts          markdownToValue, valueToMarkdown
    fidelity.ts       classifyFidelity: exact | reformat | lossy (+ reasons)
  errors.ts           ProviderError, ConflictError
  links.ts            resolvePageLink(currentPath, href, idByPath)
  index.ts

packages/react/src/
  data/
    DocsProvider.tsx  Context { provider, navigation, instanceId, strings, onEvent }; QueryClient fallback
    keys.ts           createKeys(instanceId)
    queries.ts        treeQuery, pageQuery, useTreeIndex, usePage, useMeta
    mutations.ts      useSavePage, useUpdateMeta, useCreatePage, useMovePage, useDeletePage
    session.ts        session store (zustand, memory) + useDocumentSession
    sidebar-store.ts  zustand + persist, key `docs:<instanceId>:sidebar`, SSR-safe storage
    strings.ts        DocsStrings defaults (English)
  tree/               PageTree, PageTreeRow, IconGlyph
  editor/
    plugins/          editor-kit.ts (React plugins on top of core base-kit), markdown-kit.ts
    ui/               Plate UI registry output (node components, toolbars, slash menu, link, image)
    DocumentEditor.tsx
  view/               DocumentView (PlateView + static node components)
  shell/              DocsShell, Sidebar, PageHeader, Banners, IconPicker, EmptyStates, CommandPalette
  ui/                 internal shadcn primitives on Base UI (button, popover, menu, dialog, tooltip, input,
                      scroll-area, skeleton, command). Not exported
  adapters/
    memory.ts         createMemoryProvider(seed)
    http.ts           createHttpProvider({ baseUrl, fetch, headers, credentials })
  styles.css, theme.css
  index.ts (+ one index.ts per subpath entry)

packages/server-node/src/
  app.ts              Hono app: routes from contract, ETag/If-Match, JSON errors
  fs-store.ts         walk, read, atomic write, slug, ordering, id assignment
  watcher.ts          chokidar → SSE (optional)
  cli.ts              `docs-server --root ./docs --port 4010`, `docs-server doctor`, `docs-server ids`

packages/contract-tests/src/
  run.ts              CLI: creates `__contract-<run>` subtree, exercises every endpoint, cleans up
  cases/              tree, page, save, conflict, meta, create, move, delete, folder-conversion, search?

apps/playground/src/
  main.tsx, router.tsx, routes/, navigation-adapter.ts, App.tsx (composes DocsShell)
```

---

## 6. Core domain models (TypeScript)

```ts
// packages/core/src/model.ts
export type NodeId = string;                     // opaque, stable, issued by the provider
export type NodeKind = 'page' | 'folder';
export type PageMode = 'read' | 'edit';

export type PageIcon =
  | { kind: 'emoji'; value: string }             // "🧠"
  | { kind: 'lucide'; name: string };            // "book-open"

export interface TreeNode {
  id: NodeId;
  kind: NodeKind;
  title: string;                                 // frontmatter.title ?? first H1 ?? filename
  path: string;                                  // posix, relative to docs root: "guides/auth/index.md"
  parentId: NodeId | null;
  childIds: NodeId[];                            // ordered; authoritative
  icon?: PageIcon;
  updatedAt?: string;                            // ISO 8601
}

export interface TreeSnapshot { version: string; nodes: TreeNode[] }          // wire

export interface TreeIndex {                                                  // in-memory
  version: string;
  rootIds: NodeId[];
  byId: Readonly<Record<NodeId, TreeNode>>;
  idByPath: Readonly<Record<string, NodeId>>;    // for internal link resolution
}

export interface PageMeta {                      // typed subset of frontmatter; unknown keys pass through
  id?: NodeId;
  title?: string;
  icon?: string;                                 // raw form: "🧠" | "lucide:book-open"
  order?: number;
  [key: string]: unknown;
}

export interface PageDocument {
  id: NodeId;
  meta: PageMeta;
  body: string;                                  // Markdown WITHOUT frontmatter
  version: string;                               // content hash; echoed back as baseVersion
  updatedAt: string;
}

export type PageMetaPatch = Partial<Pick<PageMeta, 'title' | 'icon'>>;

export interface ProviderCapabilities {
  write: boolean; move: boolean; delete: boolean; upload: boolean; search: boolean; subscribe: boolean;
}

export interface BackendMeta {                   // GET /meta
  contractVersion: number;
  capabilities: ProviderCapabilities;
  title?: string;                                // workspace display name
  rootId?: NodeId;                               // when the backend serves a scoped subtree
}
```

```ts
// packages/core/src/contract/schemas.ts   (zod v4; source of truth for openapi.json)
export const PageIconSchema = z.union([
  z.object({ kind: z.literal('emoji'), value: z.string().min(1) }),
  z.object({ kind: z.literal('lucide'), name: z.string().min(1) }),
]);
export const TreeNodeSchema = z.object({
  id: z.string().min(1), kind: z.enum(['page', 'folder']), title: z.string(), path: z.string(),
  parentId: z.string().nullable(), childIds: z.array(z.string()),
  icon: PageIconSchema.optional(), updatedAt: z.string().optional(),
});
export const TreeSnapshotSchema = z.object({ version: z.string(), nodes: z.array(TreeNodeSchema) });
export const PageMetaSchema = z.looseObject({
  id: z.string().optional(), title: z.string().optional(), icon: z.string().optional(), order: z.number().optional(),
});
export const PageDocumentSchema = z.object({
  id: z.string(), meta: PageMetaSchema, body: z.string(), version: z.string(), updatedAt: z.string(),
});
export const SavePageInputSchema = z.object({ body: z.string() });
export const SavePageResultSchema = z.object({ version: z.string(), updatedAt: z.string() });
export const CreatePageInputSchema = z.object({ parentId: z.string().nullable(), title: z.string().min(1), index: z.number().int().optional() });
export const MovePageInputSchema = z.object({ parentId: z.string().nullable(), index: z.number().int() });
export const ErrorSchema = z.object({ error: z.object({
  code: z.enum(['not_found', 'conflict', 'forbidden', 'validation', 'unsupported', 'internal']),
  message: z.string(), currentVersion: z.string().optional(), details: z.unknown().optional(),
}) });
export const BackendMetaSchema = z.object({
  contractVersion: z.number().int(), capabilities: CapabilitiesSchema, title: z.string().optional(), rootId: z.string().optional(),
});
```

Validate at adapter boundaries (HTTP responses, fixtures) and in the Node backend's request handlers. Inside the React package, trust the types.

---

## 7. Tree schema, index, lookups, caching

**Shape.** A tree stored flat: `byId`, ordered `childIds`, `rootIds`, `parentId`, plus `idByPath`. Both directions O(1).

**Why not nested objects:** a deep rename forces cloning the ancestor chain and the sidebar re-renders wholesale. Flat: a rename replaces one object.

**Why not let headless-tree own the data:** it reads through `dataLoader` callbacks; the Query cache stays the single source of truth.

```ts
// packages/core/src/tree.ts   (pure, immutable, unit-tested)
export function buildIndex(snapshot: TreeSnapshot): TreeIndex;
export function ancestorsOf(index: TreeIndex, id: NodeId): NodeId[];
export function isDescendant(index: TreeIndex, id: NodeId, maybeAncestor: NodeId): boolean;
export function descendantCount(index: TreeIndex, id: NodeId): number;      // delete confirmation
export function applyRename(index: TreeIndex, id: NodeId, title: string): TreeIndex;
export function applyMeta(index: TreeIndex, id: NodeId, patch: Partial<TreeNode>): TreeIndex;
export function applyInsert(index: TreeIndex, node: TreeNode, parentId: NodeId | null, at: number): TreeIndex;
export function applyMove(index: TreeIndex, id: NodeId, parentId: NodeId | null, at: number): TreeIndex;   // paths stale until refetch
export function applyRemove(index: TreeIndex, id: NodeId): TreeIndex;       // removes subtree
```

**Paths vs IDs.** `id` everywhere in the frontend. `path` is for display, link resolution, and the backend's filesystem work. The backend writes `id` into frontmatter on first write (or in one commit via the `ids` command). Folder nodes get `id = hash(path)` until converted to pages, at which point the backend writes that same id into the new `index.md`, so it stays stable.

**Loading.** Whole index in one request. 5,000 nodes ≈ 80 KB gzipped. Optional `rootId` scoping (`GET /tree?root=`) lets an embed load only its subtree. Lazy `getChildren` is deliberately not in the contract; add it when a backend reports >20k nodes.

**Lookups.** Node: `byId[id]`. Children: `childIds`. Ancestors: walk `parentId`. Internal link: `resolvePageLink(currentPath, href, idByPath)` normalizes `./auth.md`, `../x/index.md`, and `x/` forms. Title search: linear scan over `byId` values, fine to ~50k.

**What is cached.**

| Cache | Key | Holds | staleTime / gcTime |
|---|---|---|---|
| TanStack Query | `[ns,'meta']` | `BackendMeta` | Infinity (refetch on reconnect) |
| TanStack Query | `[ns,'tree', rootId]` | `TreeIndex` | 30 s / 24 h |
| TanStack Query | `[ns,'page', id]` | `PageDocument` | 5 min / 30 min |
| Module LRU (20) | `${ns}:${id}:${version}` | parsed Plate `Value` + fidelity | evict LRU |
| localStorage | `docs:<instanceId>:sidebar` | collapsed, width, expanded, lastOpenedPageId | forever |

`ns = ['docs', instanceId]`. Two instances or two apps on one origin cannot collide.

**Invalidation / update.** Mutations patch the tree cache optimistically with the pure `apply*` functions, roll back on error, then `invalidateQueries(tree)` on settle so backend truth (including new paths after a move) wins. External changes arrive via refetch-on-focus now and `provider.subscribe` (SSE) later; the session ignores events whose version equals the one it just wrote, which prevents save → watcher → refetch loops.

**Avoiding full rerenders.** `PageTree` is the single subscriber to the tree query and to `expanded`. On change it renders once; headless-tree recomputes the visible flat list; the virtualizer keeps ~40 rows mounted; `PageTreeRow` is `React.memo` receiving primitive props. Active-page changes touch two rows. Per-row Query subscriptions are a documented fallback if profiling ever demands it.

---

## 8. Markdown ↔ Plate data flow

```
file.md ─backend─► { meta, body, version } ─HTTP/JSON─► Query cache [ns,'page',id]
                                                              │
                                     markdownToValue(body) + classifyFidelity   (LRU by ns:id:version)
                                                              │
                                                  Plate editor owns state
                                                              │ onChange → dirty + 1.5 s debounce
                                              valueToMarkdown(editor.children)
                                                              │
        provider.savePage(id, { body, baseVersion }) ─► PUT + If-Match ─► backend merges frontmatter, atomic write
```

**Frontmatter.** Backend-owned at runtime. `@docs/core/frontmatter` (`yaml` package) is what the Node backend, fixtures, and the memory adapter use; Laravel reimplements the same rules with `symfony/yaml`. Rules: known keys `id`, `title`, `icon`, `order`; everything else preserved; key order preserved; comments are not preserved (documented limitation of both YAML libraries; keep frontmatter comment-free). Title resolution: `title` key, else the first H1 (the backend does not strip it), else filename. Run the `ids` command once to write ids and migrate leading H1s into `title` in a single commit.

**Codec (headless, one instance, no DOM), in `core`:**

```ts
// packages/core/src/codec/codec.ts
import { createSlateEditor, type Value } from 'platejs';
import { BaseKit } from './base-kit';               // Base* plugins + Markdown config; no '/react' imports

const editor = createSlateEditor({ plugins: BaseKit });

export function markdownToValue(body: string, onError?: (e: Error) => void): Value {
  return editor.api.markdown.deserialize(body, { onError });
}
export function valueToMarkdown(value: Value): string {
  return editor.api.markdown.serialize({ value });
}
```

```ts
// packages/core/src/codec/fidelity.ts
export type Fidelity = { level: 'exact' | 'reformat' | 'lossy'; reasons: string[] };

export function classifyFidelity(body: string, value: Value): Fidelity {
  const out = valueToMarkdown(value);
  if (normalizeNewlines(out) === normalizeNewlines(body)) return { level: 'exact', reasons: [] };
  const a = mdast(body), b = mdast(out);           // same remark stack Plate uses, positions stripped
  const reasons = findLossyNodes(a);               // html, footnoteDefinition, unknown types, definitions
  const level = reasons.length === 0 && deepEqual(a, b) ? 'reformat' : 'lossy';
  return { level, reasons };
}
```

`reformat` means only surface syntax changes (bullet style, emphasis markers, wrapping): no banner, or a subtle note. `lossy` means information would be dropped: banner before the first edit, and the page never saves unless edited. Cost: one serialize plus two parses per open; milliseconds for normal docs. The `server-node doctor` command runs the same function across a whole corpus and prints a report; run it before adopting the module on an existing repository.

**Markdown configuration decisions.**
- `remark-gfm` on. `remark-math` off unless a host enables it (kit option).
- `remarkMdx` OFF. Plate's default `MarkdownKit` includes it for Plate's MDX custom elements; on plain docs it throws on HTML that is not valid JSX. No custom elements exist here.
- `remarkStringifyOptions` pinned: `bullet: '-'`, `emphasis: '*'`, `strong: '*'`, `fences: true`, `rule: '-'`, `listItemIndent: 'one'`. Overridable per host to match their markdownlint config.
- `preserveEmptyParagraphs: true` both ways.
- Lists: Plate's indent-based `ListKit` (Notion-style Tab nesting). Golden tests cover nested and mixed lists; fall back to `list-classic` only on measured fidelity problems.

**Unsupported constructs: data-loss policy.**
- Known: Plate drops raw HTML by default; unknown mdast node types fall back to unknown types. Lossy for `<details>`, `<img width>`, HTML comments, footnotes without the footnote plugin; reference-style links are rewritten inline (`reformat`, not `lossy`).
- v1: detect and warn; never save unedited pages.
- v2: `raw_html` passthrough block (deserialize rule for mdast `html` → void block holding the source; serialize rule emitting it verbatim; read-only mono component). Built when the doctor report says a corpus needs it.
- Never: chase every Notion block. Block set: paragraph, h1-h3, blockquote, hr, bold/italic/underline/strikethrough/code marks, bullet/numbered/todo lists, code block with language, table, link, image, toggle.

**Links and assets.**
- Link click in read mode: if `resolvePageLink` finds a page id, call `navigation.navigate`; else open normally with `rel="noopener noreferrer"`.
- Image `src` relative to the page: rewritten at render time through `provider.assetUrl(relativePath, page)`; the HTTP adapter maps to `GET /assets/<path>`. The Markdown on disk is never rewritten.
- Image insertion in v1: paste or type a URL/relative path. Upload appears only when `capabilities.upload` is true (`provider.uploadAsset`), phase 4.

**Read-only rendering: two components, one plugin base.**
- Editing hosts: one `<Plate>` per page with `readOnly={mode === 'read'}`. Click on content (or press `E` / Enter on the focused content region, or the mode toggle) → edit mode in place; Escape → read. No remount, no re-parse, no scroll jump.
- Read-only hosts (help drawers, previews, canvas cards): `DocumentView` on `<PlateView>` with static node components, imported from `@docs/react/view`. Same base kit, no editor bundle.

**Editing and saving.** `useDocumentSession(page)` owns the write path: latest value in a ref, status in the session store, 1.5 s idle debounce, flush on editor blur, `visibilitychange` hidden, navigation, unmount, Cmd/Ctrl+S; `beforeunload` guard when dirty (`guardUnload` prop, default on). Save sends `{ body }` with `If-Match: "<baseVersion>"`. Success patches the page query and the tree node's `updatedAt`; no refetch. 409 → status `conflict`, cache untouched, banner offers Reload or Overwrite. If the page query refreshes with a new version while the session is clean, `editor.tf.setValue(newValue)`; if dirty, conflict banner.

**Large documents.** Plate's June 2026 benchmark opens a 10,000-block document in ~0.9 s and types at ~35 ms with chunked rendering on; enable it. One soft threshold (5k top-level blocks): open read-only with "Large page: edit anyway". No editor virtualization.

**Preventing unnecessary conversions.** Parse once per `ns:id:version`. Serialize on save only. Fidelity once per open. Nothing converts to HTML anywhere.

---

## 9. State management

| State | Lives in | Why there |
|---|---|---|
| Active page id, `mode` | The host's URL, reached only through `DocsNavigation` | Shareable, back button, deep links; the module never touches the router |
| Backend meta, tree index, page documents, mutations | TanStack Query (namespaced keys) | Server state: caching, dedupe, staleness, optimistic patches, loading and error |
| Sidebar collapsed, width, `expanded` record, last opened page | Zustand + `persist`, key `docs:<instanceId>:sidebar`, SSR-safe storage | Read by many components, survives reload, per-key selectors |
| Per-page session: status, fidelity, `lastSavedVersion` | Zustand (memory), keyed by `instanceId:pageId` | Header and sidebar read it; must outlive the editor mount to flush on navigation |
| Editor content, selection, history | Plate editor instance | Plate is the store |
| Rename text, open menus, dialogs, hover, drawer open | Local `useState` | Ephemeral, single owner |
| `provider`, `navigation`, `strings`, `onEvent`, `instanceId` | React Context (DI only) | Values never change at runtime |

**Never in a global store:** page content, tree data, editor value.

---

## 10. Caching strategy

```ts
// packages/react/src/data/keys.ts
export const createKeys = (instanceId: string) => ({
  ns: ['docs', instanceId] as const,
  meta: ['docs', instanceId, 'meta'] as const,
  tree: (rootId?: NodeId) => ['docs', instanceId, 'tree', rootId ?? '*'] as const,
  page: (id: NodeId) => ['docs', instanceId, 'page', id] as const,
});
```

- `useMeta()` runs once per instance; its `capabilities` gate every action in the UI.
- Root loader (host-side) may `ensureQueryData(treeQuery)` so the tree exists before first paint; the module also works without loaders (it shows skeletons).
- Save success: `setQueryData(page)` with `body`, `version`, `updatedAt`; `setQueryData(tree, applyMeta(updatedAt))`. No refetch.
- Rename/move/create/delete: optimistic `apply*`, rollback from `onMutate` context, `invalidateQueries(tree)` on settle. Delete also removes the page query and LRU entry.
- Title edit patches both the tree node and the open page's `meta.title`.
- Conflict: cache untouched; user picks Reload (refetch, discard local) or Overwrite (`baseVersion = currentVersion`).
- `subscribe` events: `tree` → invalidate tree; `page` → invalidate that page unless `version === session.lastSavedVersion`.

---

## 11. Component hierarchy and integration surface

```
<DocsProvider provider navigation instanceId? queryClient? strings? onEvent? guardUnload?>
  DocsShell (optional; hosts may compose the parts themselves)
  ├─ Sidebar                    collapsible; resizable 240-400 px (default 272); drawer below 768 px
  │  ├─ SidebarHeader           workspace title (from meta), collapse, new page (if write)
  │  ├─ SidebarNav              Search (if capabilities.search or local title search), Home
  │  ├─ PageTree                headless-tree + TanStack Virtual; role="tree"
  │  │   └─ PageTreeRow*        chevron, icon, title, hover actions; React.memo
  │  └─ SidebarFooter           slot (host content)
  └─ Content
     └─ PageRoute(id, mode)     host decides lazy loading; editor entry is its own subpath
        ├─ PageHeader           breadcrumbs, IconPicker, Title (inline edit), ModeToggle, SaveStatus, actions slot
        ├─ FidelityBanner | ConflictBanner | OfflineBanner
        └─ EditorErrorBoundary
           └─ DocumentEditor    <Plate readOnly> + toolbars + slash menu    (or DocumentView in read-only hosts)
```

**Public props that make it generic.**

```ts
interface DocsProviderProps {
  provider: DocumentProvider;
  navigation: DocsNavigation;
  instanceId?: string;                       // default 'default'; namespaces keys + storage
  queryClient?: QueryClient;                 // reuse the host's; otherwise an internal one
  strings?: Partial<DocsStrings>;            // every user-facing string, English defaults
  onEvent?: (e: DocsEvent) => void;          // 'page:open' | 'page:saved' | 'page:conflict' | 'page:created' | ... | 'error'
  guardUnload?: boolean;                     // beforeunload prompt while dirty; default true
  children: React.ReactNode;
}

interface DocsShellProps {
  pageId: NodeId | null;
  mode: PageMode;
  slots?: { sidebarFooter?: ReactNode; headerActions?: ReactNode; emptyState?: ReactNode };
  sidebar?: { defaultWidth?: number; minWidth?: number; maxWidth?: number; collapsible?: boolean };
  className?: string;                        // applied to the .docs-root element
}
```

**Boundaries.** `PageTree` receives `activeId` and `onOpen`; it does not know routes. `DocumentEditor` receives `value`, `readOnly`, `onChange`; it does not know saving. `useDocumentSession` is the only code that knows both the editor value and the provider. `PageHeader` reads session and tree; it never touches Plate.

**Interaction defaults (host-overridable through slots and CSS variables).** Rows 28 px, 12 px indent per level, emoji icons as text, Lucide at 16 px, active row tinted. Content column max-width 720 px, title 40 px/700 with the icon button to its left, body 16 px / 1.65. Slash menu grouped: Basic blocks, Lists, Media, Advanced. Save status: Saved / Saving… / Unsaved / Conflict / Offline. Collapsed sidebar shows a floating open button; `Cmd+\` toggles.

---

## 12. Routing strategy

**The module is router-agnostic.** Its only navigation dependency:

```ts
export interface DocsNavigation {
  activePageId: NodeId | null;
  mode: PageMode;
  navigate(to: { pageId: NodeId; mode?: PageMode }, opts?: { replace?: boolean }): void;
  href?(to: { pageId: NodeId; mode?: PageMode }): string;   // real <a> links in the tree when provided
}
```

**Playground (and any TanStack Router host):** code-based routes `/`, `/p/$pageId` with `validateSearch: z.object({ mode: z.enum(['read','edit']).default('read') })`, loaders calling `ensureQueryData`, `preload: 'intent'`, `errorComponent` and `pendingComponent`. The adapter wraps `useNavigate` and `useSearch`.

**Laravel Inertia host:** adapter maps `navigate` to `router.visit(route('docs.page', { id }), { preserveState: true })` for full pages, or to component state for a help drawer. Blade + Vite host with no SPA router: adapter holds state in `useState` and syncs `?page=` manually.

**React Router host:** adapter over `useNavigate` and `useSearchParams`.

Every adapter is under 30 lines. See Appendix C.

---

## 13. Performance strategy

- **Bundle:** `./editor` is the only heavy entry; `./tree` + `./view` stay small. Hosts lazy-load the editor route. The module never imports Lucide wholesale; page icons load by name through a dynamic import map with a cache.
- **Tree:** always virtualized, `overscan: 8`, memoized rows with primitive props, `isActive` passed down.
- **Editor:** keyed by `pageId`; `onChange` → ref + throttled status; chunked rendering on; no new props per keystroke.
- **Markdown:** parse once per version (LRU), serialize on save only, fidelity once per open.
- **Large docs:** Plate chunking; soft threshold opens read-only.
- **Saving:** 1.5 s idle debounce, serialize in `requestIdleCallback` when available, flush on blur/route/hide.
- **Measure before optimizing:** `fixtures/perf` generates a 5k-node tree and a 3k-block page; profile before each phase gate. Budgets: tree scroll 60 fps, cached page switch under 100 ms, keystroke under 16 ms, `./tree` + `./view` under 80 KB gzipped excluding peers.
- **Search:** title search client-side over the index; content search server-side behind `capabilities.search`.

---

## 14. Libraries

| Library | Role | Peer or bundled | Why not build it |
|---|---|---|---|
| `platejs`, `@platejs/*` v53 | Editor, Markdown, static/view renderers | Peer | Years of Slate edge cases; must be a single instance per host |
| Plate UI registry (shadcn CLI) | Node components, toolbars, slash menu | Copied into `editor/ui` | You own the code, matches shadcn conventions |
| `@tanstack/react-query` v5 | Server state | Peer | One client shared with the host |
| `@headless-tree/core` + `/react` v1.7 | ARIA tree, keyboard, rename, DnD, flat rows | Bundled | 9.5 kB; roving tabindex and arrow-key semantics are fiddly |
| `@tanstack/react-virtual` v3 | Row virtualization | Bundled | Headless standard |
| `zustand` v5 | Persisted sidebar store, session store | Bundled | Tiny; selectors |
| `zod` v4 | Contract schemas, OpenAPI generation, search params | Bundled in core | Runtime guarantees at boundaries |
| `remark-gfm` | Tables, task lists, strikethrough, autolinks | Bundled | Part of Plate's pipeline |
| `yaml` | Frontmatter in core (backend, fixtures) | Bundled in core | Safe by default, preserves key order |
| `frimousse` | Emoji picker | Bundled | Lazy emoji data, virtualized, accessible, fits a Base UI popover |
| `lucide-react` | UI icons and Lucide page icons | Bundled (per-icon) | Standard |
| `@base-ui/react` | Internal shadcn primitives | Bundled | shadcn default since July 2026 |
| Hono + chokidar | Reference Node backend | server-node only | Small, standard, runs anywhere |
| TanStack Router | Playground routing | Playground only | Typed search params, Query integration |

**Not added:** react-arborist, Jotai (Plate uses jotai-x internally), Redux, gray-matter, any client search index, a Markdown-to-HTML renderer.

---

## 15. Key interfaces

```ts
// packages/core/src/errors.ts
export type ProviderErrorCode = 'not_found' | 'conflict' | 'forbidden' | 'validation' | 'unsupported' | 'network' | 'internal';
export class ProviderError extends Error {
  constructor(public readonly code: ProviderErrorCode, message: string, public readonly details?: unknown) { super(message); }
}
export class ConflictError extends ProviderError {
  constructor(public readonly currentVersion: string) { super('conflict', 'Page changed since it was opened'); }
}

// packages/core/src/model.ts
export type ChangeEvent =
  | { type: 'tree'; version: string }
  | { type: 'page'; id: NodeId; version: string };

export interface DocumentProvider {
  readonly capabilities: ProviderCapabilities;         // memory: static; http: filled from GET /meta
  getMeta(): Promise<BackendMeta>;
  getTree(opts?: { rootId?: NodeId }): Promise<TreeSnapshot>;
  getPage(id: NodeId): Promise<PageDocument>;
  savePage(id: NodeId, input: { body: string; baseVersion: string | null }): Promise<{ version: string; updatedAt: string }>;  // null base = create index for a folder node
  updateMeta(id: NodeId, patch: PageMetaPatch): Promise<TreeNode>;
  createPage(input: { parentId: NodeId | null; title: string; index?: number }): Promise<TreeNode>;
  movePage(id: NodeId, input: { parentId: NodeId | null; index: number }): Promise<TreeNode>;
  deletePage(id: NodeId): Promise<void>;                 // deletes the subtree
  assetUrl(relativePath: string, page: TreeNode): string; // resolves relative image paths
  uploadAsset?(pageId: NodeId, file: File): Promise<{ path: string; url: string }>;
  search?(query: string, opts?: { rootId?: NodeId; limit?: number }): Promise<Array<{ id: NodeId; title: string; snippet?: string }>>;
  subscribe?(listener: (event: ChangeEvent) => void): () => void;
}
```

```ts
// packages/react/src/adapters/http.ts
export function createHttpProvider(opts: {
  baseUrl: string;                                       // e.g. "/api/docs"
  fetch?: typeof fetch;
  headers?: () => Record<string, string> | Promise<Record<string, string>>;   // bearer token, X-XSRF-TOKEN
  credentials?: RequestCredentials;                      // 'include' for Laravel Sanctum cookies
  rootId?: NodeId;                                       // scope to a subtree
  events?: 'sse' | 'none';                               // default 'none'
}): DocumentProvider;

// packages/react/src/adapters/memory.ts
export function createMemoryProvider(seed: { files: Record<string, string> } | { tree: TreeSnapshot; pages: Record<NodeId, PageDocument> },
  opts?: { capabilities?: Partial<ProviderCapabilities>; latencyMs?: number }): DocumentProvider;
```

```ts
// packages/react/src/data/session.ts
export interface DocumentSession {
  value: Value;
  fidelity: Fidelity;
  status: 'clean' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'offline' | 'error';
  onChange(value: Value): void;
  flush(): Promise<void>;
  discard(): void;
  resolveConflict(choice: 'reload' | 'overwrite'): Promise<void>;
}
export function useDocumentSession(page: PageDocument): DocumentSession;
```

```ts
// packages/react/src/index.ts   PUBLIC API
export { DocsProvider, useDocs } from './data/DocsProvider';
export { createKeys } from './data/keys';
export { useMeta, useTreeIndex, usePage, treeQuery, pageQuery } from './data/queries';
export { useSavePage, useUpdateMeta, useCreatePage, useMovePage, useDeletePage } from './data/mutations';
export { useDocumentSession } from './data/session';
export { useSidebarStore } from './data/sidebar-store';
export type { DocsNavigation, DocsEvent, DocsStrings } from './types';
export type * from '@docs/core';                          // models, contract types, errors
// subpaths: '@docs/react/tree' → PageTree; '/editor' → DocumentEditor; '/view' → DocumentView;
//           '/shell' → DocsShell, PageHeader, Sidebar; '/adapters/http', '/adapters/memory'
```

The five separations map onto the packages directly:
1. Reusable document/editor domain: `@docs/core`
2. Reusable UI components: `@docs/react/tree`, `/editor`, `/view`
3. App-specific navigation/layout: `@docs/react/shell` (optional) + the host's adapter
4. File/data access: `@docs/react/adapters/*` behind `DocumentProvider`; `@docs/server-node` on the other side
5. Integration API: `DocsProvider` props + `DocsNavigation`

---

## 16. Backend contract

**Versioned, generated, and testable.** `contract/openapi.json` is generated from the zod schemas (`pnpm contract:gen`); `@docs/contract-tests` runs against any base URL; `@docs/server-node` is the reference implementation; `contract/LARAVEL.md` maps every rule to Laravel idioms.

**Endpoints (base path is host-defined, default `/api/docs`).**

```
GET    /meta                        → BackendMeta { contractVersion, capabilities, title?, rootId? }
GET    /tree?root=                  → TreeSnapshot                          ETag: "<tree version>"
GET    /pages/:id                   → PageDocument                          ETag: "<version>"
PUT    /pages/:id   If-Match: "<baseVersion>"   { body }
                                    → 200 { version, updatedAt }
                                    → 201 { version, updatedAt }  when :id is a folder node and If-Match is absent (creates index.md)
                                    → 409 { error: { code: "conflict", currentVersion } }
                                    → 412 when If-Match is absent on an existing page (client bug, not a conflict)
PATCH  /pages/:id                   { title?, icon? }                       → TreeNode
POST   /pages                       { parentId, title, index? }             → 201 TreeNode
POST   /pages/:id/move              { parentId, index }                     → TreeNode  (subtree paths change)
DELETE /pages/:id                   → 204  (deletes the subtree; frontend confirms with descendantCount)
GET    /assets/*path                → file bytes with content type          (relative to docs root; traversal rejected)
POST   /pages/:id/assets            multipart { file }                      → 201 { path, url }   capabilities.upload
GET    /search?q=&root=&limit=      → [{ id, title, snippet? }]             capabilities.search
GET    /events                      → text/event-stream of ChangeEvent      capabilities.subscribe
```

**Precise semantics (where interop bugs live).**
- `version` is a strong content hash of the file bytes (`sha256:<hex>`). ETag and `If-Match` carry it quoted; the JSON carries it bare. The adapter quotes exactly what it received.
- `TreeSnapshot.version` is a hash over `(path, id, title, icon, order, kind)` for all nodes; it changes on any structural or metadata change and is used for SSE dedupe and `rebuildTree`.
- Ordering: frontmatter `order` (integers, steps of 10), then `index.md` first, then filename. A move writes the moved file's `order` to a midpoint; siblings are renumbered only on collision. Folder nodes cannot hold `order` and sort alphabetically after ordered pages.
- Create: slug from title (`kebab-case`, ASCII-folded, `-2` suffix on collision). Creating a child under a leaf `page.md` converts it to `page/index.md`; the backend does the move and keeps the id.
- Move: files move on disk; ids are stable because they live in frontmatter; the response tree carries the new paths.
- Delete: removes the directory subtree. No trash in v1; hosts wanting trash implement it behind the same `DELETE`.
- Folder → page: `PUT /pages/:folderId` without `If-Match` creates `index.md`, writes the folder's existing hash-derived id into it, and returns 201 with the node now `kind: "page"`.
- Rename (`PATCH title`) never renames the file. File renames are a backend policy decision, off by default.
- Frontmatter: known keys are typed; unknown keys are preserved byte-for-byte where the YAML library allows, otherwise re-serialized in original key order. Comments are not preserved.
- Errors: always `{ error: { code, message, currentVersion?, details? } }` with the HTTP status implied by `code`. Unsupported operations return 405 with `code: "unsupported"`; the frontend never calls them because `capabilities` already said no.
- Contract version: a backend at major `2` makes the frontend show "Docs backend is newer than this app" instead of half-working.

**Backend responsibilities.** Walk the root; parse frontmatter safely; assign and persist ids (`ids` command for one-shot migration, lazy write on first save otherwise); compute ordering; hash versions; atomic writes (temp file + rename); reject traversal and symlinks outside the root; serve assets with correct content types; optional watcher → SSE. Authentication and authorization are the host's; the module only needs `capabilities` to reflect what the current user may do.

**Laravel notes (summary of `contract/LARAVEL.md`).** Route group with middleware; `Str::ulid()` for ids; `symfony/yaml` for frontmatter; `Storage::disk('docs')` with `Storage::put` to a temp name then `move`; ETag via `hash_file('sha256')`; `If-Match` check in a form request; JSON error envelope via an exception handler; SSE via `response()->stream` or skip and set `subscribe: false`. Sanctum hosts pass `credentials: 'include'` and an `X-XSRF-TOKEN` header function to the adapter.

---

## 17. Error, loading, empty states

| Situation | Behavior |
|---|---|
| Meta unreachable | Content card: "Docs backend unavailable" + Retry; sidebar hidden |
| Contract major mismatch | Content card explaining the version gap; no partial UI |
| Tree loading (first ever) | Sidebar skeleton, 8 rows; later refetches silent |
| Page loading | Header + 6-line skeleton; sidebar interactive |
| Page not found / deleted | "This page no longer exists" + Go to home; tree unaffected |
| Network error on read | Toast with retry; cached content stays |
| Network error on save | Status "Offline, retrying" with backoff; edits kept in the editor; `beforeunload` guard active |
| Save conflict | Banner: "Changed on disk since you opened it. Reload (discards your edits) or Overwrite" |
| Lossy document | Banner before first edit with the reasons list; page never saves unedited |
| Reformat-only document | Subtle note in the save status tooltip; no banner |
| Editor crash | `EditorErrorBoundary`: "Editor failed to render this page" + Reload page; `onEvent('error')` |
| No pages at all | "Create your first page" (write) or "No pages yet" (read-only) |
| Folder node selected | "This folder has no page yet. Create one?" (write) or its child list (read-only) |
| Read-only host | No edit affordances anywhere; click on content does nothing; links still work |

**Copy rules.** Say what happened and what to do. Sentence case. No apologies. Same verb on button and toast. All strings overridable through `strings`.

---

## 18. Testing strategy

- **core (Vitest):** tree ops incl. property test (no orphans, no duplicate ids, move guard); frontmatter split/join round-trip with unknown keys and key order; link resolution table; fidelity classification table; codec golden tests over `fixtures/corpus` (`*.md` → parse → serialize → compare `*.expected.md`, plus idempotence).
- **Provider contract suite (core of `@docs/contract-tests`):** identical cases run in-process against the memory adapter (unit) and over HTTP against `server-node` (integration) and any external URL (Laravel CI). Cases: meta, tree, page, ETag/If-Match, 409, 412, create + slug collision, move + path update, delete subtree, folder conversion, unsupported → 405, search when advertised. The suite creates a `__contract-<run>` subtree and cleans up; no reset endpoint needed.
- **react (RTL):** tree keyboard nav (arrows, Home/End, Enter, F2), expand persistence across remount, active row, collapse; header title edit; icon picker; capability gating (read-only host renders no edit UI).
- **Session (fake timers):** type → dirty → 1.5 s → saved; Cmd+S; blur; unmount; conflict; offline retry; unedited page never saves; SSE echo ignored.
- **Built-package smoke:** CI builds the packages and runs the playground against `dist`, not workspace source, so "works in the monorepo, breaks when published" is caught. A second tiny host without Tailwind imports `styles.css` and renders `DocumentView` in CI.
- **E2E (Playwright, playground + server-node on a temp copy of the corpus):** open, edit, reload, persisted; create → rename → move → delete; read-only mode; large fixtures open within budget (measured and reported).
- **Lint gate:** boundary rule fails CI; `exports` map checked with `publint` and `@arethetypeswrong/cli`.

---

## 19. Accessibility and responsiveness

- Tree: `role="tree"` / `treeitem`, `aria-level`, `aria-expanded`, `aria-selected`, roving tabindex, arrows, Home/End, typeahead (headless-tree; keep `AssistiveTreeDescription`).
- Entering edit mode without a mouse: `E` or Enter while the content region is focused, or the mode toggle button. Escape leaves. Both announced in the toggle's tooltip.
- Collapse button `aria-expanded` + `aria-controls`; resize handle `role="separator"`, `aria-orientation="vertical"`, `aria-valuenow`, arrow keys adjust.
- Editor: Plate/Slate semantics; toolbar `role="toolbar"` with arrow-key movement; slash menu listbox with `aria-activedescendant`; visible focus rings from the host's `--ring`.
- Live regions: save status `polite`; fidelity banner `status`; conflict banner `alert`.
- Icon picker keyboard navigable; trigger labeled "Change icon"; current icon announced.
- Responsive: below 768 px the sidebar becomes a modal drawer (Base UI Dialog), header condenses to icon + title + status, DnD disabled on touch, 44 px targets. Read and edit both work on mobile.
- `prefers-reduced-motion` respected; no motion is load-bearing.

---

## 20. Security

- Plate renders a node tree through React components; no `dangerouslySetInnerHTML` in the pipeline, including custom components.
- Raw HTML is dropped by default; the future `raw_html` block renders source as text in `<pre>`.
- Links: allowlist `http`, `https`, `mailto`, relative; `rel="noopener noreferrer"` on external; `javascript:` and `data:` rejected in `LinkPlugin` `isUrl` and again at render.
- Images: relative paths go through `assetUrl`; absolute URLs allowed only from an optional host allowlist; no `data:` URIs unless enabled.
- Authentication and authorization are the host's. The module never stores credentials; the adapter's `headers()` and `credentials` are the only hooks. `capabilities` from `/meta` reflect the current user's rights and the UI honors them, but the backend must enforce them.
- Untrusted content later: sanitize Markdown before `deserialize` with a strict allowlist, keep `remarkMdx` off, cap body size, rate-limit saves.
- IDs are opaque; the frontend never composes filesystem paths; backends reject traversal and symlinks outside the root; asset routes validate paths.
- CSP: no inline scripts needed; the module ships no `<style>` injection; `frame-ancestors` restricted for embeds.
- Backends parse YAML safely (no custom tags), limit frontmatter size, and write atomically.

---

## 21. Phased implementation plan

**Phase 0: Foundation (3 days)**
Monorepo, Changesets, boundary lint, Vitest/RTL/Playwright skeletons, tsup builds with `publint` checks. `core`: models, contract schemas + OpenAPI generation, tree ops, frontmatter, codec, fidelity, link resolution, all with tests. Memory adapter seeded from `fixtures/corpus` (30 nested pages). Golden tests over 10 real docs.
Gate: `pnpm test` green; a real doc round-trips `exact`; `openapi.json` committed; boundary lint in CI.

**Phase 1: Read path end to end (4 days)**
`server-node` read endpoints (`meta`, `tree`, `pages/:id`, `assets`) with ETags. HTTP adapter (read). `DocsProvider`, queries, sidebar store, `PageTree`, `DocsShell` (collapse, resize, drawer), `DocumentEditor` in `readOnly` with internal links and relative images, skeletons/empty/error states, breadcrumbs, icons. Playground running on the real corpus.
Gate: 5k-node fixture at 60 fps; cached page switch instant; a11y tree checks pass; contract suite green for read cases on memory and server-node.

**Phase 2: Editing (5 days)**
`server-node` write endpoints with `If-Match`; adapter writes. Edit mode (click, keyboard, toggle, Escape); Plate kits and Plate UI (basic blocks, marks, lists, code block, table, link, image, toggle); slash menu; toolbars; `useDocumentSession` (debounce, flush events, Cmd+S, offline retry, `guardUnload`); save status; conflict and fidelity banners; inline title edit; icon picker; chunked rendering.
Gate: edit → reload → identical file; serializer output passes markdownlint on the corpus; unedited pages never write; contract suite green for write cases; `doctor` report on the corpus reviewed.

**Phase 3: Page operations, read-only entry, polish (4 days)**
Create (sibling/child, folder conversion), rename, move (DnD with descendant guard), delete with count confirmation; optimistic patches with rollback; expand-all/collapse-all; command palette (title search local, content search if advertised); `DocumentView` on `PlateView` with static components and the `./view` entry; capability gating; `strings` and `onEvent`; a11y and perf passes; `raw_html` passthrough if the doctor report demands it.
Gate: full contract suite green on memory and server-node; built-package smoke passes in a Tailwind host and a non-Tailwind host; bundle budgets met.

**Phase 4: Second backend and first embeds (3 days, when needed)**
`contract/LARAVEL.md` validated by running `docs-contract` against a Laravel implementation; SSE `subscribe`; `uploadAsset`; first read-only embed (help drawer) and first Inertia page using `DocsShell`.
Gate: Laravel backend passes the conformance suite unmodified; embed loads `./tree` + `./view` only.

Total: about 4 weeks for one engineer plus the harness. Usable in the playground after Phase 2; consumable by other apps after Phase 3.

---

## 22. Deliberately not built yet

Real-time collaboration and CRDT, presence, comments, version history, permissions UI (backend-enforced only), offline mode or service worker, i18n framework (a `strings` object is enough), theming beyond CSS variables, workspace switching, a custom block model over Plate, editor virtualization, a generic plugin system, SSR rendering of pages (the module is SSR-safe to import, not SSR-rendered), in-browser content index, Plate AI/Copilot/mention/equation/embed kits, trash and restore, block DnD beyond Plate's built-in, import/export beyond Markdown, page templates, lazy tree children.

---

## 23. Common mistakes to avoid

1. Mirroring the editor value into a store on every keystroke. Plate owns content.
2. Nested tree objects in state. One rename re-renders the whole sidebar.
3. Path as identity. One rename breaks route, expanded state, and cache.
4. Serializing Markdown to render or on every change. Render the value; serialize on save.
5. Not keying the editor by page id. Page A's text shows in page B.
6. Saving pages the user never edited. Git noise; the fidelity warning becomes a lie.
7. `remarkMdx` on for plain Markdown. Parser throws on `<br>`.
8. Context for frequently changing state. Sidebar re-renders on every route change.
9. The module importing a router, a global store, or global CSS. It stops being embeddable.
10. Wrapping Plate in your own Block abstraction. You rebuild Plate, badly, forever.
11. Shipping Plate as a regular dependency. Two Slate instances in a host that also uses Plate.
12. Unscoped precompiled Tailwind with preflight. The host's typography breaks the moment the CSS loads.
13. Static query keys or storage keys. Two instances or two apps on one origin overwrite each other.
14. Skipping round-trip golden tests and the corpus doctor. Silent data loss found in `git blame`.
15. Resolving 409 by overwriting. Someone's git pull disappears.
16. Treating the contract as prose. Without the conformance suite, Laravel and Node drift within a month.
17. Bundling all of Lucide for page icons. Hundreds of KB in every host.
18. Testing only against workspace source. Publish-time breakage (`exports`, types, CSS) shows up in a host.

---

## 24. Architecture decisions (compressed ADRs)

| # | Decision | Options | Chosen | What would change it |
|---|---|---|---|---|
| 1 | Packaging | single app / packages now | Monorepo: `core`, `react`, `server-node`, `contract-tests`, playground | Only one consumer forever → collapse to one app (v1 shape) |
| 2 | Distribution | source TSX / built ESM + `@source` / shadcn registry | Built ESM + types; Tailwind classes preserved; hosts add `@source`; fallback CSS | Hosts want to fork every component → publish a shadcn registry instead |
| 3 | Styling contract | own token names / shadcn variables | shadcn CSS variables; opt-in `theme.css` | Hosts without shadcn multiply → promote `theme.css` to default import |
| 4 | UI primitives | host design system / internal | Internal shadcn on Base UI, not exported; Plate UI on Radix inside the editor entry | Plate ships Base UI variants → migrate with shadcn's tool |
| 5 | Router | React Router / TanStack Router / none | Router-agnostic adapter; TanStack Router in the playground | Nothing; the adapter absorbs every host |
| 6 | UI state | Zustand / Context / useReducer | Zustand (namespaced, persisted) for sidebar and session; Context for DI | State shrinks to one component → local |
| 7 | Server cache | TanStack Query / custom | Query (peer) | Nothing plausible |
| 8 | Tree | headless-tree / react-arborist / own | headless-tree + TanStack Virtual | Library abandoned → own flat-list tree, ~300 LOC, same data shape |
| 9 | Identity | fs path / generated id | Generated id in frontmatter; path as attribute; `hash(path)` for folders | Backend cannot write files → `hash(path)` everywhere, accept state reset on rename |
| 10 | Canonical format | Markdown / Plate JSON | Markdown (frontmatter + GFM); Plate JSON transient | Notion-only blocks needed → JSON sidecar per page |
| 11 | Saving | every change / debounce / explicit | Debounce 1.5 s + flush events + Cmd+S; dirty-only; `If-Match` | Multi-user editing → CRDT and server merge |
| 12 | Read mode | Plate `readOnly` / PlateView / PlateStatic | `readOnly` in editing hosts; `PlateView` via `./view` in read-only hosts | Embed needs rich interactivity → Plate `readOnly` there |
| 13 | Frontmatter | frontend parses / backend owns | Backend owns at runtime; parser lives in `core` for Node and fixtures | Nothing |
| 14 | Contract | prose / OpenAPI by hand / generated from zod | zod → generated OpenAPI + conformance CLI + reference server | Nothing |
| 15 | Fidelity | string compare / AST compare | AST compare with reasons (`exact`/`reformat`/`lossy`) | Nothing |
| 16 | Tree loading | whole index / lazy children | Whole index, optional `rootId` scope | >20k nodes measured → add `getChildren` capability |

---

## 25. Senior review of v1 → what was fixed, what remains open

**Findings incorporated**

| # | Issue in v1 | Fix in v2 |
|---|---|---|
| 1 | Coupled to a specific design system; not embeddable elsewhere | Internal primitives, shadcn variable contract, `theme.css` / `styles.css`, `.docs-root` scoping |
| 2 | "Single package" contradicted the multi-app goal; v1's own extraction trigger had fired | Monorepo with `core`/`react`/`server-node`/`contract-tests`; subpath entries so read-only hosts skip the editor |
| 3 | No executable contract; Laravel and Node would drift | zod-generated OpenAPI, conformance CLI, reference Node backend, Laravel guide, `contractVersion` in `/meta` |
| 4 | Static query keys and localStorage keys collide across apps on one origin | `instanceId` namespacing for keys, session store, and persisted storage |
| 5 | Fidelity by string compare would flag harmless reformatting as data loss | AST-level classification with reasons; banner only for `lossy` |
| 6 | Relative links and images unaddressed; docs-as-code content would feel broken | `idByPath`, `resolvePageLink`, in-app navigation, `provider.assetUrl`, `/assets` endpoint |
| 7 | Capabilities were static; a read-only backend could not tell the frontend | `GET /meta` fills `capabilities`; every action gated |
| 8 | Folder → page conversion, subtree delete, move paths, ETag quoting unspecified | Specified in Section 16 (PUT without `If-Match` → 201, `DELETE` subtree, paths refetched, quoted ETags) |
| 9 | Save → watcher → refetch loop possible once SSE lands | Session ignores events matching `lastSavedVersion` |
| 10 | Title edit updated the tree but not the open page's `meta` | Both patched |
| 11 | Click-to-edit had no keyboard path | `E` / Enter / toggle button |
| 12 | No responsive behavior | Drawer under 768 px, condensed header, touch rules |
| 13 | `beforeunload` guard would annoy some hosts | `guardUnload` prop |
| 14 | No host telemetry or copy overrides | `onEvent`, `strings` |
| 15 | Plate as a normal dependency would duplicate Slate in Plate-using hosts | Plate and Query are peers |
| 16 | Frontmatter parsing existed only "somewhere in the backend" | `core/frontmatter` shared by Node backend, fixtures, doctor, and migrations; Laravel reimplements the written rules |
| 17 | Auth not addressed for generic hosts | Adapter `headers()` + `credentials`; Sanctum notes; module stores nothing |
| 18 | No upload path, so the image block was half a feature | `uploadAsset` capability; v1 allows URL/relative insertion only, UI hides upload when absent |
| 19 | Publish-time breakage undetected | Built-package smoke in CI, `publint`, `arethetypeswrong` |
| 20 | Corpus risk unknown until users hit it | `server-node doctor` report before adoption; `ids` migration command |

**Open risks (accepted, tracked)**

- headless-tree is a single-maintainer project. Mitigation: the flat-index design makes a replacement ~300 LOC.
- Plate UI ships on Radix while the module's own primitives are on Base UI. Two popover engines in one bundle (~30 KB). Mitigation: scoped to the editor entry; revisit when Plate offers Base UI variants.
- YAML comments in frontmatter are lost on write by both `yaml` and `symfony/yaml` default paths. Mitigation: documented; corpora with commented frontmatter run `doctor` first.
- Peer-dependency ranges for `@platejs/*` must move in lockstep with the module's kits. Mitigation: one Changeset per Plate upgrade; the playground pins exact versions.
- Tailwind class detection through `@source` requires hosts on Tailwind v4. Mitigation: fallback `styles.css`; no Tailwind v3 support planned.
- Lossy-but-editable documents still lose data if the user proceeds. Mitigation: banner with reasons; `raw_html` passthrough queued behind doctor results.

---

## Appendix A: Sequence, open a page and edit

```
row click ─► navigation.navigate({ pageId })
          ─► host route renders <DocsShell pageId mode>
          ─► usePage(id) → cache or GET /pages/:id
          ─► markdownToValue + classifyFidelity          (LRU hit → 0 ms)
          ─► <DocumentEditor key={id} value readOnly>
content click / E ─► navigate({ mode: 'edit', replace: true }) → readOnly=false → focus
typing     ─► onChange(value) → ref + status 'dirty' → timer(1500)
idle       ─► flush(): valueToMarkdown → PUT /pages/:id  If-Match: "<baseVersion>"
             ├─ 200 → setQueryData(page); status 'saved'; lastSavedVersion = version
             ├─ 409 → status 'conflict' → banner (reload | overwrite)
             └─ network → status 'offline' → retry with backoff; guard stays on
navigate away ─► flush() if dirty (value captured) → unmount
SSE page event ─► version === lastSavedVersion ? ignore : invalidate page
```

## Appendix B: `PageTree` sketch

```tsx
// packages/react/src/tree/PageTree.tsx  (shape only; verify option names against the installed headless-tree)
export function PageTree({ activeId, onOpen, rootId }: { activeId: NodeId | null; onOpen: (id: NodeId) => void; rootId?: NodeId }) {
  const { data: index } = useTreeIndex(rootId);
  const expanded = useSidebarStore(s => s.expanded);
  const setExpanded = useSidebarStore(s => s.setExpanded);
  const expandedItems = useMemo(() => Object.keys(expanded), [expanded]);

  const tree = useTree<TreeNode>({
    rootItemId: ROOT,
    state: { expandedItems },
    setExpandedItems: setExpanded,
    getItemName: item => item.getItemData().title,
    isItemFolder: item => item.getItemData().childIds.length > 0 || item.getItemData().kind === 'folder',
    dataLoader: {
      getItem: id => (id === ROOT ? ROOT_NODE : index.byId[id]),
      getChildren: id => (id === ROOT ? index.rootIds : index.byId[id].childIds),
    },
    features: [syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature, renamingFeature /*, dragAndDropFeature in phase 3 */],
  });
  useEffect(() => { tree.rebuildTree(); }, [index.version]);

  const items = tree.getItems();
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({ count: items.length, getScrollElement: () => parentRef.current, estimateSize: () => 28, overscan: 8 });

  return (
    <div ref={parentRef} className="h-full overflow-auto" {...tree.getContainerProps()}>
      <AssistiveTreeDescription tree={tree} />
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(v => {
          const item = items[v.index]; const node = item.getItemData();
          return (
            <PageTreeRow key={item.getId()} id={node.id} title={node.title} icon={node.icon}
              depth={item.getItemMeta().level} hasChildren={item.isFolder()} expanded={item.isExpanded()}
              active={node.id === activeId} selected={item.isSelected()} itemProps={item.getProps()} onOpen={onOpen}
              style={{ position: 'absolute', top: v.start, height: v.size, width: '100%' }} />
          );
        })}
      </div>
    </div>
  );
}
```

## Appendix C: Host integration examples

**1. Standalone Vite app with TanStack Router (the playground shape)**

```tsx
// app.css
@import "tailwindcss";
@source "../node_modules/@docs/react/dist";
@import "@docs/react/styles.css";
/* host already defines shadcn variables; otherwise: @import "@docs/react/theme.css"; */

// navigation-adapter.ts
export function useDocsNavigation(): DocsNavigation {
  const navigate = useNavigate();
  const { pageId } = useParams({ strict: false });
  const { mode } = useSearch({ strict: false });
  return {
    activePageId: pageId ?? null,
    mode: mode ?? 'read',
    navigate: (to, opts) => navigate({ to: '/p/$pageId', params: { pageId: to.pageId }, search: { mode: to.mode ?? 'read' }, replace: opts?.replace }),
    href: to => `/p/${to.pageId}?mode=${to.mode ?? 'read'}`,
  };
}

// routes/page.tsx
const provider = createHttpProvider({ baseUrl: '/api/docs', events: 'sse' });
export function PageRoute() {
  const nav = useDocsNavigation();
  return (
    <DocsProvider provider={provider} navigation={nav} queryClient={queryClient}>
      <DocsShell pageId={nav.activePageId} mode={nav.mode} />
    </DocsProvider>
  );
}
```

**2. Laravel + Inertia page**

```tsx
// resources/js/Pages/Docs/Show.tsx
const provider = createHttpProvider({
  baseUrl: '/api/docs',
  credentials: 'include',
  headers: () => ({ 'X-XSRF-TOKEN': decodeURIComponent(getCookie('XSRF-TOKEN') ?? '') }),
});
export default function Show({ pageId, mode }: { pageId: string | null; mode: 'read' | 'edit' }) {
  const navigation: DocsNavigation = {
    activePageId: pageId, mode,
    navigate: (to, opts) => router.visit(route('docs.show', { page: to.pageId, mode: to.mode ?? 'read' }), { replace: opts?.replace, preserveState: true }),
    href: to => route('docs.show', { page: to.pageId, mode: to.mode ?? 'read' }),
  };
  return (
    <DocsProvider provider={provider} navigation={navigation} instanceId="product-docs">
      <DocsShell pageId={pageId} mode={mode} slots={{ headerActions: <ShareButton /> }} />
    </DocsProvider>
  );
}
```

**3. Read-only in-app help drawer (no editor bundle)**

```tsx
import { DocsProvider, usePage } from '@docs/react';
import { PageTree } from '@docs/react/tree';
import { DocumentView } from '@docs/react/view';

const provider = createHttpProvider({ baseUrl: '/api/help', rootId: HELP_ROOT });   // backend reports write: false
export function HelpDrawer() {
  const [pageId, setPageId] = useState<string | null>(HELP_HOME);
  const navigation: DocsNavigation = { activePageId: pageId, mode: 'read', navigate: to => setPageId(to.pageId) };
  return (
    <DocsProvider provider={provider} navigation={navigation} instanceId="help" guardUnload={false}>
      <div className="docs-root grid grid-cols-[240px_1fr] h-full">
        <PageTree activeId={pageId} onOpen={setPageId} rootId={HELP_ROOT} />
        {pageId && <HelpPage id={pageId} />}
      </div>
    </DocsProvider>
  );
}
function HelpPage({ id }: { id: string }) {
  const { data } = usePage(id);
  return data ? <DocumentView page={data} /> : <Skeleton />;
}
```

## Appendix D: Verified references (checked 2026-08-25)

- Plate Markdown: `@platejs/markdown` v53; `deserialize`/`serialize`, `rules`, `remarkPlugins`, `remarkStringifyOptions`, `preserveEmptyParagraphs`, `onError`, `withoutMdx`; raw HTML ignored by default; unknown nodes fall back to unknown types. https://platejs.org/docs/markdown
- Plate static rendering: `PlateStatic`, `PlateView` + `usePlateViewEditor`, `createSlateEditor`, comparison with `Plate` + `readOnly`. https://platejs.org/docs/static
- Plate performance snapshot (June 2026, 10k blocks, chunked rendering): ~0.9 s open, ~35 ms typing. https://platejs.org/docs/performance
- Plate UI depends on `radix-ui` (plus ariakit, cmdk). https://platejs.org/docs/installation/plate-ui
- shadcn/ui: Base UI default for new projects since July 2026; Radix and Base UI coexist. https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default
- headless-tree v1.7: flat items, ARIA, keyboard, rename, search, DnD, virtualization-friendly, ~9.5 kB. https://github.com/lukasbach/headless-tree
- TanStack Virtual v3. https://tanstack.com/virtual/latest
- TanStack Router vs React Router (2026): typed search params and Query integration favor TanStack Router for client SPAs. https://vercel.com/i/tanstack-router-vs-react-router
- frimousse emoji picker (Liveblocks), shadcn-installable, composable with Base UI popovers. https://frimousse.liveblocks.io/
