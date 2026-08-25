# 01. Product Spec

## 1. One paragraph

A drop-in React module that turns a folder of Markdown files into a Notion-like workspace: a collapsible page tree on the left, a clean page canvas on the right, click anywhere to edit, autosave, slash commands, drag to reorder, instant page switching from a browser cache. It reads and writes plain `.md` files through a pluggable provider, so the same UI works over a local folder, browser storage, or any HTTP backend a host chooses to implement.

## 2. Users and jobs

| User | Job | What "good" looks like |
|---|---|---|
| Founder / tech lead writing PRDs and technical docs for humans and AI agents | Capture and organize thinking fast, keep it in git as Markdown | Opens instantly, never loses a keystroke, never reformats files it did not touch |
| Developer consuming docs inside an internal app | Find and read the right page without leaving the app | Read-only embed loads light, search finds pages by title, links between pages work |
| App author integrating the module | Add docs to a React app in under 30 minutes | One provider, one navigation adapter, one CSS line, done |
| AI coding harness | Read and write the same files | Files stay clean GFM with predictable frontmatter |

## 3. Scope (v1 of the module)

**Explore:** hierarchical tree, unlimited depth, expand/collapse with persisted state, expand-all/collapse-all, active page highlight, breadcrumbs, command palette with title search and recents, content search when the provider supports it.

**Read:** page with icon and title, rendered blocks, working internal links (`./page.md`, `../x/index.md`, `x/`), relative images, code blocks with syntax highlighting and copy, tables, task lists, callouts, toggles.

**Edit:** click to edit in place, Plate block editor with slash menu, floating toolbar, Markdown autoformat shortcuts, block drag handles, block selection, autosave, `Cmd+S`, inline title edit, icon picker (emoji or Lucide), conflict handling, lossy-content warning, draft recovery after reload.

**Create and organize:** new page (root, sibling, child), rename, change icon, move by drag and drop or "Move to", delete with sub-page count confirmation, folder-to-page conversion.

**Cache:** instant paint from persisted cache, background revalidation, drafts, offline content editing with retry, index cache for filesystem stores.

**Embed:** read-only entry without the editor bundle; shell optional; every string overridable; events for host telemetry.

## 4. Non-goals (v1)

Real-time collaboration, presence, comments, version history UI, permissions UI, trash, undo for page operations (delete and move are confirmed or reversible by another move), page templates, import/export beyond Markdown, workspace switching, SSR rendering of pages, i18n framework, custom block model over Plate, editor virtualization, generic plugin system, Plate AI/mention/math/columns/embed kits, mobile-first editing polish beyond "works", service worker.

## 5. Core user flows

### 5.1 Open a page
Sidebar row click or palette selection → host route updates → shell renders cached page immediately (if cached) → background revalidation → if a newer version arrives and the editor is clean, content swaps silently; if dirty, a conflict banner appears.

### 5.2 Edit and save
Click on content (or press `E` with the content region focused, or click Edit) → edit mode without remount or scroll jump → typing marks the session dirty → draft persisted after 500 ms → save after 1.5 s idle or on blur, hide, navigate, `Cmd+S` → status stays quiet on success; shows Saving after 800 ms of in-flight, Unsaved while dirty and paused, Offline with retry when the provider is unreachable, Conflict on 409.

### 5.3 Create a page
`+` on a row (child), "New page" in the sidebar header or footer (root), `Cmd+Alt+N` (child of the open page, else root), palette action → an "Untitled" row appears optimistically and the page opens immediately in edit mode with the title focused (Notion behavior) → the provider creates `untitled.md` → the first title commit on this fresh page renames the file to its slug (`updateMeta` with `renameFile`) → typing content continues without interruption. On failure the row is removed, the shell returns to the previous page, and a toast explains.

### 5.4 Reorganize
Drag a row: insertion line before/after, highlight for "into", auto-expand after 600 ms hover, auto-scroll near edges, `Esc` cancels, descendant guard. Or "Move to" from the row menu (palette-style picker). Or `Cmd+↑/↓` among siblings when the tree row is focused.

### 5.5 Delete
Row menu → Delete → dialog "Delete 'Auth' and 3 sub-pages?" with a destructive button → optimistic removal → if the deleted page was open, the shell navigates to the parent (or home).

### 5.6 Recover
Reload mid-typing → the page opens with the draft applied and a "Restored unsaved changes" banner with Keep or Discard. If the file changed since the draft's base version, the banner becomes a conflict banner offering Apply draft, Keep file, or Compare (P3 optional: side-by-side text diff).

### 5.7 First run (playground)
Landing offers four modes: Demo (in-memory corpus), Open folder (File System Access), Browser storage (OPFS, with import/export of a folder), Remote (HTTP base URL). The chosen mode persists in localStorage.

## 6. Capability matrix

Providers declare capabilities; the UI hides or disables what is not available.

| Capability | memory | filesystem | http | UI effect when false |
|---|---|---|---|---|
| write | true | true unless handle is read-only | from `/meta` | No edit affordances, no create/rename/delete, click on content does nothing |
| move | true | true | from `/meta` | No DnD, no Move to, no `Cmd+↑/↓` |
| delete | true | true | from `/meta` | No Delete in menus |
| upload | false | true | from `/meta` | Image insert accepts URL or relative path only |
| search | title only (content search optional, P4-T07) | title only (content search optional, P4-T07) | from `/meta` | Palette searches titles client-side |
| subscribe | false | optional (poll) | from `/meta` | External changes seen on refocus only |

## 7. Success criteria for the build

- A new user of the playground can create, organize, and edit a 20-page workspace in 10 minutes without reading anything.
- Round trip on the corpus: open → edit one word → save → file diff contains only that word for every `exact` page.
- Cached page switch paints in under 100 ms; keystroke to paint under 16 ms on a 3k-block page; 5k-node tree scrolls at 60 fps.
- Zero console errors or warnings in e2e runs.
- Lighthouse accessibility ≥ 95 on the playground page view.
- `./tree` + `./view` ≤ 80 KB gzipped excluding peers; `./editor` ≤ 260 KB gzipped excluding peers.
- Built packages pass `publint`, `arethetypeswrong`, and both smoke hosts.
