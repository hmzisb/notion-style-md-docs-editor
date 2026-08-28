# 09. Implementation Plan

Format per task: **ID. Title** · deps · spec refs · Done when (acceptance criteria) · Verify (commands). Tasks within a phase are ordered; a task may start when its deps are checked in `PROGRESS.md`. Budgets are guidance for splitting, not deadlines: if a task exceeds roughly 2x its budget, split it and log why.

Gate scripts live in `scripts/gate.ts` and are wired as `pnpm gate <phase>`. A phase ends only when its gate is green and `docs/execution/PHASE-<n>-REPORT.md` exists.

---

## Phase 0: Foundation (core logic, tooling, fixtures)

**P0-T01. Workspace bootstrap** · deps: none · refs: docs/11
Done when: pnpm workspace with `packages/core`, `packages/react` (empty shell), `apps/playground` (empty), `fixtures/`, `smoke/`; MIT `LICENSE`; TypeScript project references with strict config; ESLint flat config with `eslint-plugin-boundaries` rules from docs/02 section 2; Prettier; Vitest workspace; Changesets initialized; tsup config per package; `size-limit`, `publint`, `@arethetypeswrong/cli` wired into `pnpm build`; `scripts/gate.ts`; GitHub Actions workflow running `pnpm gate all`; `.nvmrc`; `PROGRESS.md`, `DEVIATIONS.md`, `ASSUMPTIONS.md` present at root.
Verify: `pnpm i && pnpm typecheck && pnpm lint && pnpm test` (all pass on empty packages).

**P0-T02. Core models and contract schemas** · deps: T01 · refs: docs/03 §1, §7, §8, §9
Done when: `model.ts`, `provider.ts`, `errors.ts`, `contract/schemas.ts` (zod v4), `contract/version.ts`, `contract/openapi.ts` generating `contract/openapi.json` from the schemas (`pnpm contract:gen`), with a test that the committed file matches the generator output.
Verify: `pnpm --filter @hmzisb/notion-docs-core test` · `pnpm contract:gen && git diff --exit-code contract/openapi.json`

**P0-T03. Hashing and ids** · deps: T02 · refs: docs/03 §4.2, §4.9
Done when: `hash.ts` (`sha256Hex` via Web Crypto with a Node fallback check, `fnv1a64`), `ids.ts` (`generateId` ULID-style, monotonic within a ms, `pathHashId`, `folderHashId`); tests for vector values and uniqueness (10k ids).
Verify: `pnpm --filter @hmzisb/notion-docs-core test ids hash`

**P0-T04. Tree index and pure ops** · deps: T02 · refs: docs/03 §1, reference v2 §7
Done when: `tree.ts` with `buildIndex`, `ancestorsOf`, `isDescendant`, `descendantCount`, `applyRename`, `applyMeta`, `applyInsert`, `applyMove`, `applyRemove`; immutable (structural sharing); property tests with `fast-check`: no orphans, unique ids, `childIds` consistent with `parentId`, move guard.
Verify: `pnpm --filter @hmzisb/notion-docs-core test tree`

**P0-T05. Frontmatter** · deps: T02 · refs: docs/03 §5
Done when: `splitFrontmatter` and `joinFrontmatter` with CRLF detection, unknown keys and key order preserved, size cap, no-frontmatter files, malformed YAML → `validation` error; round-trip tests over 20 variants including nested objects, arrays, quoted strings, dates as strings.
Verify: `pnpm --filter @hmzisb/notion-docs-core test frontmatter`

**P0-T06. Paths and ordering** · deps: T02 · refs: docs/03 §4.4, §4.5
Done when: `fs/paths.ts` (`slugify` with NFKD folding, `uniqueSlug`, `pagePathFor`, `dirPathFor`, `isIndex`, `humanize`), `fs/ordering.ts` (`compareSiblings`, `nextOrder`, `midpointOrder`, `renumber`, precision-loss detection); table tests including unicode titles, collisions, natural sort (`page-2` before `page-10`).
Verify: `pnpm --filter @hmzisb/notion-docs-core test paths ordering`

**P0-T07. Link resolution** · deps: T04 · refs: docs/03 §6
Done when: `resolvePageLink` passes a 30-row table (relative, parent, dir form, root-absolute, fragments, queries, percent-encoding, schemes, protocol-relative).
Verify: `pnpm --filter @hmzisb/notion-docs-core test links`

**P0-T08. Fixture corpus and perf generators** · deps: T05 · refs: docs/10 §6
Done when: `fixtures/corpus/` with 30 nested pages across 4 levels (product, guides/{auth,billing,api/{rest,webhooks}}, specs, decisions, meeting-notes, assets/) covering: pages with and without frontmatter, `order` values, emoji and Lucide icons, README-as-index, relative links in every form, relative images, tables, task lists, nested and mixed lists, code blocks in 6 languages, blockquotes, GFM alerts, `<details>` blocks, an HTML comment (lossy), reference-style links (reformat), a footnote (lossy), CRLF file, a 60 KB page; `fixtures/corpus/rules/*.md` for custom rules; `fixtures/perf/gen.ts` producing a 5k-node tree and a 3k-block page into a temp dir; `loadCorpus()` in `core/testing`.
Verify: `pnpm --filter @hmzisb/notion-docs-core test corpus` (loads without error, counts match a manifest)

**P0-T09. Walk and MemoryFileStore** · deps: T05, T06, T08 · refs: docs/03 §3, §4.1, §4.3
Done when: `fs/walk.ts` (`buildSnapshotFromEntries(entries, readMeta)` implementing mapping, titles, ordering, folder nodes, README fallback, hidden exclusions, `idByPath` forms), `fs/memory-store.ts` (`MemoryFileStore` implementing `FileStore` including recursive `remove`, dir `move`, `stat`); snapshot tests against the corpus manifest.
Verify: `pnpm --filter @hmzisb/notion-docs-core test walk memory-store`

**P0-T10. FileStore provider: read side** · deps: T03, T09 · refs: docs/03 §2, §4.9, §4.10
Done when: `createFileStoreProvider(store, opts)` implements `key`, `capabilities`, `getMeta`, `getTree` (with `rootId`), `getPage` (version, eol, LF body), `assetUrl` (object URL cache when `Blob` and `URL.createObjectURL` exist, otherwise data URL fallback for Node tests), traversal rejection.
Verify: `pnpm --filter @hmzisb/notion-docs-core test provider-read`

**P0-T11. FileStore provider: write side** · deps: T10 · refs: docs/03 §4.2, §4.4-4.8
Done when: `savePage` (conflict check, id assignment on first write, frontmatter untouched, eol preserved, null base on folders), `createPage` (all four parent cases, conversion, slug collision, `order` at index), `updateMeta`, `movePage` (paths, guard, order-only moves, renumber), `deletePage` (subtree), warnings for duplicate ids.
Verify: `pnpm --filter @hmzisb/notion-docs-core test provider-write`

**P0-T12. Conformance suite** · deps: T11 · refs: docs/03 §10
Done when: `testing/conformance.ts` exports `runProviderConformance`; all cases in docs/03 §10 implemented; runs green against `createMemoryProvider` seeded from the corpus.
Verify: `pnpm --filter @hmzisb/notion-docs-core test conformance`

**P0-T13. Markdown codec** · deps: T02, T08 · refs: docs/05 §1, §3
Done when: Plate installed as peer + dev dep in core; `codec/base-kit.ts` with `Base*` plugins for the v1 block set and the Markdown plugin configured (GFM on, MDX off, pinned stringify options, `preserveEmptyParagraphs`); `createCodec`, `markdownToValue`, `valueToMarkdown`; golden tests: every corpus page parse → serialize equals `*.expected.md`, idempotence for all. Expected files are generated once, then reviewed line by line against the source before freezing: the manifest declares the intended fidelity level, and a generated expected file that drops or alters content on a page declared `exact` or `reformat` is a bug to fix in the kit, never a new baseline.
Verify: `pnpm --filter @hmzisb/notion-docs-core test codec`

**P0-T14. Fidelity classifier and doctor** · deps: T13 · refs: docs/05 §4
Done when: `classifyFidelity` with reasons; table tests: corpus pages classified as specified in the manifest (`exact`/`reformat`/`lossy` with expected reasons); `pnpm doctor <folder>` prints a table and exits non-zero when any `lossy` page exists (flag `--allow-lossy`).
Verify: `pnpm --filter @hmzisb/notion-docs-core test fidelity && pnpm doctor fixtures/corpus --allow-lossy`

**Gate 0** (`pnpm gate 0`): typecheck, lint (boundaries), core tests, core build with publint/attw, `contract/openapi.json` up to date, `docs/execution/PHASE-0-REPORT.md` written.

---

## Phase 1: Read path, shell, adapters, playground

**P1-T01. React package scaffold and primitives** · deps: Gate 0 · refs: docs/11 §3-5, docs/00 D-07, D-11
Done when: `packages/react` tsup entries for every subpath; `components.json` with aliases inside the package and the `@plate` registry configured; `npx shadcn@latest init -b radix` applied; primitives added: button, input, textarea, dialog, alert-dialog, dropdown-menu, popover, tooltip, command, scroll-area, skeleton, sheet, sidebar, separator, kbd, sonner (or the current toast); `.docs-root` scoping and `styles.css` build (Tailwind CLI compiling the package's own utilities with `@scope`, no preflight); `theme.css` generated from a fresh shadcn init output with the fallback variable block from docs/06 §2; `cn` util.
Verify: `pnpm --filter @hmzisb/notion-docs-react build` produces every entry and both CSS files; `publint` and `attw` pass.

**P1-T02. DocsProvider, namespace, queries** · deps: T01 · refs: docs/02 §6, docs/04 §1-2, §7-8, docs/08 §3
Done when: `DocsProvider` (context, `ns`, re-key on identity change, internal or host `QueryClient`, `strings` merge, `onEvent`), `createKeys`, `metaQuery`/`treeQuery`/`pageQuery` with `staleTime`/`gcTime` from docs/04 §1, `useMeta`, `useTreeIndex` (builds the index via `select` memoized on snapshot version), `usePage`, `useOnline`, `events.ts`, `strings.ts` with all keys from docs/06 and docs/07 (may grow later).
Verify: `pnpm --filter @hmzisb/notion-docs-react test provider queries`

**P1-T03. Persisted cache and value cache** · deps: T02 · refs: docs/04 §1-2, §6
Done when: `cache/idb.ts` (`idb-keyval` `AsyncStorage` with `entries`), `cache/persister.ts` (per-query persister with `maxAge`, `buster`, `persisterGc` in idle), `cache/value-cache.ts` (LRU 20), degrade-to-memory path with the `storage_unavailable` warning; tests with `fake-indexeddb`: restore before fetch, buster invalidation, quota error path.
Verify: `pnpm --filter @hmzisb/notion-docs-react test cache`

**P1-T04. Sidebar store and recents** · deps: T02 · refs: docs/04 §1 (L5, L6)
Done when: Zustand persist store keyed by `ns` with SSR-safe storage, `collapsed`, `width`, `expanded` record, `lastOpenedPageId`, `setExpanded`, `expandAll(ids)`, `collapseAll`; `recents.ts` with `useRecents` (max 12, dedupe, timestamps).
Verify: `pnpm --filter @hmzisb/notion-docs-react test sidebar-store recents`

**P1-T05. Memory adapter entry and playground bootstrap** · deps: T02 · refs: docs/08 §7, §8.1
Done when: `adapters/memory.ts` wraps core; `apps/playground` runs with Vite, TanStack Router (`/`, `/p/$pageId?mode=`), navigation adapter, demo mode seeded from the corpus, Inter font, theme toggle (system/light/dark) stored in localStorage, a temporary page list until the tree lands.
Verify: `pnpm dev` serves; `pnpm --filter playground typecheck`

**P1-T06. PageTree** · deps: T03, T04, T05 · refs: docs/06 §5, docs/07 §2 (tree), §9; reference v2 Appendix B
Done when: headless-tree + TanStack Virtual over `TreeIndex`; rows per docs/06 §5 (chevron, icon glyph with lazy Lucide import map, title, reserved action area); expanded state persisted; keyboard map for the tree except DnD/rename/delete (Phase 3); active row; `href` links when navigation provides `href`; `React.memo` rows on primitive props; RTL tests: arrows, Home/End, Enter, expand persistence across remount, active row, 5k rows render only ~40 DOM rows.
Verify: `pnpm --filter @hmzisb/notion-docs-react test tree`

**P1-T07. Shell** · deps: T06 · refs: docs/06 §4-6, §11, docs/07 §9
Done when: `DocsShell` with the adapted shadcn sidebar (persistence to the sidebar store, `Cmd+\`, no cookies), resize handle with keyboard, collapse with floating open button, mobile sheet below 768 px, `SidebarHeader`/`SidebarNav`/`SidebarFooter`, `PageHeader` with breadcrumbs (overflow menu) and reserved status area, skeletons, empty and error cards per docs/06 §11, live region for page changes; playground uses `DocsShell`.
Verify: RTL tests for collapse, resize keyboard, breadcrumbs overflow; screenshots reviewed at both sizes and both themes.

**P1-T08. DocumentView (read-only)** · deps: T07 · refs: docs/05 §7, docs/06 §7
Done when: `./view` entry with `PlateView` + static node components for the block set (from the `@plate` registry `*-static` items), `AssetImage` with `assetUrl` and skeleton, internal link navigation through `resolvePageLink`, external link policy, code copy button; shell renders `DocumentView` in read mode; RTL tests for link resolution and asset rendering.
Verify: `pnpm --filter @hmzisb/notion-docs-react test view`; `size-limit` for `./tree` + `./view` ≤ 80 KB gz excluding peers.

**P1-T09. Filesystem adapter** · deps: T02, Gate 0 · refs: docs/03 §3, §4.11, docs/08 §7
Done when: `FileStore` over `FileSystemDirectoryHandle` (recursive list with dot-dir exclusion, text/binary read, write via `createWritable` with a temp-file-and-move pattern where supported, recursive remove, move emulated by copy + remove for directories, `stat`), index cache in IndexedDB, `createFileSystemProvider`, `pickDirectory` (handle persisted in IndexedDB, permission re-query), `getOpfsRoot`, `exportToDirectory`, `importFromDirectory`; unit tests over an in-memory `FileSystemDirectoryHandle` polyfill; conformance suite green on the polyfill.
Verify: `pnpm --filter @hmzisb/notion-docs-react test filesystem`

**P1-T10. HTTP adapter** · deps: T02, Gate 0 · refs: docs/03 §9
Done when: `createHttpProvider` with `getMeta` capability fill, ETag quoting, `If-Match`, error envelope mapping to `ProviderError`, `network` errors on fetch failure, `headers()` sync or async, `credentials`, `rootId`, zod validation of responses; `msw` handlers implementing the contract over a `MemoryFileStore` for tests; conformance suite green through msw.
Verify: `pnpm --filter @hmzisb/notion-docs-react test http`

**P1-T11. Playground modes** · deps: T07, T09, T10 · refs: docs/01 §5.7, docs/08 §8.4-8.5
Done when: landing with Demo / Open folder / Browser storage / Remote (base URL input); mode persisted; handle reuse after reload with a permission prompt on gesture; "Open folder" hidden when unsupported; OPFS import/export buttons; the provider identity drives the cache namespace (switching folders never shows stale pages).
Verify: e2e `modes.spec.ts` (demo + OPFS); manual folder check documented in the report.

**P1-T12. Command palette and global shortcuts** · deps: T07 · refs: docs/06 §8, docs/07 §1-2, §4
Done when: `hotkeys.ts` utility with scopes and `formatKeys`; global shortcuts from docs/07 (excluding editor ones); `CommandPalette` with Recent, Pages, Actions groups, `Cmd+Enter` open in edit, `Shift+Enter` create when `write` (creation wired in Phase 3, stubbed now with a toast); Search row in the sidebar.
Verify: RTL tests for palette filtering and shortcut scoping; e2e `palette.spec.ts`.

**P1-T13. E2E skeleton, a11y, perf baseline** · deps: T11, T12 · refs: docs/10 §3-5
Done when: Playwright config with demo and OPFS projects; `axe-core` assertions on landing, tree, page; perf spec measuring cached page switch and tree scroll fps on the 5k fixture (numbers written to the report); Lighthouse a11y run script.
Verify: `pnpm test:e2e`

**Gate 1** (`pnpm gate 1`): Gate 0 items + react unit tests + e2e (demo, OPFS) + size-limit for `.`, `./tree`, `./view`, `./shell` + a11y assertions + `PHASE-1-REPORT.md` with perf numbers.

---

## Phase 2: Editing

**P2-T01. Editor entry and kit** · deps: Gate 1 · refs: docs/05 §1-2, §6, docs/06 §7
Done when: Plate local docs installed and read; `@plate` registry components added for the block set (nodes, `editor`, `block-placeholder`, `floating-toolbar` and buttons, `slash-node`, `block-draggable`, `link-*`, `image-*`, `code-block-*`, `table-*`, `list-*`); `EditorKit` composed from the core `BaseKit` plus React plugins; `DocumentEditor` keyed by `pageId`, `readOnly` toggle in place, chunked rendering on, `EditorErrorBoundary`, `./editor` entry; canvas styles per docs/06 §3 and §7; RTL smoke test rendering the corpus pages without console errors.
Verify: `pnpm --filter @hmzisb/notion-docs-react test editor`; `size-limit` for `./editor` ≤ 260 KB gz excluding peers (record the number; if above, log a deviation with the breakdown).

**P2-T02. Shell mode transitions and editor loading** · deps: T01 · refs: docs/05 §8, docs/07 §7
Done when: `preloadEditor()`, idle and hover preload, spinner-in-control while loading, `DocumentView` → `<Plate>` swap inside the same scroll container with `scrollTop` restore, all transitions in docs/07 §7 including URL `mode` sync with `replace: true`, `ModeToggle`.
Verify: e2e `mode.spec.ts` (click-to-edit at a scroll offset keeps the offset; `E`; `Esc`; Done).

**P2-T03. Document session and drafts** · deps: T01 · refs: docs/04 §3
Done when: session store + `useDocumentSession` implementing the state machine, timers, flush events, draft store (IndexedDB, 500 ms), draft restore paths (same base, different base), deep-equal short circuit, `beforeunload` guard with `guardUnload`; fake-timer tests for every transition in docs/04 §3.2 and both draft paths.
Verify: `pnpm --filter @hmzisb/notion-docs-react test session drafts`

**P2-T04. Save status and banners** · deps: T03 · refs: docs/06 §9-10, docs/07 §9
Done when: `SaveStatus` with the exact rendering rules (800 ms saving delay, quiet states), reserved width, tooltip with last saved time; banners: lossy (reasons list), conflict, draft restored, draft mismatch, large page; live region roles.
Verify: RTL tests per status; screenshots reviewed.

**P2-T05. Blocks, slash menu, floating toolbar, autoformat** · deps: T01 · refs: docs/05 §2, §6, docs/06 §7-8, docs/07 §2 (editor)
Done when: marks, headings, blockquote, divider, lists (indent-based, todo), code block with explicit languages, table, link popover (`Cmd+K` in editor), image via URL or relative path, slash menu with groups and descriptions, floating toolbar with Turn into, autoformat rules, placeholders, trailing block, Notion shortcut mapping (`Cmd+Alt+0-8`, `Cmd+Shift+.`, `Cmd+Enter`, `Cmd+Shift+↑/↓`, `Cmd+D`); golden e2e: each block inserted through the slash menu and saved produces the expected Markdown snippet.
Verify: e2e `blocks.spec.ts`; core golden tests still green.

**P2-T06. Block DnD and block selection** · deps: T05 · refs: docs/05 §6, docs/06 §7
Done when: gutter handle and `+` per docs/06 §7, drop indicator, block selection with `Esc`, `Cmd+A` twice, `Delete`, `Cmd+D`, arrow navigation; no layout shift when handles appear.
Verify: e2e `block-dnd.spec.ts` (drag paragraph below heading; selection delete).

**P2-T07. Title edit and icon picker** · deps: T04 · refs: docs/06 §7-8, docs/07 §5-6
Done when: `PageTitle` textarea behavior, `updateMeta` debounced + flush on blur, tree row live update, `Enter` to first block; `PageIcon` + `IconPicker` (frimousse emoji grid with skin tones and search, Lucide grid with search and lazy icon loading, Remove, Random); `useUpdateMeta` optimistic on tree and open page.
Verify: RTL tests for title commit paths and picker keyboard; e2e `title-icon.spec.ts`.

**P2-T08. Offline handling** · deps: T03 · refs: docs/04 §3.4, docs/00 D-05
Done when: retry schedule with reuse of the latest value, `online` and focus triggers, reads from cache offline, "Not available offline" card, structural actions disabled with tooltip, status Offline; tests with a memory provider `failNext: 'network'` and an e2e using Playwright's `context.setOffline`.
Verify: `pnpm --filter @hmzisb/notion-docs-react test offline`; e2e `offline.spec.ts`.

**P2-T09. Conflicts end to end** · deps: T03, T04 · refs: docs/04 §3.5
Done when: 409 path (Reload, Overwrite), refresh-with-new-version while dirty, subscribe echo suppression stub; e2e in OPFS mode: modify the file behind the app (second page in the same context writing through OPFS), trigger a save, resolve both ways, verify the file.
Verify: e2e `conflict.spec.ts`.

**P2-T10. Callout rule and kit (stretch, D-17)** · deps: Gate 0 T13, T05 · refs: docs/05 §5
Done when: core rule pair with golden + idempotence tests on `fixtures/corpus/rules/callout.md`; `CalloutKit` with variant picker instead of icon picker; slash item and autoformat; `Cmd+Alt+9`. Budget: half a day. Over budget or failing: remove from the slash menu, keep the blockquote fallback (a `[!NOTE]` blockquote renders as a blockquote), log deviation.
Verify: `pnpm --filter @hmzisb/notion-docs-core test rules-callout`; e2e block golden extended.

**P2-T11. Toggle rule and kit (stretch, D-17)** · deps: T10 · refs: docs/05 §5
Done when: `<details>` rule pair with tests on `rules/toggle.md` (nested content, empty toggle, missing summary); `ToggleKit`, `Cmd+Alt+7`, `Cmd+Enter` open/close, `Tab` moves blocks into the toggle. Same budget and fallback rule as T10 (fallback: `<details>` stays raw HTML → `lossy`).
Verify: `pnpm --filter @hmzisb/notion-docs-core test rules-toggle`.

**P2-T12. Image caption rule (stretch)** · deps: T05 · refs: docs/05 §5
Done when: rule pair with idempotence tests on `rules/caption.md`; caption editing in the image block. Fallback: captions not persisted, caption input hidden, log deviation.
Verify: `pnpm --filter @hmzisb/notion-docs-core test rules-caption`.

**P2-T13. Asset upload** · deps: T05, Gate 1 T09 · refs: docs/03 §4.10, docs/05 §6
Done when: filesystem provider implements `uploadAsset` (writes to `<page dir>/assets/<slugged-name>`, collision suffix), `capabilities.upload` gating in the slash item and paste/drop handlers, inline progress, http adapter multipart path; tests on the polyfill store.
Verify: `pnpm --filter @hmzisb/notion-docs-react test upload`; e2e `upload.spec.ts` in OPFS mode.

**P2-T14. Edit round-trip e2e** · deps: T02-T09 · refs: docs/01 §7
Done when: e2e in OPFS mode: open corpus page → edit one word → wait for save → read the file through OPFS → diff equals one word for every `exact` page in the manifest; reload mid-typing → draft banner → Keep → save → file contains the draft; unedited page opened and closed → file bytes unchanged.
Verify: e2e `roundtrip.spec.ts`.

**Gate 2** (`pnpm gate 2`): Gate 1 items + all Phase 2 unit and e2e specs + `./editor` size recorded + `pnpm doctor fixtures/corpus --allow-lossy` + `PHASE-2-REPORT.md` listing which stretch blocks shipped.

---

## Phase 3: Page operations, polish, packaging

**P3-T01. Create page flows** · deps: Gate 2 · refs: docs/01 §5.3, docs/04 §4, docs/07 §2
Done when: `useCreatePage` with temp-id optimistic insert, temp page seeded into the page query, id replacement without editor remount, fresh-page flag; entry points: row `+`, header New page, footer New page, palette action and `Shift+Enter`, `Cmd+Alt+N`, `Cmd+Shift+→` in the tree; the page opens immediately in edit mode with the title focused; the first title commit renames `untitled*.md` to the slug through `updateMeta(id, patch, { renameFile: true })` and the tree shows the new path after refetch; failure path removes the row, navigates back, and toasts.
Verify: RTL for the mutation; e2e `create.spec.ts`.

**P3-T02. Rename, change icon, row menu** · deps: T01 · refs: docs/06 §5, docs/07 §5-6
Done when: inline rename (`F2`, double-click, menu), empty-title rejection, row menu (Add inside, Rename, Change icon, Copy link, Move to, Delete) with capability gating; hover reveal without layout shift.
Verify: RTL for rename paths; e2e `rename.spec.ts`.

**P3-T03. Tree drag and drop, keyboard move, Move to** · deps: T02 · refs: docs/07 §3, docs/06 §5
Done when: headless-tree DnD with the visual rules, descendant guard, auto-expand, auto-scroll, `Esc`, optimistic `applyMove` with rollback and toast; `Cmd+↑/↓`; `MoveToDialog`.
Verify: e2e `move.spec.ts` (before, after, into, guard, keyboard, dialog).

**P3-T04. Delete** · deps: T02 · refs: docs/06 §8, docs/04 §4
Done when: `DeleteDialog` with descendant count copy, destructive button, optimistic removal, navigation to parent or home when the open page is inside the subtree, cleanup of page queries, L3 and L4 entries; `Delete`/`Backspace` in the tree.
Verify: RTL + e2e `delete.spec.ts`.

**P3-T05. Folder nodes** · deps: T01 · refs: docs/03 §4.1, docs/06 §11
Done when: folder rows (icon, not openable in read hosts: show child list card), "Create page" converts folder → page keeping the id (`savePage` null base), read-only hosts list children.
Verify: e2e `folder.spec.ts` in OPFS mode with a folder lacking `index.md`.

**P3-T06. Page menu** · deps: T01 · refs: docs/06 §8
Done when: Copy link (`href` when provided, else the page id), Copy as Markdown (frontmatter + body), Download .md, Change icon, Rename (focuses the title), Move to, Word count row, Delete; toasts for copy actions.
Verify: RTL tests; e2e `page-menu.spec.ts`.

**P3-T07. Block menu and emoji combobox (optional)** · deps: Gate 2 · refs: docs/05 §2
Done when: `BlockMenuKit` (right-click: Turn into, Duplicate, Delete, Copy) wired; `EmojiKit` with `:` trigger if the Markdown round trip through shortcodes is exact for the corpus, else skipped with a deviation.
Verify: e2e `block-menu.spec.ts`.

**P3-T08. Expand/collapse all, palette actions, theme** · deps: T01 · refs: docs/06 §8
Done when: sidebar footer or header control for expand-all/collapse-all, palette actions for both, `onThemeChange` action, `useSidebarStore.expandAll` performance on 5k nodes (single state update).
Verify: RTL tests.

**P3-T09. Capability, strings, events audit** · deps: T06 · refs: docs/01 §6, docs/08 §3, §6
Done when: a read-only provider renders zero write affordances (snapshot test enumerating buttons and menu items), every user-facing string comes from `strings` (lint rule or test scanning JSX for literal text), every event in `DocsEvent` is emitted at least once in tests.
Verify: `pnpm --filter @hmzisb/notion-docs-react test audit`.

**P3-T10. Accessibility pass** · deps: T09 · refs: docs/07 §9
Done when: axe clean on every e2e page; keyboard-only e2e that creates, renames, moves (keyboard), edits, and deletes a page without a mouse; reduced-motion snapshot; touch layout check at 390 px including 44 px targets.
Verify: e2e `a11y.spec.ts`, `keyboard-only.spec.ts`.

**P3-T11. Performance pass** · deps: T09 · refs: docs/10 §5
Done when: measurements against every budget in docs/10 §5 recorded in the report from the perf fixtures; React Profiler check that typing does not re-render `PageTree`, `Sidebar`, or `PageHeader`; parse-once and serialize-on-save verified with counters in tests.
Verify: e2e `perf.spec.ts` prints and asserts budgets with a 20% tolerance.

**P3-T12. Built-package smoke hosts** · deps: T09 · refs: docs/00 D-19, docs/11 §7
Done when: `smoke/tailwind-host` consumes `dist` with `@source` and renders the shell over the memory provider; `smoke/plain-host` consumes `styles.css` without Tailwind and renders `PageTree` + `DocumentView`; both build in CI and run a Playwright smoke; `publint`, `attw`, `size-limit` green.
Verify: `pnpm smoke`.

**P3-T13. Docs and versioning** · deps: T12 · refs: docs/08
Done when: `packages/*/README.md` (install, quick start, adapters, theming, browser support), `docs/08` synced with the real exports (a test compares the exports map with the documented list), Changesets for initial `0.1.0` versions, `CHANGELOG.md` generated.
Verify: `pnpm changeset status`.

**P3-T14. Visual QA and polish** · deps: T12 · refs: docs/06 §15
Done when: screenshot review of every screen and state at both sizes and both themes against the checklist; fixes applied; screenshots stored under `apps/playground/e2e/__screenshots__` as baselines with `toHaveScreenshot` for: sidebar, page read, page edit with slash menu open, palette, icon picker, conflict banner, mobile sheet, dark variants.
Verify: e2e `visual.spec.ts` green.

**Gate 3** (`pnpm gate 3`): everything from Gate 2 + Phase 3 specs + smoke + size + visual baselines + `PHASE-3-REPORT.md`. The module is consumable after this gate.

---

## Phase 4: Hardening (recommended, not required for handover)

**P4-T01. Filesystem watch and subscribe** · refs: docs/04 §5 · Done when: polling watcher, `ChangeEvent` emission, echo suppression e2e (external write appears within 5 s; own save does not refetch). Verify: e2e `watch.spec.ts`.
**P4-T02. HTTP events** · refs: docs/03 §9 · Done when: `events: 'sse' | 'poll'` implemented with reconnect and backoff; msw tests. Verify: unit tests.
**P4-T03. Draft compare dialog** · refs: docs/04 §3.3 · Done when: side-by-side text diff (a small diff implementation or `diff` package with a deviation entry). Verify: RTL test.
**P4-T04. Large page path** · refs: docs/05 §6 · Done when: 5k-block fixture opens read-only with the banner and "Edit anyway" works within budget. Verify: e2e `large.spec.ts`.
**P4-T05. Doctor polish and `ids` migration** · refs: docs/05 §4, docs/03 §4.2 · Done when: `pnpm doctor` gains `--write-ids` to assign ids and migrate leading H1 titles into `title` in one pass over a folder (Node `FileStore` implementation in `scripts/`, not published). Verify: unit tests on a temp copy of the corpus.
**P4-T07. Local content search (optional)** · refs: docs/01 §6 · Done when: `createFileStoreProvider` implements `search` (title matches first, then body matches ranked by count, snippet ±60 chars, caps: 2k files, 4 MB scanned per query, bodies cached in the index cache) and `capabilities.search` is true for memory and filesystem providers. Verify: unit tests + palette e2e.
**P4-T08. Scroll restoration (optional)** · refs: docs/07 §7 · Done when: per-page `scrollTop` kept in the session store and restored on back navigation within the session. Verify: e2e.
**P4-T09. Final report** · Done when: `docs/execution/FINAL-REPORT.md` summarizes measurements, deviations, assumptions, and known gaps.

---

## Dependency summary

```
P0: T01 → T02 → {T03, T04, T05, T06} → T07/T08 → T09 → T10 → T11 → T12 ; T13 (needs T02, T08) → T14
P1: T01 → T02 → {T03, T04, T05} → T06 → T07 → T08 ; {T09, T10} → T11 ; T12 → T13
P2: T01 → {T02, T03, T05} ; T03 → {T04, T08, T09} ; T05 → {T06, T07, T10 → T11, T12, T13} ; all → T14
P3: T01 → {T02, T05, T06, T08} ; T02 → {T03, T04} ; T06 → T09 → {T10, T11, T12} → {T13, T14}
```
