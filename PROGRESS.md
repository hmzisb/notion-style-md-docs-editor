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
- [ ] **P0-T12** Conformance suite
- [ ] **P0-T13** Markdown codec
- [ ] **P0-T14** Fidelity classifier and doctor
- [ ] **Gate 0** green, `docs/execution/PHASE-0-REPORT.md` written

## Phase 1: Read path, shell, adapters, playground

- [ ] **P1-T01** React package scaffold and primitives
- [ ] **P1-T02** DocsProvider, namespace, queries
- [ ] **P1-T03** Persisted cache and value cache
- [ ] **P1-T04** Sidebar store and recents
- [ ] **P1-T05** Memory adapter entry and playground bootstrap
- [ ] **P1-T06** PageTree
- [ ] **P1-T07** Shell
- [ ] **P1-T08** DocumentView (read-only)
- [ ] **P1-T09** Filesystem adapter
- [ ] **P1-T10** HTTP adapter
- [ ] **P1-T11** Playground modes
- [ ] **P1-T12** Command palette and global shortcuts
- [ ] **P1-T13** E2E skeleton, a11y, perf baseline
- [ ] **Gate 1** green, `docs/execution/PHASE-1-REPORT.md` written

## Phase 2: Editing

- [ ] **P2-T01** Editor entry and kit
- [ ] **P2-T02** Shell mode transitions and editor loading
- [ ] **P2-T03** Document session and drafts
- [ ] **P2-T04** Save status and banners
- [ ] **P2-T05** Blocks, slash menu, floating toolbar, autoformat
- [ ] **P2-T06** Block DnD and block selection
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

- Current task: P0-T12
- Last gate passed: (none)
