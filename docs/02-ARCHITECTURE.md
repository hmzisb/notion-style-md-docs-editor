# 02. Architecture

## 1. Workspace

```
docs-module/                       pnpm workspace, Changesets
  packages/
    core/        @hmzisb/notion-docs-core         no React, no DOM at runtime. Models, zod contract, tree ops, frontmatter,
                                    filesystem semantics over FileStore, Markdown codec, fidelity, links, errors,
                                    MemoryFileStore, conformance suite (test utility, exported from ./testing)
    react/       @hmzisb/notion-docs-react        DocsProvider, queries, cache, drafts, session, stores, PageTree, DocumentEditor,
                                    DocumentView, DocsShell, internal ui/, adapters (http, filesystem, memory)
  apps/
    playground/                    Vite + TanStack Router. Modes: demo, folder, opfs, remote. Dogfooding, e2e, demo
  contract/
    openapi.json                   generated from core zod schemas (pnpm contract:gen), committed
    HTTP-CONTRACT.md               human guide for backend implementers (generated table + prose from docs/03)
  fixtures/
    corpus/                        ~30 nested real-world pages, assets, frontmatter variants, golden expected files
    perf/                          generators: 5k-node tree, 3k-block page
  smoke/
    tailwind-host/                 tiny Vite app consuming dist with @source
    plain-host/                    tiny Vite app consuming dist with styles.css, no Tailwind
  docs/                            this handover (kept in repo)
```

## 2. Layers inside `@hmzisb/notion-docs-react`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ shell/     DocsShell, Sidebar, PageHeader, Breadcrumbs, banners, palette     │ optional, composable
├─────────────────────────────────────────────────────────────────────────────┤
│ tree/ PageTree      editor/ DocumentEditor      view/ DocumentView           │ reusable React
│ data/  DocsProvider, keys, queries, mutations, cache, drafts, session, stores│
├─────────────────────────────────────────────────────────────────────────────┤
│ ui/        internal shadcn primitives (Radix), not exported                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ @hmzisb/notion-docs-core models, contract, tree ops, codec, frontmatter, fs semantics      │ no React, no DOM
├─────────────────────────────────────────────────────────────────────────────┤
│ adapters/  http, filesystem, memory   (produce DocumentProvider)             │ swappable I/O
└─────────────────────────────────────────────────────────────────────────────┘
                              imports flow downward only
```

**Boundary rules (ESLint `boundaries` plugin, CI-enforced):**
- `core` imports no workspace package. It may import `platejs` root entry points and `@platejs/markdown`, never `/react` subpaths. It may import `yaml`, `zod`. No `window`, `document`, `navigator` references except behind `typeof` guards in `hash.ts` (Web Crypto is available in Node 20+ and browsers).
- `data`, `tree`, `editor`, `view` import `core` and `ui`. Never each other. `shell` imports all of them.
- `adapters` import `core` only. `filesystem` adapter may reference `FileSystemDirectoryHandle` types.
- Only `editor` and `view` import `platejs*`. Only `tree` imports `@headless-tree/*`.
- Nothing in the package reads `window.location`, `document.title`, global CSS, or a router.

## 3. Folder structure

```
packages/core/src/
  model.ts                 NodeId, NodeKind, PageIcon, TreeNode, TreeSnapshot, TreeIndex, PageMeta, PageDocument,
                           ProviderCapabilities, BackendMeta, ChangeEvent, SearchHit
  provider.ts              DocumentProvider interface, FileStore interface, FileEntry
  contract/schemas.ts      zod v4 schemas (source of truth)
  contract/openapi.ts      generator script
  contract/version.ts      CONTRACT_VERSION = 1
  tree.ts                  buildIndex, ancestorsOf, isDescendant, descendantCount, apply*
  frontmatter.ts           splitFrontmatter, joinFrontmatter, known keys
  icon.ts                  parseIcon, formatIcon
  links.ts                 resolvePageLink, normalizeRelative
  ids.ts                   generateId (ULID-style), pathHashId
  hash.ts                  sha256Hex (Web Crypto), fnv1a64
  fs/
    paths.ts               slugify, uniqueSlug, pagePathFor, dirPathFor, isIndex
    ordering.ts            compareSiblings, nextOrder, midpointOrder, renumber
    walk.ts                buildSnapshotFromEntries(entries, readMeta)
    semantics.ts           createFileStoreProvider(store, opts): DocumentProvider
    memory-store.ts        MemoryFileStore (FileStore in memory)
  codec/
    base-kit.ts            Base* Plate plugins + Markdown config (no React)
    codec.ts               markdownToValue, valueToMarkdown, createCodec(options)
    rules/                 callout (GFM alert), toggle (<details>), image caption
    fidelity.ts            classifyFidelity
  errors.ts                ProviderError, ConflictError, StorageQuotaError
  testing/
    conformance.ts         runProviderConformance(factory, opts)
    fixtures.ts            loadCorpus()
  index.ts

packages/react/src/
  data/
    DocsProvider.tsx       Context { provider, navigation, instanceId, ns, strings, onEvent, guardUnload }
    keys.ts                createKeys(ns)
    cache/idb.ts           createIdbStorage(ns): AsyncStorage for the query persister
    cache/persister.ts     createDocsPersister(ns) using experimental_createQueryPersister
    cache/value-cache.ts   LRU of parsed values keyed by ns:id:version
    cache/drafts.ts        createDraftStore(ns)
    cache/recents.ts       recent pages (localStorage)
    queries.ts             metaQuery, treeQuery, pageQuery, useMeta, useTreeIndex, usePage
    mutations.ts           useSavePage, useUpdateMeta, useCreatePage, useMovePage, useDeletePage
    session.ts             session store + useDocumentSession
    sidebar-store.ts       zustand persist, SSR-safe storage
    online.ts              useOnline (navigator.onLine + provider ping)
    strings.ts             DocsStrings defaults
    events.ts              DocsEvent union
  tree/                    PageTree, PageTreeRow, RowActions, IconGlyph, tree-dnd.ts
  editor/
    kits/                  editor-kit.ts (React plugins on top of core base kit), markdown-kit.ts
    ui/                    Plate UI registry output (copied), node components, toolbars, slash, link, image
    DocumentEditor.tsx
    EditorErrorBoundary.tsx
  view/                    DocumentView (PlateView + static components), static kit
  shell/                   DocsShell, Sidebar, SidebarHeader, SidebarFooter, PageHeader, Breadcrumbs, PageTitle,
                           PageIcon, IconPicker, ModeToggle, SaveStatus, PageMenu, CommandPalette, MoveToDialog,
                           DeleteDialog, banners/, EmptyState, skeletons/
  ui/                      internal shadcn primitives (Radix), not exported
  adapters/
    http.ts                createHttpProvider
    filesystem.ts          createFileSystemProvider(handle, opts) → FileStore over FileSystemDirectoryHandle + index cache
    memory.ts              createMemoryProvider(seed) (re-export from core plus React-free helpers)
  styles.css, theme.css
  index.ts (+ one index.ts per subpath entry)
```

## 4. Runtime data flow

```
FileStore or HTTP ─► DocumentProvider ─► TanStack Query [ns,'page',id] (persisted per query, IndexedDB)
                                                   │
                     markdownToValue(body) + classifyFidelity     (value LRU by ns:id:version)
                                                   │
                                     <DocumentEditor key={id} readOnly=mode==='read'>   Plate owns state
                                                   │ onChange
                       useDocumentSession: dirty → draft (500 ms) → save (1.5 s idle or flush event)
                                                   │
                         valueToMarkdown(editor.children) ─► provider.savePage(id, { body, baseVersion })
                                                   │
                     200: setQueryData(page), clear draft      409: status conflict, banner (reload | overwrite)
```

Rules that make this cheap: parse once per `ns:id:version`; serialize only on save; fidelity once per open; nothing converts to HTML; the tree query is the only subscriber that re-renders on structural change; rows are memoized on primitive props.

## 5. Provider construction

```ts
// core: one implementation of filesystem semantics
const provider = createFileStoreProvider(store, { key: 'memory:demo', capabilities: {...}, title: 'Demo' });

// react adapters
createMemoryProvider({ files })                         // MemoryFileStore + createFileStoreProvider
createFileSystemProvider(handle, { indexCache: true })  // FileSystemDirectoryHandle store + createFileStoreProvider
createHttpProvider({ baseUrl, headers, credentials })   // talks to the HTTP contract; backend owns semantics
```

`filesystem` accepts any `FileSystemDirectoryHandle`: a directory from `showDirectoryPicker()` or `navigator.storage.getDirectory()` (OPFS). Same code path, so e2e runs headless on OPFS.

## 6. Instance and cache namespaces

`ns = "docs:" + instanceId + ":" + fnv1a64(provider.key)` is the prefix for every query key, IndexedDB store, draft key, localStorage key, and session key. Two instances on one page, or two apps on one origin, or one app switching folders, never collide or show stale content from another provider.

## 7. Entry points and bundles

| Entry | Contents | Size budget (gz, excluding peers) |
|---|---|---|
| `.` | DocsProvider, hooks, keys, types, stores | 25 KB |
| `./tree` | PageTree (+ headless-tree, virtual) | included in the 80 KB tree+view budget |
| `./view` | DocumentView (PlateView + static nodes) | included in the 80 KB tree+view budget |
| `./editor` | DocumentEditor, Plate UI, lowlight, slash, toolbars, emoji picker | 260 KB |
| `./shell` | DocsShell and its parts (imports tree; lazy-imports editor via a host-provided loader or its own `React.lazy`) | 60 KB excluding editor |
| `./adapters/*` | one adapter each | 8 KB each |
| `./styles.css`, `./theme.css` | component styles; theme defaults | 20 KB / 4 KB |

`DocsShell` lazy-loads `./editor` (dynamic `import()` inside the shell entry; tsup emits it as a separate chunk); read mode uses `DocumentView` until the chunk is loaded, then the Plate `readOnly` editor. This keeps first paint light while preserving the no-remount click-to-edit once loaded (docs/05 section 8 has the swap rule). `size-limit` must measure the initial chunk of `./shell` without the dynamically imported editor chunk; if the tool counts dynamic chunks, measure `./shell` through the Tailwind smoke host's Vite build report instead and record the method in the phase report.
