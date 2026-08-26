# Phase 3 report · Page operations, polish, packaging

Closed 2026-08-27. Gate 3: **19 pass, 0 skip, 0 fail — GREEN**, report present.

## Shipped

P3-T01 create page flows · T02 rename, change icon, row menu · T03 tree drag and drop, keyboard
move, Move to · T04 delete · T05 folder nodes · T06 page menu · T07 block menu · T08 expand and
collapse all, palette actions, theme · T09 capability, strings and events audit · T10
accessibility pass · T11 performance pass · T12 built-package smoke hosts · T13 docs and
versioning · T14 visual QA and baselines.

The tree is now writable end to end: a page can be created anywhere, renamed inline, given an
icon, dragged or keyboard-moved to a new parent, deleted with everything under it, and a folder
that never had a page gets one. Every one of those is optimistic, reversible from a toast, and
gated on the provider capability that backs it. The module ships as two published packages at
0.1.0 with READMEs, a machine-checked public API and two Vite hosts that consume `dist` through
the exports map rather than the workspace.

## Measurements

| Measure | Result | Budget |
|---|---|---|
| `@docs/core` entry, min + gz | **33.05 kB** | 40 kB (docs/10 §5) |
| `@docs/react` `.` entry | **14.49 kB** | 25 kB |
| `@docs/react` `./tree` + `./view` | **38.89 kB** | 80 kB, hard |
| `@docs/react` `./shell` | **96.47 kB** | 98 kB ratchet — over docs/02 §7's 60 kB, DEV-012 |
| `@docs/react` `./editor` (lazy) | **213.88 kB** | 260 kB |
| Cached page switch, click → painted | **13.0 ms** | < 100 ms |
| Cold page open from IndexedDB | **20.7 ms** | < 150 ms |
| Tree scroll, 5,000-node fixture | **8.38 ms/frame** (119 fps), 36 rows mounted | 60 fps, ≤ 45 rows, hard |
| Expand-all, 5,000 nodes | **40.9 ms** | < 100 ms |
| `getTree` over 5,000 OPFS files, warm index | **29.3 ms** | < 300 ms |
| Playground TTI, warm | **33 ms** | < 1.5 s |
| Save round trip | **79 ms p95** over 10 saves | < 300 ms |
| Draft serialize, 3,000 blocks | **27.3 ms** (40.1 ms for the whole 4,503-block fixture) | 30 ms |
| Keystroke to paint, 3,000 blocks | **34.3 ms p95**, 28.1 median | 16 ms — **over**, DEV-031 |
| Unit tests | 1,192 in 55 files, green | |
| E2E | 139 passed, 78 skipped, across `demo`, `opfs`, `opfs-webkit` | |
| axe (WCAG 2.1 A/AA) | 19 runs, clean | |
| Visual baselines | 14 (`toHaveScreenshot`, both sizes, both themes) | |

Perf rows are measured against a production build under a single worker (DEV-028); the node row
runs as its own vitest project for the same reason.

## Review

- **Correctness**: 1,192 unit tests and 139 e2e. `pnpm gate 3` runs typecheck, boundary lint,
  both builds, `publint`, `attw`, `size-limit`, the contract check, `doctor` over the corpus, the
  full e2e suite, both perf runners, both smoke hosts and `changeset status` — 19 steps, every one
  of them with its artefacts present, so nothing reports as a skip.
- **Boundaries**: `pnpm lint` green at `--max-warnings 0`, including the two smoke workspaces,
  which resolve `@docs/*` through the exports map with `"paths": {}` — so a missing export or a
  types condition that only works inside the monorepo fails there rather than at a host.
- **Public API**: docs/08 §2 is now generated from the real entry points and asserted by
  `public-api.test.ts` (13 tests) against `ts.createProgram`, both directions: an undocumented
  export and a documented name that no longer exists both fail. The audit it forced found four
  mutation hooks and `useSearch` promised by the doc and never exported; the palette's inline
  query became that hook, so there is one search path instead of two.
- **a11y**: 19 axe runs clean across landing, shell, page, editor, phone and both themes;
  keyboard-only e2e drives create, rename, move and delete without a pointer; every module target
  at 390 px is 44 px; reduced motion zeroes `--docs-motion`. The one palette-level finding this
  phase was the destructive pair at 3.82:1 (DEV-027).
- **Visual QA** (docs/06 §15, 1440×900 and 390×844, light and dark): 14 baselines cover sidebar,
  read, editor with the slash menu, palette, icon picker, conflict banner and the phone sheet.
  Reviewing them found one real defect — the code-block language label and copy button float over
  the code with no background, so a long line scrolls through them; both the viewer and the
  editor node now paint the block's own `bg-muted` behind that group. The baselines belong to
  this machine's Chromium run (ASM-153).
- **Packaging**: `pnpm smoke` builds both hosts against `dist`. The Tailwind host proves the
  shell's arbitrary values need `@source "../node_modules/@docs/react/dist"`, which the README
  now says; the plain host proves `styles.css` is precompiled, `.docs-root`-scoped and
  preflight-free by asserting a bare `<p>` outside the root keeps its UA margin.

## Logged this phase

Deviations DEV-021 … DEV-031. Assumptions ASM-117 … ASM-153. The ones a host can see are
DEV-021 (`palette.createUnavailable` removed from `DocsStrings`), DEV-024 (our own block-menu
plugin, so no `BlockMenuPlugin` API to drive it), DEV-025 (no `:` emoji combobox in the editor),
DEV-026 (a third sidebar-header button for expand/collapse all) and DEV-031 (the keystroke
budget).

## Gaps carried into Phase 4

- Keystroke to paint is 34.3 ms p95 on the 3,000-block fixture against a 16 ms budget; 10.1 ms at
  500 blocks and 16.3 at 1,000. Both halves of the cost scale with document size, and the one
  lever that moves it breaks scroll offset (DEV-031). P4-T04 owns the large-page path.
- `./shell` is 96.47 kB gz against docs/02 §7's 60 kB, held by its own 98 kB ratchet. The Radix
  menu stack behind the breadcrumb overflow is what is left to cut (DEV-012, ASM-063).
- Lazy chunks are ignored inside the entries that load them and carry no limit of their own, so
  nothing gates their growth (DEV-023).
- Visual baselines are darwin + Chromium only; another platform regenerates its own set on first
  run (ASM-153).
- Perf rows still run on one engine and one machine; no CI hardware baseline (DEV-028).
- docs/06 §7 centres an image caption on the column rather than under a narrow picture, and the
  floating toolbar draws over the page title when the selection is the first block. Both are
  spec questions carried from Phase 2, unchanged.
