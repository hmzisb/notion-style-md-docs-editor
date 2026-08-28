# Phase 2 report · Editing

Closed 2026-08-26. Gate 2: **15 pass, 0 skip, 0 fail — GREEN**, report present.

## Shipped

P2-T01 editor entry and kit · T02 shell mode transitions and lazy editor · T03 document session
and drafts · T04 save status and banners · T05 blocks, slash menu, floating toolbar, autoformat ·
T06 block DnD and block selection · T07 title edit and icon picker · T08 offline handling ·
T09 conflicts end to end · T10 callout rule and kit (stretch, D-17) · T11 toggle rule and kit
(stretch, D-17) · T12 image caption rule (stretch) · T13 asset upload · T14 edit round-trip e2e.

A page can now be opened, edited and saved back to the file it came from: every block type the
codec parses is writable, a draft survives a tab that dies mid-typing, a conflicting write is
offered as Reload or Overwrite, and an image can be dropped, pasted or picked and lands next to
the page. Page operations (create, rename, move, delete) and packaging are P3.

## Measurements

| Measure | Result | Budget |
|---|---|---|
| `@hmzisb/notion-docs-core` entry, min + gz | **32.93 kB** | 40 kB (docs/10 §5) |
| `@hmzisb/notion-docs-react` `.` entry | **12.51 kB** | 25 kB |
| `@hmzisb/notion-docs-react` `./tree` + `./view` | **30.13 kB** | 80 kB, hard |
| `@hmzisb/notion-docs-react` `./shell` | **98.29 kB** | 60 kB (docs/02 §7) — over, DEV-012 |
| `@hmzisb/notion-docs-react` `./editor` | **211.09 kB** | 260 kB |
| Cached page switch, click → painted | **14.2 ms** | < 100 ms |
| Tree scroll, 5,000-node fixture | **8.45 ms/frame** (118 fps), 37 rows mounted | 60 fps, ≤ 45 rows, hard |
| Unit tests | 1,121 in 47 files, green | |
| E2E | 83 passed, 28 skipped, across `demo`, `opfs`, `opfs-webkit` | |
| axe (WCAG 2.1 A/AA) | 13 runs, clean — landing, shell, page in both themes, phone, **editor** | |

`./shell` grew 8.28 kB over Phase 1 (90.01 → 98.29) as the page menu, banners, save status and
the mode toggle landed; the limit is the 100 kB ratchet of DEV-012, not the 60 kB budget, and the
cut is still owed. `./editor` is the lazy chunk, loaded only when a reader enters edit mode.

## Review

- **Correctness**: 1,121 unit tests; `pnpm gate 2` runs typecheck, boundary lint, both builds,
  `publint`, `attw`, `size-limit`, the contract check, `doctor` over the corpus and the full e2e
  suite. The round-trip e2e edits one word on all 30 corpus pages and asserts the diff is that
  word and the `id` stamp of DEV-002, nothing else.
- **Boundaries**: `pnpm lint` green at `--max-warnings 0`. The one scoped relaxation is the 25
  vendored Plate registry files (DEV-016); they still pass `tsc --strict` and every boundary rule.
- **a11y**: the axe suite now scans edit mode as well, on a page with a bulleted list, an image
  and internal links. Three violations were found at this gate and fixed: Plate's list rendering
  emitted `role="listitem"` with no list around it (critical, DEV-019), the editable had no
  accessible name (critical), and `@platejs/selection` portals an unlabelled, tabbable input to
  the body (critical, DEV-020). A fourth finding was keyboard-only: the gutter `+` and drag
  handle are `opacity-0` until hover but were in the tab order — two invisible stops per block.
  They are `tabIndex={-1}` now, with `Enter` and `Cmd+Shift+↑/↓` as the keyboard path (ASM-116).
  Focus rings were re-measured through `:focus-visible` on every module control: present on
  `Tab`, absent after a click.
- **Visual QA** (docs/06 §15 — the brief cites §12, which is dark mode; the checklist is §15.
  1440×900 and 390×844, light and dark, read and edit): four read/edit jumps were found by
  measuring, not by reading code, and fixed — the "Add icon" button was a block in the flow
  (38 px), the title textarea was inline and carried a line-box descender (6 px), an image was
  forced to `w-full` in the editor only, and an internal link kept its `FileText` icon only in
  the read view. Title and body offsets are now identical across the swap and asserted in
  `edit-mode.spec.ts`. Hover actions shift the row by 0.00 px; the header status slot holds its
  96 px and the mode control does not move when "Saving…"/"Saved" appears; dark mode is
  `oklch(0.145)` on `oklch(0.985)` with a `10%` border and a distinct sidebar surface; at 390 px
  `scrollWidth === clientWidth` and every module header target is 44 px.
- **Also fixed at this gate**: every small button in the module had `border-radius: 0`.
  shadcn asks for `rounded-[min(var(--radius-md),12px)]`, and `--radius-md` was declared
  `@theme inline` — substituted into the utilities this sheet generates, never emitted as a
  property, so the `var()` resolved to nothing (ASM-112).

## Logged this phase

Deviations DEV-015 … DEV-020. Assumptions ASM-059 … ASM-116. The ones a host can see are
DEV-015 and DEV-016 (the vendored registry files and their lint scope), DEV-017 (a list that
mixes bullet and to-do items reflows on its first save), DEV-019 (list DOM) and DEV-020 (the
block clipboard input the module labels on Plate's behalf).

## Gaps carried into Phase 3

- `./shell` is 38 kB over the docs/02 §7 budget and 1.7 kB under its own ratchet. The row menus
  of P3 share the same Radix menu stack, so the cut is due there (DEV-012).
- Five rows of the docs/10 §5 budget table are still unmeasured: keystroke to paint, cold open
  from IndexedDB, expand-all, save round trip and draft serialize. P3-T11 owns them.
- No visual-regression baselines (`toHaveScreenshot`) yet; that is P3-T10, and it is what would
  have caught the four jumps above without a human looking at screenshots.
- docs/06 §7 centres an image caption, so a picture narrower than the column has its caption
  centred on the column rather than under the picture. Both modes draw it the same way; worth a
  spec question rather than a code change.
- The floating toolbar draws over the page title when the selection is the first block. In spec
  ("above the selection") and never off-screen, but a flip would read better.
- Perf timings run on the `demo` project only, so `opfs` skips them; the numbers above are from
  one engine.
