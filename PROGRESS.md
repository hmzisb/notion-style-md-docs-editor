# PROGRESS

Claude Code maintains this file. Check a box only when the task's verification command is green and the commit is made. Add one line under each checked task: what shipped, and the measurement if the task has one.

Legend: `[ ]` not started · `[~]` in progress (only one at a time) · `[x]` done · `[-]` dropped with a DEVIATIONS entry

## Phase 0: Foundation

- [x] **P0-T01** Workspace bootstrap
  - pnpm workspace (core, react, playground, fixtures, smoke), strict TS project refs, ESLint flat config with `boundaries` verified firing, Prettier, Vitest projects, Changesets, tsup, size-limit/publint/attw, `scripts/gate.ts`, CI. `pnpm i && pnpm typecheck && pnpm lint && pnpm test` green.
- [x] **P0-T02** Core models and contract schemas
  - `model.ts`, `provider.ts`, `errors.ts`, zod v4 `contract/schemas.ts`, `contract/version.ts`; `contract/openapi.ts` generates OpenAPI 3.1 with `$ref`s from the zod registry; committed `contract/openapi.json` verified byte-identical by test. 14 tests.
- [x] **P0-T03** Hashing and ids
  - `hash.ts` (`sha256Hex`/`pageVersion` over Web Crypto, `fnv1a64`) and `ids.ts` (ULID-style `generateId` monotonic within a ms, `pathHashId`, `folderHashId`). Published SHA-256 and FNV-1a vectors; 10k ids unique; 1000 same-ms ids strictly increasing.
- [x] **P0-T04** Tree index and pure ops
  - `tree.ts`: `buildIndex` (file + directory path forms), `ancestorsOf`, `isDescendant`, `descendantCount`, `subtreeIds`, `flatten` and immutable `applyRename`/`applyMeta`/`applyInsert`/`applyMove`/`applyRemove` with structural sharing. fast-check over 40-op sequences asserts no orphans, single parent, `childIds`↔`parentId` agreement, reachability and the move guard.
- [x] **P0-T05** Frontmatter
  - `frontmatter.ts`: `splitFrontmatter`/`joinFrontmatter` with CRLF detection, 64 KB cap, malformed YAML → `validation`, BOM strip, unterminated delimiter treated as body. Passing the split result back to `join` re-emits the block byte for byte, so quoting **and comments** survive (better than the documented limitation). 20 variants round-trip and are idempotent; 59 tests.
- [x] **P0-T06** Paths and ordering
  - `fs/paths.ts`: `slugify` (NFKD fold, 64-char cap), `uniqueSlug`, `pagePathFor`/`dirPathFor`/`assetBaseFor`, `isIndex`/`isHidden`/`isMarkdown`, `normalizePath` (traversal above root → `null`), `humanize`/`titleFromPath`. `fs/ordering.ts`: digit-run `compareNatural`, `compareSiblings` (ordered first, then pages before folders), `nextOrder`, `midpointOrder` with precision-loss detection, `renumber`. 54 tests incl. unicode titles, collisions, `page-2` before `page-10`, repeated halving until renumber.
- [x] **P0-T07** Link resolution
  - `links.ts`: `parseHref` (query/fragment split, per-segment percent-decode, scheme and protocol-relative detection), `normalizeRelative`, `resolvePageLink` trying path → `.md` → `index.md`/`README.md`. 39-row resolve table plus `parseHref`/`normalizeRelative` cases; 51 tests.
- [x] **P0-T08** Fixture corpus and perf generators
  - `fixtures/corpus/`: 33 pages over 5 levels (product, guides/{auth,billing,api/{rest,webhooks}}, specs, decisions, meeting-notes), one index-less folder, 4 assets, 2 ignored entries, 3 rule goldens. Covers frontmatter present/absent, `order`, emoji and Lucide icons, README-as-index, every link form, relative images, tables, task lists, nested/mixed lists, code in 6 languages, blockquotes, GFM alerts, `<details>`, HTML comment (lossy), reference links (reformat), footnote (lossy), CRLF, a 61 KB page. `manifest.json` declares kind/title/parent/order/icon/eol/bytes/fidelity per file. `fixtures/perf/gen.ts` writes a 5k-node tree and a 3k-block page to a temp dir; `loadCorpus()` in `@docs/core/testing`. 67 corpus tests + 3 generator tests.
- [x] **P0-T09** Walk and MemoryFileStore
  - `fs/walk.ts`: `buildSnapshotFromEntries` implementing the file-to-node mapping, README fallback, folder nodes, hidden/vendored exclusion, title fallback chain, sibling ordering, duplicate-id warnings and the `fnv1a64` snapshot version. `fs/memory-store.ts`: `MemoryFileStore` with recursive `remove`, prefix `move`, `stat`, `watch`, read-only mode and traversal rejection, every failure arriving as a rejected promise. `icon.ts`: `parseIcon`/`formatIcon`. `tree.ts` now registers the README and trailing-slash `idByPath` forms. 68 walk/store tests + 17 icon tests; the corpus walk is asserted node-by-node against the manifest.
- [x] **P0-T10** FileStore provider: read side
  - `fs/semantics.ts`: `createFileStoreProvider` turns any `FileStore` into a `DocumentProvider`. Key and capabilities derive from the store (read-only stores lose write/move/delete/upload, `subscribe` follows `store.watch`), overridable per option. One cached walk backs `getTree`, dropped by `invalidate()` and by the store watcher, which then emits a `tree` change event. `getTree({ rootId })` serves a subtree with the scope node reparented to null. `getPage` returns an LF body, the `sha256:` file version, `updatedAt` from frontmatter then mtime, and `eol: 'crlf'` only for CRLF files. `assetUrl` resolves against the page directory, rejects traversal above the root, caches per path+mtime and revokes on `dispose`, falling back to a data URL where `URL.createObjectURL` is absent. Write methods are `unsupported` until P0-T11. 23 provider-read tests.
- [x] **P0-T11** FileStore provider: write side
  - `savePage` (conflict check against the file hash, id persisted on first write, unknown frontmatter keys and their order untouched, EOL preserved, null base on a folder writes its `index.md` and flips it to a page), `updateMeta` (title and icon into frontmatter, icon validated, optional `renameFile` for a fresh page which renames the directory for an index page), `createPage` (root / folder / directory page / leaf page with conversion, slug collision suffixes, `untitled` fallback, `order` only when placed at an index), `movePage` (path rewrite, subtree follows a directory move, order-only move inside the same directory, own-subtree guard, sibling renumber with `onRenumber`), `deletePage` (subtree, root-index guard). A per-path frontmatter cache keeps a write from re-reading the corpus. 32 provider-write tests.
- [x] **P0-T12** Conformance suite
  - `testing/conformance.ts` exports `runProviderConformance(makeProvider, opts)`: every case in docs/03 section 10 driven through the `DocumentProvider` interface alone, so the same suite serves memory, the filesystem adapter and http. Cases discover what they need from the tree and fail with a seed hint when it is missing. Runs twice over the corpus (writable and read-only): 52 cases. Fixed along the way: `pnpm build` had never worked (tsup's dts worker cannot build a composite program, TS6307) and `size-limit` was measuring `yaml` against a budget that excludes it; `scripts/verify.sh` now runs `pnpm build` too.
- [x] **P0-T13** Markdown codec
  - `codec/base-kit.ts` (headless v1 plugin list, pinned `remark-stringify` options, four fidelity rules) and `codec/codec.ts` (`createCodec`, `defaultCodec`, `markdownToValue`, `valueToMarkdown`, `normalizeMarkdown`). `remarkInlineRefs` rewrites reference links inline. 30 of the 33 corpus pages round trip byte for byte; the other three have goldens in `fixtures/expected/`. 68 codec tests.
- [x] **P0-T14** Fidelity classifier and doctor
  - `codec/fidelity.ts` (`classifyFidelity`): normalize-compare for `exact`, then one census of both mdast trees for the reasons, then a tree comparison with the known reformats applied. `scripts/doctor.ts` prints the table and exits 1 on a lossy page unless `--allow-lossy`. 45 tests, including all 33 corpus pages against the manifest.
- [x] **Gate 0** green, `docs/execution/PHASE-0-REPORT.md` written

## Phase 1: Read path, shell, adapters, playground

- [x] **P1-T01** React package scaffold and primitives
  - Eight tsup entries (`.`, `./tree`, `./editor`, `./view`, `./shell`, three adapters) plus `dist/styles.css` and `dist/theme.css` from `build:css`. `components.json` on the Radix engine (`shadcn info` reports `base radix`) with the `@plate` registry; 17 primitives vendored into `src/ui` with their host coupling removed (no cookie, `Cmd+\` for the sidebar, no `next-themes`) and recorded in `REGISTRY-SYNC.md`. `styles.css` compiles utilities from the package's own sources with no preflight and no `:root` left in the output; `theme.css` is generated one-shot by `scripts/gen-theme.ts`. `cn` in `src/lib/utils.ts`. `publint`, `attw` and three new size budgets green.
- [x] **P1-T02** DocsProvider, namespace, queries
  - `data/keys.ts` (`createNamespace` = `docs:<instance>:<fnv1a64(provider.key)>`, `createKeys`), `data/events.ts` (`DocsEvent`, an emitter that rethrows a throwing host handler on its own task), `data/strings.ts` (162 keys plus `format`), `data/queries.ts` (`metaQuery`/`treeQuery`/`pageQuery` with the docs/04 lifetimes, `useMeta`, `useTreeIndex` with a version-memoized `select`, `usePage` idle on `null`), `data/online.ts`, `data/DocsProvider.tsx` (host or internal `QueryClient`, subtree remount on namespace change, stable emitter, resolved options, capabilities from meta with a provider fallback). 20 tests.
- [x] **P1-T03** Persisted cache and value cache
- [x] **P1-T04** Sidebar store and recents
- [x] **P1-T05** Memory adapter entry and playground bootstrap
- [x] **P1-T06** PageTree
  - `tree/PageTree.tsx` (headless-tree `syncDataLoader` + `hotkeysCore` + `search` over a virtualized list, synthetic root, expansion in the sidebar store, skeleton/empty/error states), `tree/PageTreeRow.tsx` (`React.memo` on primitives, roving tabindex, chevron button, `href` links, reserved action slot), `tree/IconGlyph.tsx` (emoji, lazy `DynamicIcon`, kind defaults). Type-ahead by title prefix. 12 RTL tests; `./tree + ./view` 29.8 kB gz.
- [x] **P1-T07** Shell
- [x] **P1-T08** DocumentView (read-only)
  - `view/DocumentView.tsx` (`PlateView` over the codec's `BaseKit`, value cached L3 by `ns:id:version`, list wrapper overridden on `BaseListPlugin`), `view/nodes.tsx` (static components for the whole v1 block set, 24 px list marker column, to-do checkbox, code copy button, raw HTML hidden), `view/LinkStatic.tsx` (internal links through `resolvePageLink`, external ones through the `isSafeHref` policy, unresolved ones inert), `view/AssetImage.tsx` (`assetUrl` with a skeleton and an `ImageOff` notice), `core/links.ts` gains `isSafeHref`. Shell renders it in read mode. 16 RTL tests; `./tree + ./view` 30.18 kB gz.
- [x] **P1-T09** Filesystem adapter
  - `adapters/filesystem-store.ts` (`FileStore` over a `FileSystemDirectoryHandle`: recursive listing with dot-dir and `node_modules` exclusion, directories derived from file paths, `File` reads, overwrite through a hidden temp file plus `move` where the engine has it, recursive `removeEntry`, native file move with copy + remove for directories, `stat`, optional polling `watch`), `adapters/filesystem.ts` (`createFileSystemProvider` with the IndexedDB index cache from docs/03 section 4.11 and its `onProgress`, `pickDirectory` with handle reuse and permission re-query, `getOpfsRoot`, `exportToDirectory`, `importFromDirectory`), `adapters/filesystem-fake.ts` (in-memory handle polyfill). Core gains `FileStoreProviderOptions.infoCache`. 29 unit tests plus 78 conformance cases over three store variants.
- [x] **P1-T10** HTTP adapter
  - `adapters/http.ts` (`createHttpProvider` over docs/03 section 9: capabilities all-false until `getMeta` fills them, optional methods attached and withdrawn with their flag, bare versions in JSON and quoted in `ETag`/`If-Match`, error envelope mapped to `ProviderError`/`ConflictError` with a status fallback, `network` on a rejected fetch, sync or async `headers()`, `credentials`, `rootId`, every response parsed against the contract schemas with the frontmatter key order restored, pure-path `assetUrl` with traversal rejection), `adapters/http-handlers.ts` (msw handlers serving the contract over any provider, for tests). 18 unit tests plus 52 conformance cases over msw.
- [x] **P1-T11** Playground modes
  - `src/providers.ts` (the four modes of docs/01 section 5.7, their providers and the localStorage record: a new picker slot per folder and an epoch per OPFS import keep every workspace in its own cache namespace), `src/workspace.ts` (`useWorkspace`: restore on load except a folder, which waits for its gesture, one attempt token so a slow open never lands on a newer choice, import and export), `src/Landing.tsx` (four cards, folder and OPFS cards hidden where the engine has neither, remote base URL form), header workspace button back to the landing. Playwright config with `demo`, `opfs` and `@smoke`-only `opfs-webkit` projects, console-noise fixture, `e2e/modes.spec.ts` (14 runs) and 6 unit tests for the settings and slot rules.
- [x] **P1-T12** Command palette and global shortcuts
  - `lib/hotkeys.ts` (`useHotkeys` with the five scopes of docs/07 section 1, physical-key matching through `event.code` so `Alt+N` still works on a Mac layout, `formatKeys` glyphs per platform), `shell/CommandPalette.tsx` (docs/06 section 8: Recent, Pages, content Results and Actions; cmdk's own `defaultFilter` pre-ranks the tree and mounts at most 50 rows, `Cmd+Enter` opens in edit and `Shift+Enter` creates, provider search debounced 250 ms behind a 2-character floor with pending and retry rows), sidebar Search row and a mobile header button as the pointer entry points, and the single `Toaster` docs/07 section 10 puts on the shell. 13 RTL tests plus 6 e2e (18 runs). `./shell` measures 89.99 kB gz (DEV-012).
- [x] **P1-T13** E2E skeleton, a11y, perf baseline
  - `e2e/a11y.spec.ts` (axe over WCAG 2.1 A/AA on the landing, the shell and tree, an open page in both themes, and the phone layout with the sheet sidebar; 11 runs), `e2e/perf.spec.ts` (click-to-paint measured inside the page, and a 60-frame scroll of the 5,000-node `?bench=` workspace added to `src/providers.ts`), `scripts/lighthouse-a11y.ts` (`pnpm a11y:lighthouse`, ASM-058). Cached page switch 47.2 ms (budget 100), tree scroll 9.69 ms/frame with 37 rows mounted (budget 45), Lighthouse accessibility 100. Four violations fixed on the way: a dangling `aria-controls` on the phone's sidebar button, `aria-label` on a role-less status div, headless-tree's live region inside `role="tree"`, and the sidebar shortcut hint at 4.42:1 (DEV-014).
- [x] **Gate 1** green, `docs/execution/PHASE-1-REPORT.md` written

## Phase 2: Editing

- [x] **P2-T01** Editor entry and kit
  - `./editor` entry: `DocumentEditor` (docs/08 section 5 props; `value` is initial-only, the session owns parsing, `readOnly` flips in place on one `usePlateEditor` instance), `EditorErrorBoundary`, `createEditorKit` (React kits over the headless `BaseKit`, typed as `AnyPlatePlugin | AnySlatePlugin`, `toolbar: 'none'` drops the floating toolbar - ASM-059). 25 Plate registry items vendored into `editor/ui` by hand (DEV-015) with their kits; `lib/block-styles.ts` is the one class table both `view/nodes.tsx` and the editor nodes read, so a mode swap moves nothing (docs/05 section 8). `react-hooks` wired into ESLint (ASM-060) with a scoped override for the vendored files (DEV-016). 40 RTL tests, every corpus page mounted without a console error. `./editor` measures 166.66 kB gz against a 260 kB budget.
- [x] **P2-T02** Shell mode transitions and editor loading
- [x] **P2-T03** Document session and drafts
- [x] **P2-T04** Save status and banners
- [x] **P2-T05** Blocks, slash menu, floating toolbar, autoformat
- [x] **P2-T06** Block DnD and block selection
- [ ] **P2-T07** Title edit and icon picker
- [ ] **P2-T08** Offline handling
- [ ] **P2-T09** Conflicts end to end
- [ ] **P2-T10** Callout rule and kit (stretch, D-17)
- [ ] **P2-T11** Toggle rule and kit (stretch, D-17)
- [ ] **P2-T12** Image caption rule (stretch)
- [ ] **P2-T13** Asset upload
- [ ] **P2-T14** Edit round-trip e2e
- [ ] **Gate 2** green, `docs/execution/PHASE-2-REPORT.md` written

## Phase 3: Page operations, polish, packaging

- [ ] **P3-T01** Create page flows
- [ ] **P3-T02** Rename, change icon, row menu
- [ ] **P3-T03** Tree drag and drop, keyboard move, Move to
- [ ] **P3-T04** Delete
- [ ] **P3-T05** Folder nodes
- [ ] **P3-T06** Page menu
- [ ] **P3-T07** Block menu and emoji combobox (optional)
- [ ] **P3-T08** Expand/collapse all, palette actions, theme
- [ ] **P3-T09** Capability, strings, events audit
- [ ] **P3-T10** Accessibility pass
- [ ] **P3-T11** Performance pass
- [ ] **P3-T12** Built-package smoke hosts
- [ ] **P3-T13** Docs and versioning
- [ ] **P3-T14** Visual QA and polish
- [ ] **Gate 3** green, `docs/execution/PHASE-3-REPORT.md` written

## Phase 4: Hardening (optional)

- [ ] **P4-T01** Filesystem watch and subscribe
- [ ] **P4-T02** HTTP events
- [ ] **P4-T03** Draft compare dialog
- [ ] **P4-T04** Large page path
- [ ] **P4-T05** Doctor polish and `ids` migration
- [ ] **P4-T07** Local content search (optional)
- [ ] **P4-T08** Scroll restoration (optional)
- [ ] **P4-T09** Final report

## Notes

- Current task: P2-T07
- Open at Gate 2: `./shell` measures 101.3 kB gz against the 60 kB budget in docs/02 section 7, capped at 102 kB as a ratchet; the cut is due once `PageMenu` exists, and `size-limit`'s `ignore` now makes a lazy palette/toaster/menu chunk measurable (DEV-012, ASM-063).
- Last gate passed: Gate 1 (2026-08-26)
