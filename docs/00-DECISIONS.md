# 00. Locked Decisions

Status: locked for this build. Each entry has an ID used across the docs. A decision changes only through a `DEVIATIONS.md` entry that names a blocker per `CLAUDE.md` section 6.

## A. Scope and boundaries

| ID | Decision | Why | What would change it |
|---|---|---|---|
| D-01 | **Frontend only.** No backend package. The HTTP contract is documented and generated (OpenAPI from zod) but no server is built. | Stated requirement. The `DocumentProvider` seam keeps the module backend-agnostic. | A consumer needs a shipped reference server: add `packages/dev-server` as a separate phase. |
| D-02 | **Markdown files are canonical.** YAML frontmatter + GFM body. Plate JSON is a transient runtime view and is never persisted. | Docs-as-code, git-diffable, AI-readable. | Never. |
| D-03 | **Three adapters ship:** `memory`, `filesystem` (any `FileSystemDirectoryHandle`: a picked folder or OPFS), `http`. Filesystem semantics (ids, ordering, slugs, moves, folder conversion, hashing) live once in `@hmzisb/notion-docs-core` over a `FileStore` interface; `memory` and `filesystem` are `FileStore` implementations. | "Md files as storage layer" becomes a frontend capability. The playground is fully functional with zero backend. OPFS makes e2e possible headless. | A store that cannot write: run it with `capabilities.write=false`, ids fall back to path hashes. |
| D-04 | **Browser cache is persistent and layered:** TanStack Query with a per-query IndexedDB persister for tree and pages; an IndexedDB draft store for unsaved edits; an in-memory LRU for parsed Plate values; localStorage for sidebar preferences and recents. All namespaced by `instanceId` and `provider.key`. | Instant paint from cache, drafts survive reloads and crashes, saves survive dropped connections. | Storage quota errors are handled by degrading to memory-only with an `onEvent` warning. |
| D-05 | **Offline policy:** content edits work offline (draft store, retry with backoff). Structural operations (create, move, delete, rename, icon) require the provider to be reachable and are disabled with a clear message when it is not. | Content sync has a clean conflict model (version check). Structural sync needs a queue with reordering semantics: out of scope. | Product need for offline structure edits: add an operation log, separate phase. |
| D-06 | **Read-only hosts never pay for the editor.** Subpath entries `./tree`, `./view` are small; `./editor` is the only heavy entry. | Help drawers and canvas cards embed docs. | Never. |

## B. Stack

| ID | Decision | Why | What would change it |
|---|---|---|---|
| D-07 | **One primitive engine inside the module: Radix** (`npx shadcn@latest init -b radix`, unified `radix-ui` package). Plate UI registry components are Radix-based; the module's own shadcn primitives (button, dialog, popover, dropdown, tooltip, command, input, scroll-area, skeleton, sheet, sidebar) use Radix too. | Two engines (Base UI + Radix) cost ~30 KB, two focus-management models, two portal stacks. Consistency beats trend. The host's own engine is irrelevant: the module exports no primitives. | Plate UI ships Base UI variants: migrate both in one Changeset. |
| D-08 | **Editor: Plate v53 (`platejs`, `@platejs/*`) + Plate UI registry components** copied into `packages/react/src/editor/ui` via the shadcn CLI and the `@plate` registry. Peer dependencies for `platejs`, `@platejs/*`, `react`, `react-dom`, `@tanstack/react-query`. | Verified two-way Markdown, static renderers, chunked rendering. Peers prevent duplicate Slate instances in Plate-using hosts. | Plate v54 stable: upgrade in one Changeset after golden tests pass. |
| D-09 | **Tree: headless-tree + TanStack Virtual** over a flat normalized index owned by the Query cache. | ARIA tree, keyboard, rename, DnD with insertion positions, virtualization-friendly, ~10 KB. | Library abandoned: replace with an in-house flat tree (~300 LOC), same data shape. |
| D-10 | **Shell: shadcn `sidebar` block (Radix variant) as the structural base**, adapted: persistence moved to the module's sidebar store, resize handle added, cookie persistence removed, shortcut changed from `Cmd+B` to `Cmd+\`. | Mobile sheet, collapse modes, tokens, a11y for free. `Cmd+B` is bold in the editor. | Never. |
| D-11 | **Styling: Tailwind v4 classes preserved in the build; hosts add `@source`; shadcn CSS variable contract (incl. `--sidebar-*` with fallbacks); `theme.css` opt-in defaults scoped to `.docs-root`; `styles.css` precompiled fallback for non-Tailwind hosts, `@scope (.docs-root)`, no preflight.** | Works in Tailwind hosts with one line; does not break the host's typography. | Hosts on Tailwind v3 multiply: not planned. |
| D-12 | **Server state: TanStack Query v5 (peer).** UI state: Zustand (sidebar persisted, session in memory). Editor state: Plate. DI: React Context. Never mirror editor content into a store. | Selective subscriptions, no god store, no keystroke storms. | Never. |
| D-13 | **Router-agnostic** via `DocsNavigation` adapter. Playground uses TanStack Router. Active page id and mode live in the host URL. | Inertia, TanStack, React Router, or plain state all work. | Never. |
| D-14 | **Identity: opaque stable `id` in frontmatter**, written by the provider on first write. Folders without `index.md` and read-only stores use `hash(path)` ids. `path` is an attribute. | Rename and move never break routes, cache keys, expanded state. | Never. |
| D-15 | **Saving: 1.5 s idle debounce + flush on blur, hide, navigation, unmount, `Cmd+S`; dirty-only; optimistic version check (`baseVersion`); 409 shows a conflict banner, never silent overwrite.** Drafts persist to IndexedDB 500 ms after change, independent of save. | Notion feel without write storms. Drafts protect against crashes. | Multi-user editing: CRDT, separate product. |
| D-16 | **Fidelity: AST-level classification (`exact`, `reformat`, `lossy`) once per open.** `lossy` shows a banner before the first edit and lists reasons. Unedited pages never save. | Reformat noise is not data loss; real data loss is announced. | Never. |
| D-17 | **Block set (v1):** paragraph, h1-h3, blockquote, divider, bold, italic, underline, strikethrough, inline code, bulleted, numbered, todo lists (indent-based `ListKit`), code block with language, table, link, image with caption, **callout (GFM alert syntax)** and **toggle (`<details>` syntax)** as P2 items behind golden tests. Not in v1: columns, embeds, math, mentions, TOC, colors, fonts, comments, AI. | Everything in the set round-trips to portable Markdown. Callout and toggle are the two Notion signatures docs teams use daily; both have a portable Markdown form. | A P2 block fails its golden tests inside its task budget: drop it from the slash menu, log the deviation, ship without it. |
| D-18 | **Contract schemas in zod v4**, validated at adapter boundaries and fixtures only. Inside the React package types are trusted. | Runtime guarantees where data enters; no cost inside. | Never. |
| D-19 | **Distribution: tsup to ESM + d.ts, subpath exports, `sideEffects: ["*.css"]`, `publint` and `arethetypeswrong` in the build gate, built-package smoke tests in a Tailwind host and a non-Tailwind host.** | Publish-time breakage is the most common failure of embeddable modules. | Never. |
| D-20 | **Package scope `@hmzisb/notion-docs-*`.** Built under a placeholder `@docs/*` scope and renamed in one `sed` before the first publish, as this row always said. Nothing depends on the name. | Generic module, multiple orgs. | Never. |

## C. Experience

| ID | Decision | Why |
|---|---|---|
| D-21 | **Look: shadcn default theme (neutral base, `--radius: 0.625rem`), Plate UI default style, Lucide icons.** No custom palette, no custom fonts in the package (inherits host `font-sans`). Playground loads Inter. | Requirement: "modern clean shadcn/plate default". Consistency with any shadcn host. |
| D-22 | **Feel: Notion.** Click-to-edit in place, quiet autosave, slash menu, floating toolbar on selection, block drag handles and `+` in the gutter, block selection, hover-revealed row actions in the sidebar, command palette, inline title editing, emoji or Lucide page icons, 120-200 ms motion, no bounce. | Requirement: "world class experience like Notion". |
| D-23 | **Keyboard-first.** Every action has a keyboard path. The shortcut map in `docs/07` is the source of truth and has no collisions with the editor or the browser. | Power users and accessibility. |
| D-24 | **Quiet status.** No permanent "Saved" label. Status appears only when it carries information: Saving (after 800 ms), Unsaved, Offline, Conflict, Draft restored. | Notion never nags. |

## D. Changes vs `reference/architecture-v2.md`

| Area | v2 | v3 (this build) | Reason |
|---|---|---|---|
| Packages | `core`, `react`, `server-node`, `contract-tests`, playground | `core`, `react`, playground. Conformance suite lives in `packages/core/src/testing/conformance.ts` (exported from `@hmzisb/notion-docs-core/testing`) and runs against any provider in-process | D-01 |
| Filesystem semantics | In the backend | In `@hmzisb/notion-docs-core` over `FileStore`; backends may reuse the rules | D-03 |
| Adapters | memory, http | memory, filesystem (File System Access + OPFS), http | D-03 |
| Cache | Query in memory + LRU + localStorage | Persisted per-query IndexedDB cache + draft store + LRU + localStorage + index cache for filesystem stores | D-04 |
| Offline | Retry save only | Drafts persist; reads from cache; structural ops gated | D-05 |
| Primitives | Base UI internal + Radix Plate UI | Radix everywhere inside the module | D-07 |
| Shell | Custom sidebar | shadcn sidebar block adapted | D-10 |
| Block set | No callout, toggle listed as core | Callout and toggle as P2 behind golden tests; block DnD, block selection, block menu in scope | D-17, D-22 |
| `assetUrl` | Sync string | `Promise<string>` (local stores produce object URLs) | D-03 |
| Provider identity | none | `provider.key` required; part of every cache namespace | D-04 |
| New page shortcut | `Cmd+N` implied | `Cmd+Alt+N` (browsers reserve `Cmd+N`) | D-23 |
| Sidebar toggle | `Cmd+\` | `Cmd+\` kept; shadcn's `Cmd+B` removed | D-10 |
| Contract package | CLI against a URL | Same cases, in-process, plus an `http` adapter run against `msw` mocks; a URL runner is a script, not a package | D-01 |
