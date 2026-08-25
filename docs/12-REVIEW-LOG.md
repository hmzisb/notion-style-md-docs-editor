# 12. Senior Frontend Review Log

Two passes. Pass A reviewed `reference/architecture-v2.md` against the new brief (frontend only, backend agnostic, browser cache over md files, Notion-grade UX on shadcn/Plate defaults). Pass B reviewed the v3 draft of this package for internal conflicts, gaps, and execution risk for an autonomous agent. Every finding lists where the fix landed. Severity: **Blocker** (would have failed the brief or the build), **High** (visible quality or correctness loss), **Medium** (friction), **Low** (polish).

## Pass A: architecture v2 against the brief

| # | Finding | Severity | Resolution | Where |
|---|---|---|---|---|
| A1 | v2 ships a Node reference backend and a contract-test package. Brief is frontend only. | Blocker | Removed both packages. Contract stays as generated OpenAPI + prose. Conformance suite becomes an in-process core test utility runnable against any provider, including `http` over `msw`. | D-01, docs/02 §1, docs/03 §10 |
| A2 | "Md files as storage layer" was entirely backend-side; the frontend could not run over files without a server. | Blocker | Filesystem semantics moved into `@docs/core` over a `FileStore` interface. New `filesystem` adapter over `FileSystemDirectoryHandle` (picked folder or OPFS). Playground works with zero backend. | D-03, docs/03 §3-4, docs/08 §7 |
| A3 | "Browser cache" in v2 was an in-memory Query cache plus localStorage prefs. No persistence: every reload re-fetches, a crash loses edits. | Blocker | Persisted per-query IndexedDB cache, draft store, value LRU, index cache, all namespaced. Restore-before-fetch paints instantly. | D-04, docs/04 |
| A4 | Offline was "retry the save". No policy for reads or structural edits, so behavior would be undefined. | High | Explicit policy: content edits offline with drafts and retry; reads from cache; structural ops gated with a message. | D-05, docs/04 §3.4 |
| A5 | Two primitive engines (Base UI internal + Radix Plate UI): two portal stacks, two focus models, ~30 KB. | High | One engine, Radix, since Plate UI is Radix-based. Host engine is irrelevant because the module exports no primitives. | D-07 |
| A6 | No design specification. "Notion-like" was a sentence, not a contract; an agent would produce generic shadcn scaffolding. | Blocker | Full visual spec with geometry, type scale, per-component states, motion, copy, dark mode, and a screenshot review checklist. | docs/06 |
| A7 | Interaction spec missing: shortcut collisions unresolved (`Cmd+N` reserved by browsers, `Cmd+B` in shadcn sidebar vs bold, `Cmd+K` link vs palette). | High | Scoped shortcut map with no collisions; `Cmd+Alt+N`, `Cmd+\`, `Cmd+K` scoped, `Cmd+P` always palette. | D-23, docs/07 §1-2 |
| A8 | Callout and toggle, the two Notion blocks docs teams use most, were excluded because of Markdown portability. Both have portable forms (GFM alerts, `<details>`). | High | Added as P2 stretch behind golden and idempotence tests with a hard fallback rule. | D-17, docs/05 §5 |
| A9 | Block DnD, block selection and block menu were "not built"; they are core to the Notion feel and Plate ships them. | High | In scope (P2 for DnD and selection, P3 for menu). | D-22, docs/05 §2 |
| A10 | `assetUrl` returned a sync string; impossible for local stores that must produce object URLs. | High | `assetUrl` returns `Promise<string>`; `AssetImage` handles loading and revocation. | docs/03 §2, §4.10 |
| A11 | Cache keys namespaced by `instanceId` only; switching folders in one instance would show pages from the previous folder. | High | `provider.key` is required and mixed into the namespace; `DocsProvider` re-keys on identity change. | docs/02 §6, docs/04 §7 |
| A12 | Editor chunk loading rule unspecified: either every read view pays for Plate, or click-to-edit remounts. | Medium | Preload on idle/hover, spinner-in-control, swap inside the same scroll container with `scrollTop` restore, no swap back. | docs/05 §8 |
| A13 | Filesystem stores would read every frontmatter on each tree load (5k files). | Medium | Index cache keyed by size+mtime; progress callback for the first build. | docs/03 §4.11, docs/08 §7 |
| A14 | E2E over a real filesystem was impossible headless. | Medium | OPFS shares the `FileSystemDirectoryHandle` interface; Playwright runs the same adapter on OPFS. | D-03, docs/10 §1 |
| A15 | No operating protocol for an autonomous agent: when to stop, how to handle API drift, what "done" means. | Blocker | `CLAUDE.md` session loop, library-reality rule, blocker definition, self-review checklist; `PROGRESS`, `DEVIATIONS`, `ASSUMPTIONS` templates; per-task acceptance criteria and verify commands. | CLAUDE.md, docs/09, templates |
| A16 | Save status always visible ("Saved") contradicts Notion's quiet feel. | Low | Quiet status rules; label appears only with information. | D-24, docs/06 §9 |

## Pass B: v3 draft review

| # | Finding | Severity | Resolution | Where |
|---|---|---|---|---|
| B1 | Create flow used tree rename mode on create; Notion opens the page immediately. Worse for docs-as-code: the file would be stuck as `untitled-3.md` because files never rename on title change. | High | Page opens immediately with the title focused; a fresh page's first title commit renames the file to the slug via `updateMeta(id, patch, { renameFile: true })`. Ids stay stable. | docs/01 §5.3, docs/03 §4.7, docs/04 §4, docs/07 §5, docs/09 P3-T01 |
| B2 | Click-to-edit on `click` would fire after a text-selection drag inside one block, entering edit mode and losing the selection. | High | Enter edit only when pointer travel < 4 px, selection collapsed, and the target is not an interactive element. | docs/07 §7 |
| B3 | `Enter` in the content scope would hijack `Enter` on focused links. | Medium | `Enter` enters edit mode only when the wrapper itself is the active element. | docs/07 §7 |
| B4 | Content region as `main` breaks hosts that already have a `main` landmark. | Medium | `section[role=region][aria-label=Document]`; the playground owns `main`. | docs/07 §9 |
| B5 | `DocumentEditor` had no way to hand the editor instance to the session, so conflict Reload, silent refresh, and draft Discard could not call `editor.tf.setValue`. | High | `onReady(editor)` prop; `value` documented as initial-only. | docs/08 §5 |
| B6 | `onThemeChange` was on `DocsShell` in the props but passed to `DocsProvider` in the recipe. | Low | Recipe fixed. | docs/08 §8.1 |
| B7 | Conformance suite path drifted between `test/conformance` and `src/testing`. | Low | `src/testing/conformance.ts`, exported from `@docs/core/testing`. | docs/00, docs/02, docs/03 |
| B8 | Headless codec created a Plate editor at import time (side effect in a library entry). | Medium | Lazy instance on first call. | docs/05 §3 |
| B9 | Golden-file instruction "generate then freeze" would let an agent freeze data loss as a baseline. | High | Expected files reviewed against the manifest's declared fidelity; mismatches are kit bugs, never baselines. | docs/09 P0-T13 |
| B10 | `@scope (.docs-root) to (...)` donut scope was unnecessary and confusing. | Low | Plain `@scope (.docs-root)`; portals receive `.docs-root`. | docs/11 §4 |
| B11 | "Bundled" was ambiguous (inlined vs regular dependency). | Low | Defined: regular `dependencies`, externalized by tsup, counted in budgets. | docs/11 §8 |
| B12 | `size-limit` may count the dynamically imported editor chunk against `./shell`. | Low | Measure the initial chunk; fallback method documented. | docs/02 §7 |
| B13 | First uncached index build on large folders had no feedback. | Medium | `onProgress` + "Indexing N / M pages" under the tree skeleton. | docs/06 §5, docs/08 §7 |
| B14 | Content search unavailable on local stores while the palette advertises "Search in content" for http. | Medium | Optional local content search task with caps. | docs/09 P4-T07, docs/01 §6 |
| B15 | No license stated; a publishable package needs one. | Low | MIT. | docs/11 §10, docs/09 P0-T01 |
| B16 | Scrollbar styling, block selection color, collapsed-sidebar peek unspecified; each is a small but visible Notion signal. | Low | Added (peek as P4 optional). | docs/06 §3, §5 |
| B17 | Undo for page operations could be assumed by an agent because Notion has trash. | Low | Listed as a non-goal. | docs/01 §4 |

## Opportunities noted, deliberately not taken

- **Local-first sync across devices** (OPFS ↔ folder ↔ backend): would need an operation log; v1 keeps a single store per instance.
- **Full-text index** (MiniSearch-class) in the browser: valuable at >5k pages; the capped scan covers the realistic corpus size for this use case.
- **Comments and mentions**: Plate ships them, but neither has a portable Markdown form.
- **Page-level font (serif/mono) and full-width toggles**: cheap, but they belong to a per-user preference layer that does not exist yet. Candidate for the first post-handover Changeset.
- **Export to PDF/HTML**: outside "docs-as-code"; hosts can render `DocumentView` and print.

## Execution risks carried into the build (tracked, not blocking)

1. Plate registry item names and option names drift across minor versions; mitigated by the library-reality rule and local docs install.
2. headless-tree DnD insertion-position API may not expose "into" vs "between" exactly as described; mitigated by the flat-index design and the ~300 LOC replacement path (D-09).
3. Underline, callout, toggle and caption round trips depend on Plate's Markdown rules API; each has a stated fallback (docs/05 §2, §5).
4. `experimental_createQueryPersister` is experimental in name; behavior has been stable across v5. If it is removed, the fallback is `persistQueryClient` with a whole-client IndexedDB persister filtered to tree and page queries (one-day change, log a deviation).
5. File System Access API is Chromium-only for pickers; OPFS everywhere. The playground hides what a browser cannot do.
