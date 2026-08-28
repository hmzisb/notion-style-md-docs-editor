# notion-style-md-docs-editor

A Notion-grade docs experience for any React app, over plain Markdown files. No backend required.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](tsconfig.base.json)
[![React](https://img.shields.io/badge/React-18.3%20%7C%2019-149eca.svg)](#requirements)
[![Tests](https://img.shields.io/badge/tests-1%2C255%20unit%20%2B%20153%20e2e-2ea043.svg)](#quality)
[![Bundle](https://img.shields.io/badge/read%20path-38.9%20kB%20gzip-2ea043.svg)](#performance)

`@docs/react` gives you the whole thing — sidebar tree, breadcrumbs, command palette, read view
and a block editor with a slash menu — and reads and writes **ordinary `.md` files**. Point it at
a folder on disk, at browser storage, at an in-memory corpus, or at your own HTTP API. The module
never talks to a server itself: every byte goes through one `DocumentProvider` interface you
control.

![Reading a page: sidebar tree, breadcrumbs, GFM table](docs/assets/read-light.png)

---

## Why this exists

Markdown docs usually force a choice: a static site generator that nobody can edit without a pull
request, or a hosted app that owns your content. This module takes the third option — your files
stay yours, in git, in a folder, in the shape you already have, and the editing experience on top
of them feels like Notion.

- **Markdown is canonical.** The editor's JSON is transient. 30 of 33 fixture pages round-trip
  **byte for byte**; the rest have goldens and a classifier that tells you exactly what would
  change before you save.
- **A page is never written unless you edited it.** No reflowed files, no churned diffs, no
  frontmatter reordering.
- **The browser cache is a feature.** Cached pages paint instantly, drafts survive a reload, and
  a save survives a dropped connection.
- **Frontend only.** Three adapters ship. Your backend, if you ever want one, implements a
  documented HTTP contract — with a conformance suite you can run against it.

## Screenshots

| Block editor with the slash menu | Command palette (`⌘P`) |
|---|---|
| ![Editor with slash menu open](docs/assets/editor-dark.png) | ![Command palette searching pages and content](docs/assets/palette-dark.png) |

## Features

**Navigation**
- Virtualised sidebar tree — 5,000 nodes scroll at 60 fps with ≤ 45 rows mounted
- Drag and drop, keyboard move (`⌘↑` / `⌘↓`), inline rename, icons (emoji or Lucide)
- Breadcrumbs with overflow, command palette over page names *and* page content
- One branch expanded at a time, so a deep tree never becomes a wall

**Editing**
- Slash menu, floating toolbar, drag handles, block selection, Markdown autoformat
- Headings, lists, to-dos, tables, code blocks with highlighting, callouts, toggles, images with
  captions, links with a resolver that understands relative `.md` paths
- Text colour and highlight that survive the round trip to Markdown
- `/page` creates a real subpage on disk, the way Notion nests

**Saving and safety**
- Debounced autosave with a visible status, `⌘S` to flush
- Optimistic-concurrency conflicts surfaced as a card, not a silent overwrite
- Drafts in IndexedDB, restored after a reload or a crash
- Lossy-document warning before an edit would drop Markdown the editor cannot represent

**Integration**
- Five entry points so you only pay for what you import; the editor is a lazy chunk
- No router, no globals, no `window.location`, no `document.title`, no preflight CSS
- Every string overridable (258 keys), every event observable via `onEvent`
- Scoped to `.docs-root` — it will not restyle your app

## Try it

```bash
git clone https://github.com/hmzisb/notion-style-md-docs-editor.git
cd notion-style-md-docs-editor
pnpm i
pnpm dev
```

The playground opens with four workspace modes: the bundled **demo** corpus in memory, a **folder**
on your computer (File System Access API), **browser storage** (OPFS, with folder import/export),
and **remote** against any backend that answers the HTTP contract.

## Install into your app

> **Status:** not yet on npm. Today, consume it from this repo — `pnpm i && pnpm build`, then
> reference `packages/core` and `packages/react` as workspace or `file:` dependencies. The
> published shape is already verified by `publint`, `attw` and two built-package smoke hosts.

Once published, the install is:

```bash
pnpm add @docs/react @docs/core @tanstack/react-query platejs
# plus the @platejs/* peers listed in packages/react/package.json
```

```css
/* app.css — Tailwind v4 host */
@import "tailwindcss";
@source "../node_modules/@docs/react/dist";
@import "@docs/react/styles.css";
@import "@docs/react/theme.css";   /* only if your app has no shadcn CSS variables */
```

Not on Tailwind? Import `@docs/react/styles.css` alone — it is precompiled, scoped and carries no
preflight.

## Usage

The whole module is two components. `DocsProvider` owns data; `DocsShell` owns the layout.

```tsx
import { DocsProvider, type DocsNavigation } from '@docs/react';
import { DocsShell } from '@docs/react/shell';
import { createFileSystemProvider, pickDirectory } from '@docs/react/adapters/filesystem';
import { useState } from 'react';

const handle = await pickDirectory({ mode: 'readwrite', id: 'my-docs' });
const provider = createFileSystemProvider(handle, { indexCache: true, watch: true });

export function Docs() {
  const [pageId, setPageId] = useState<string | null>(null);
  const [mode, setMode] = useState<'read' | 'edit'>('read');

  const navigation: DocsNavigation = {
    activePageId: pageId,
    mode,
    navigate: (to) => {
      setPageId(to.pageId);
      setMode(to.mode ?? 'read');
    },
  };

  return (
    <DocsProvider provider={provider} navigation={navigation}>
      <DocsShell pageId={pageId} mode={mode} />
    </DocsProvider>
  );
}
```

`navigation` is the only seam to your router: give it your params and your `navigate`, add an
optional `href()` and the tree renders real `<a>` links. Recipes for TanStack Router, Laravel +
Inertia, and a read-only help drawer are in [`docs/08-PUBLIC-API.md`](docs/08-PUBLIC-API.md#8-integration-recipes).

Composing your own layout instead of the shell? Use `PageTree`, `PageHeader`,
`DocumentView` / `DocumentEditor` and `useDocumentSession` directly — the tree knows nothing about
routes, the editor knows nothing about saving, and the session is the only piece that knows both.

## Storage adapters

| Adapter | Import | Backing store | Notes |
|---|---|---|---|
| Memory | `@docs/react/adapters/memory` | a seeded object | demos, tests, Storybook; latency and failures injectable |
| Filesystem | `@docs/react/adapters/filesystem` | a real folder | File System Access API — Chromium only |
| OPFS | `@docs/react/adapters/filesystem` | origin-private FS | every evergreen browser; import/export to a real folder |
| HTTP | `@docs/react/adapters/http` | your API | `GET /tree`, `GET/PUT /pages/:id`, ETags, SSE or polling |

Bring your own: implement `DocumentProvider` from `@docs/core` and run
`runProviderConformance()` from `@docs/core/testing` — 52 cases covering trees, conflicts, moves,
slug collisions, assets and capability gating.

## How files become a tree

| On disk | In the app |
|---|---|
| `guides/intro.md` | a page |
| `guides/index.md` | the page **for** `guides/`; its siblings become children |
| `guides/` without `index.md` | a folder node — expandable, not openable, convertible to a page |
| `README.md` | read as `index.md` when `index.md` is absent |
| `.hidden/`, `node_modules/` | ignored |
| anything not `.md` | an asset, reachable through `assetUrl` |

Title comes from frontmatter `title`, else the first `# H1`, else the humanised filename. Order
comes from frontmatter `order`, then natural filename sort. Ids come from the path until the first
write, when a stable ULID is written into frontmatter (`pnpm doctor <folder> --write-ids` does it
in bulk).

## Keyboard

| Keys | Action |
|---|---|
| `⌘P` | Command palette (pages and content) |
| `⌘\` | Toggle sidebar |
| `⌘⇧E` | Toggle read / edit |
| `⌘⌥N` | New page |
| `⌘S` | Save now |
| `⌘⇧U` | Open parent page |
| `F2` · `⌘↑` `⌘↓` | Rename · move among siblings (tree focus) |
| `/` | Slash menu (editor) |
| `⌘⌥1…9` | Turn block into heading, list, to-do, code, callout |
| `⌘⇧↑` `⌘⇧↓` · `⌘D` | Move block · duplicate block |

Full map, including drag and drop and the state matrix, in
[`docs/07-INTERACTIONS-AND-SHORTCUTS.md`](docs/07-INTERACTIONS-AND-SHORTCUTS.md).

## Performance

Measured on a production build, one machine (darwin + Chromium) — a reference, not a CI gate.

| Measure | Result | Budget |
|---|---|---|
| `@docs/react` read path (`./tree` + `./view`), gzip | **38.9 kB** | 80 kB |
| `@docs/react` `./shell`, gzip | **96.7 kB** | 98 kB |
| `@docs/react` `./editor`, gzip, lazy | **213.9 kB** | 260 kB |
| `@docs/core`, gzip | **33.8 kB** | 40 kB |
| Cached page switch | **11.4 ms** | < 100 ms |
| Cold page open from IndexedDB | **20.6 ms** | < 150 ms |
| Tree scroll, 5,000 nodes | **8.4 ms/frame**, 36 rows mounted | 60 fps |
| `getTree` over 5,000 OPFS files | **31.7 ms** | < 300 ms |
| Save round trip | **79 ms p95** | < 300 ms |

## Quality

```bash
pnpm typecheck     # tsc -b across the workspace, strict
pnpm lint          # eslint incl. layer-boundary rules
pnpm test          # 1,255 unit tests in 60 files
pnpm test:e2e      # 153 Playwright specs across demo, OPFS and WebKit
pnpm build         # tsup + publint + attw + size-limit
pnpm gate 3        # every check above, 19 steps
pnpm doctor <dir>  # what opening and saving would do to a real corpus
```

Also covered: a provider conformance suite run against all four adapters, 19 clean axe runs
(WCAG 2.1 A/AA), 14 visual baselines at two viewports in both themes, and two built-package smoke
hosts — one Tailwind, one plain.

## Requirements

- React 18.3 or 19 · TypeScript 5.9 · ESM only
- Node 22+ and pnpm 10 to develop this repo
- Tailwind v4 optional — the CSS ships precompiled either way

## Known limits

Honest ones, tracked in [`docs/execution/FINAL-REPORT.md`](docs/execution/FINAL-REPORT.md):

1. Keystroke-to-paint is 33 ms p95 on a 3,000-block page (10 ms at 500 blocks). A guard covers the
   extreme; the middle is unsolved.
2. Search is a scan, not an index — capped at 2,000 files and 4 MB per query.
3. Raw HTML in Markdown survives as its own bytes but is not editable as blocks.
4. The `./shell` bundle is 61 % over the original 60 kB target, held by a ratchet.
5. Perf and visual baselines come from one machine; there is no CI hardware baseline.

## Documentation

| Document | What's in it |
|---|---|
| [`docs/01-PRODUCT-SPEC.md`](docs/01-PRODUCT-SPEC.md) | scope, users, flows, non-goals |
| [`docs/02-ARCHITECTURE.md`](docs/02-ARCHITECTURE.md) | packages, layers, boundaries |
| [`docs/03-DATA-MODEL-AND-CONTRACTS.md`](docs/03-DATA-MODEL-AND-CONTRACTS.md) | types, provider contract, filesystem semantics, HTTP contract |
| [`docs/04-CACHE-AND-SYNC.md`](docs/04-CACHE-AND-SYNC.md) | cache, drafts, conflicts, offline |
| [`docs/05-EDITOR.md`](docs/05-EDITOR.md) | Plate kits, Markdown codec, fidelity rules |
| [`docs/06-DESIGN-SPEC.md`](docs/06-DESIGN-SPEC.md) | the visual system |
| [`docs/07-INTERACTIONS-AND-SHORTCUTS.md`](docs/07-INTERACTIONS-AND-SHORTCUTS.md) | keyboard, DnD, states, a11y |
| [`docs/08-PUBLIC-API.md`](docs/08-PUBLIC-API.md) | every export, prop, hook, event, integration recipe |
| [`docs/10-TESTING-AND-QUALITY.md`](docs/10-TESTING-AND-QUALITY.md) | test matrix, budgets, gates |
| [`docs/11-REPO-AND-TOOLING.md`](docs/11-REPO-AND-TOOLING.md) | workspace, build, scripts |

Build history lives in [`PROGRESS.md`](PROGRESS.md), [`DEVIATIONS.md`](DEVIATIONS.md),
[`ASSUMPTIONS.md`](ASSUMPTIONS.md) and `docs/execution/`.

## Repository layout

```
packages/core     @docs/core   — provider contract, Markdown codec, tree ops, filesystem semantics
packages/react    @docs/react  — shell, tree, viewer, editor, adapters, cache
apps/playground   the demo app you get from `pnpm dev`
fixtures          a 33-page corpus that every codec and provider test runs against
smoke             built-package hosts: one Tailwind, one plain
contract          generated OpenAPI 3.1 for the HTTP contract
```

## Built with

[Plate](https://platejs.org) · [TanStack Query](https://tanstack.com/query) ·
[headless-tree](https://headless-tree.lukasbach.com) · [Radix](https://www.radix-ui.com) ·
[cmdk](https://cmdk.paco.me) · [Tailwind v4](https://tailwindcss.com) · shadcn variables

## License

[MIT](LICENSE)
