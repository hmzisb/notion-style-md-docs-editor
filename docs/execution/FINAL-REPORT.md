# Final report · `@hmzisb/notion-docs-core` and `@hmzisb/notion-docs-react` 0.1.0

Written 2026-08-27, at the end of Phase 4. 66 tasks across five phases (P0 … P4), every one
committed green. `pnpm gate 3` — the highest gate docs/09 defines — is **19 pass, 0 skip, 0
fail**, with all four phase reports present. The per-phase detail is in
`PHASE-0-REPORT.md` … `PHASE-4-REPORT.md`; this is the whole build in one page.

## What shipped

- **`@hmzisb/notion-docs-core`** — the provider contract and everything backend-agnostic: `DocumentProvider`,
  `ProviderCapabilities`, the Zod contract schemas and a generated `contract/openapi.json`, the
  Markdown codec (Plate-headless, custom rules for callouts, toggles and image captions), the
  fidelity classifier, frontmatter, ids, links, tree index and fractional ordering, `FileStore`
  with `MemoryFileStore`, `createFileStoreProvider` (walk, ordering, ids, conflicts, assets,
  events, content search) and a provider conformance suite hosts can run against their own
  backend.
- **`@hmzisb/notion-docs-react`** — the UI: shell, sidebar tree (virtualised, DnD, keyboard move), read view,
  lazy Plate editor, command palette, banners, save status, the draft and cache layer over
  TanStack Query and IndexedDB, and the three adapters (memory, filesystem/OPFS, HTTP). Five
  entry points, `.docs-root`-scoped precompiled CSS, no preflight, no router, no globals.
- **Around them** — a playground with four workspace modes, 25 Playwright spec files across
  `demo`, `opfs` and `opfs-webkit`, two built-package smoke hosts (Tailwind and plain), the
  fidelity `doctor` with its `--write-ids` migration, and perf runners for both the node and the
  browser budgets.

## Measurements

| Measure | Result | Budget (docs/10 §5) |
|---|---|---|
| `@hmzisb/notion-docs-core` entry, min + gz | **33.76 kB** | 40 kB |
| `@hmzisb/notion-docs-react` `.` | **14.63 kB** | 25 kB |
| `@hmzisb/notion-docs-react` `./tree` + `./view` | **38.91 kB** | 80 kB, hard |
| `@hmzisb/notion-docs-react` `./shell` | **88.25 kB** | 92 kB ratchet — over docs/02 §7's 60 kB (DEV-012) |
| `@hmzisb/notion-docs-react` `./editor`, lazy | **213.88 kB** | 260 kB |
| Cached page switch | **11.4 ms** | < 100 ms |
| Cold page open from IndexedDB | **20.6 ms** | < 150 ms |
| Tree scroll, 5,000 nodes | **8.36 ms/frame**, 36 rows mounted | 60 fps, ≤ 45 rows, hard |
| Expand-all, 5,000 nodes | **41.4 ms** | < 100 ms |
| `getTree`, 5,000 OPFS files | **31.7 ms** | < 300 ms |
| Playground TTI, warm | **40 ms** | < 1.5 s |
| Save round trip | **79 ms p95** | < 300 ms |
| Draft serialize, 3,000 blocks | **27.4 ms** | 30 ms |
| Keystroke to paint, 3,000 blocks | **33.2 ms p95** | 16 ms — **over** (DEV-031) |
| `Edit anyway`, 5,200-block page | **16.4 s** | unbudgeted; 25 s tripwire (ASM-160) |
| Unit tests | **1,236** in 59 files | |
| E2E | **153 passed, 84 skipped** | |
| axe (WCAG 2.1 A/AA) | 19 runs, clean | |
| Visual baselines | 14, both sizes, both themes | |

Every budget in docs/10 §5 is met except keystroke-to-paint on a 3,000-block page. Browser rows
are one worker against a production build on this machine (DEV-028).

## Deviations

32 entries in `DEVIATIONS.md`. The ones a host can see:

- **DEV-003 / DEV-004** raw HTML survives as its own bytes; underline is not in the block set.
- **DEV-012** `./shell` is 96.71 kB against docs/02 §7's 60 kB, held by a ratchet.
- **DEV-021** `palette.createUnavailable` is not a string key. **DEV-024** the block menu is
  ours, so there is no `BlockMenuPlugin` to drive. **DEV-025** no `:` emoji combobox.
- **DEV-026** a third sidebar-header button for expand/collapse all.
- **DEV-031** the keystroke budget above.
- **DEV-032** one 5 s filesystem poll diffed by `size:mtime`, not docs/04's two cadences.

The rest are internal: library API shapes that did not match the spec's sketches, and the
serializer fixes that keep a save from reflowing a file nobody edited.

## Assumptions

162 entries in `ASSUMPTIONS.md`, each with its question, the choice, the reason and whether it is
cheap to reverse. The ones that shape the product rather than the code: Markdown stays canonical
and Plate JSON transient (D-01/D-02 as built); a page is never written unless the user edited it;
the browser cache is a feature, so drafts and the tree survive a reload and a dropped connection;
ids are inferred from paths until something writes one, which is what `--write-ids` exists to
end; and every optional capability is hidden rather than disabled when a provider lacks it.

## Known gaps

1. **Keystroke to paint** is 33.2 ms p95 at 3,000 blocks (10.1 ms at 500, 16.3 at 1,000). Both
   halves of the cost scale with document size and the one lever that moves it breaks scroll
   offset (DEV-031). The large-page guard covers the extreme; the middle is unsolved.
2. **`./shell` bundle** is 47 % over the spec's 60 kB. The breadcrumb overflow menu named here as
   the next cut has since been made - `shell/breadcrumb-overflow`, 96.71 kB down to 88.25 - and the
   cap is 92 kB. What holds the rest is the Radix popover, tooltip and sidebar primitives, which
   are spread across three surfaces rather than sitting behind one control (DEV-012).
3. **Lazy chunks** are ignored inside the entries that load them and carry no limit of their own,
   so nothing gates their growth (DEV-023).
4. **Perf and visual baselines** are one machine, darwin + Chromium (DEV-028, ASM-153). No CI
   hardware baseline exists, so the numbers above are a reference, not a gate. A re-run of the
   gate under load found the cost of that: the palette baseline was racing the 250 ms search
   debounce and only settled inside it on an idle machine. Fixed, but slower hardware would have
   caught it first.
5. **Two docs/06 §7 spec questions** are closed. The floating toolbar takes the editor's own box
   as its flip boundary, so a selection in the first block flips below rather than drawing over
   the page title. The picture is centred in its column through `blockStyles.figureImage`, so the
   centred caption lines up with it; the figure stays column-wide in both renderers, because the
   editor's resizable is `width: 100%` and narrowing the figure would make the caption wrap at a
   different width on each side of the read-edit swap.
6. **Search** is a scan, not an index: capped at 2,000 files and 4 MB a query, so a corpus past
   that is searched partially and says nothing about it.
7. **`--write-ids` is one-way.** It rewrites files in place; there is no undo but the user's own
   version control.

## Running it

```
pnpm i && pnpm dev          # playground, in-memory demo
pnpm gate 3                 # every check this build is held to, 19 steps
pnpm doctor <folder>        # what opening and saving would do to a corpus
```
