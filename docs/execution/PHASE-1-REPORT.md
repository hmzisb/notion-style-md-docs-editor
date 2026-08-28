# Phase 1 report · Read-only product

Closed 2026-08-26. Gate 1: **15 pass, 0 skip, 0 fail — GREEN**, report present.

## Shipped

P1-T01 react scaffold and primitives · T02 `DocsProvider`, namespace, queries · T03 persisted
and value caches · T04 sidebar store and recents · T05 memory adapter and playground bootstrap ·
T06 `PageTree` · T07 shell · T08 `DocumentView` (read-only) · T09 filesystem adapter ·
T10 HTTP adapter · T11 playground modes · T12 command palette and global shortcuts ·
T13 e2e skeleton, a11y and perf baseline.

A reader can open a workspace in any of the four modes, walk the tree, read a page with the
Plate view, and reach every page from the palette. Editing, mutations and row actions are P2.

## Measurements

| Measure | Result | Budget |
|---|---|---|
| `@hmzisb/notion-docs-core` entry, min + gz | **31 kB** | 40 kB (docs/10 §5) |
| `@hmzisb/notion-docs-react` `.` entry | **7.97 kB** | 25 kB |
| `@hmzisb/notion-docs-react` `./tree` + `./view` | **30.18 kB** | 80 kB, hard |
| `@hmzisb/notion-docs-react` `./shell` | **90.01 kB** | 60 kB (docs/02 §7) — over, DEV-012 |
| Cached page switch, click → painted | **47.2 ms** | < 100 ms |
| Tree scroll, 5,000-node fixture | **9.69 ms/frame**, 37 rows mounted | 60 fps, ≤ 45 rows, hard |
| Lighthouse accessibility, page view | **100** | ≥ 95 (docs/01 §6) |
| Unit tests | 904 in 35 files, green | |
| E2E | 41 passed, 2 skipped, across `demo`, `opfs`, `opfs-webkit` | |

Both timings are taken inside the page — a capture-phase `pointerdown` starts the clock and the
frame after the DOM changes stops it — so the driver's round trip is not in the number. Headless
Chromium does not lock `requestAnimationFrame` to a display, so the frame time is the meaningful
figure; 9.69 ms/frame is 103 fps unthrottled.

Bundle finding, carried: `./shell` is 30 kB over. Lazy-loading the palette behind `React.lazy`
was tried and reverted — `size-limit` bundles dynamic imports into the entry it measures, so the
number moved **up** 3.4 kB while adding a Suspense boundary the budget cannot see. A `92 kB`
limit is now set as a ratchet so the entry cannot grow further unnoticed; the cut itself still
depends on P2's `PageMenu` and P3's row menus, which share the same Radix menu stack (DEV-012).

## Review

- **Correctness**: 904 unit tests plus 52 provider-conformance cases over msw; `pnpm gate 1`
  runs typecheck, lint, both package builds, `publint`, `attw`, `size-limit` and e2e.
- **Boundaries**: `pnpm lint` green at `--max-warnings 0`, boundary rules and the host-globals
  rule included. The one suppression is the playground's own `window.location.search`, which is
  the host reading its own URL.
- **a11y**: axe over WCAG 2.1 A/AA on the landing, the shell and tree, an open page in both
  themes and the phone layout — 11 runs, clean. Four violations were found and fixed in P1-T13:
  a dangling `aria-controls` on the phone's sidebar button, `aria-label` on a role-less status
  div, headless-tree's live region inside `role="tree"`, and the sidebar's `⌘P` hint at 4.42:1
  (DEV-014). Lighthouse scores the page view 100.
- **Visual QA** (docs/06 §15, 1440×900 and 390×844, light and dark): title, icon and body share
  one left edge; no shift on row hover; the header status slot holds its 96 px; the header border
  appears only after scroll; the focus ring appears on `Tab` and not on click; dark mode has no
  pure-white surface and no pure-black text, and the sidebar stays distinct from the canvas; at
  390 px there is no horizontal scroll, the sidebar is a sheet and its rows are 44 px.

## Logged this phase

Deviations DEV-006 … DEV-014. Assumptions ASM-017 … ASM-058. The three a host can see are
DEV-011 and DEV-012 (the `./shell` shape and its budget), DEV-013 (the to-do checkbox uses
`accent-primary`) and DEV-014 (the sidebar shortcut hint's colour).

## Gaps carried into Phase 2

- `./shell` is 30 kB over budget; the decision is due once P2's `PageMenu` exists (DEV-012).
- Seven rows of the docs/10 §5 budget table still cannot be measured: keystroke to paint, cold
  open from IndexedDB, expand-all, warm `getTree` on OPFS, save round trip, draft serialize and
  playground TTI. They need the editor, the write path or a cold-cache harness.
- The tree row's chevron is a 20 px target on touch. docs/06 §5 specifies `size-5` and §15 asks
  for 44 px on "rows and buttons"; the row itself is 44 px and activates the page, so the chevron
  was left as specified. Worth revisiting with the row actions in P3.
- "No shift when hover actions appear" passes trivially today: the reserved slot is empty until
  the mutations land. Re-check it in P2.
- No visual-regression baselines yet (`toHaveScreenshot`); that is P3-T10.
- The playground's own header link is 40 px tall at 390 px. Harness chrome, outside the module.
