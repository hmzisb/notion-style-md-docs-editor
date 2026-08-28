# Phase 4 report · Hardening

Closed 2026-08-27. Gate 3 re-run after the phase: **19 pass, 0 skip, 0 fail — GREEN**. There is
no gate 4 in docs/09; Phase 4 is held to Gate 3 plus its own tests.

## Shipped

P4-T01 filesystem watch and subscribe · T02 HTTP events · T03 draft compare dialog · T04 large
page path · T05 doctor polish and the `ids` migration · T07 local content search · T08 scroll
restoration · T09 this report and `FINAL-REPORT.md`. (docs/09 has no T06.)

External change now reaches an open workspace on every backend that can report it: the file
store diffs one 5 s listing into page and tree events, and the HTTP adapter takes either `sse`
or two conditional reads, both with backoff and echo suppression. A draft written against
another version of a file can be read side by side with that file before it is applied. A page
past 5,000 blocks stays read-only until the reader asks for the editor by name. `pnpm doctor
--write-ids` turns an inferred corpus into a pinned one. The palette's "Search in content" row
finally has a provider behind it in memory and on disk, and a page opened again in a session
lands where it was left.

## Measurements

| Measure | Result | Budget |
|---|---|---|
| `@hmzisb/notion-docs-core` entry, min + gz | **33.76 kB** | 40 kB (docs/10 §5) |
| `@hmzisb/notion-docs-react` `.` entry | **14.63 kB** | 25 kB |
| `@hmzisb/notion-docs-react` `./tree` + `./view` | **38.91 kB** | 80 kB, hard |
| `@hmzisb/notion-docs-react` `./shell` | **96.71 kB** | 98 kB ratchet (DEV-012) |
| `@hmzisb/notion-docs-react` `./editor` (lazy) | **213.88 kB** | 260 kB |
| Cached page switch | **11.4 ms** | < 100 ms |
| Cold page open from IndexedDB | **20.6 ms** | < 150 ms |
| Tree scroll, 5,000 nodes | **8.36 ms/frame** (120 fps), 36 rows mounted | 60 fps, ≤ 45 rows |
| Expand-all, 5,000 nodes | **41.4 ms** | < 100 ms |
| `getTree`, 5,000 OPFS files, warm index | **31.7 ms** | < 300 ms |
| Playground TTI, warm | **40 ms** | < 1.5 s |
| Save round trip | **79 ms p95** over 10 saves | < 300 ms |
| Draft serialize, 3,000 blocks | **27.4 ms** (39.9 ms for the 4,503-block fixture) | 30 ms |
| Keystroke to paint, 3,000 blocks | **33.2 ms p95**, 28.2 median | 16 ms — **over**, DEV-031 |
| `Edit anyway`, 5,200-block page | **16.4 s** | none in docs/10; 25 s tripwire, ASM-160 |
| Unit tests | 1,236 in 59 files, green | |
| E2E | 153 passed, 84 skipped, across `demo`, `opfs`, `opfs-webkit` | |

Browser rows are a single worker against a production build (DEV-028); the serialize row is its
own vitest project for the same reason.

## Review

- **Correctness**: every task landed with the verification docs/09 asks for — `watch.spec.ts`
  and msw tests for the two event paths, RTL for the compare dialog, `large.spec.ts` for the
  guard and `perf.spec.ts` for what passing it costs, unit tests over a temp copy of the corpus
  for the migration, unit plus palette e2e for search, `scroll.spec.ts` for the offsets. The
  scroll spec was checked against a disabled restore, so it can fail.
- **Boundaries**: `pnpm lint` green at `--max-warnings 0`. The new Node file store is in
  `scripts/`, not in either package, so `node:fs` stays out of the published surface.
- **Budgets**: `./shell` moved 96.47 → 96.71 kB, inside its ratchet, with the compare dialog and
  its diff behind a lazy `shell/draft-compare` entry. Content search cost the core entry
  0.71 kB, 33.05 → 33.76.
- **States**: the mismatch banner keeps Apply draft / Keep file as the only place the choice is
  made — Compare is read-only (ASM-158). The large-page banner is the only way into the editor
  on a page past the threshold, and the opt-in is per page session.
- **a11y**: unchanged from Phase 3; the two new surfaces (compare dialog, content hits) are a
  Radix dialog and existing `cmdk` rows, and the phase's axe runs stayed clean.

## Logged this phase

Deviations: DEV-032 (one 5 s poll diffed by `size:mtime` instead of docs/04's two cadences).
Assumptions: ASM-154 … ASM-162 — echo suppression in the provider as well as the session,
OPFS workspace watches, SSE/poll shapes, the compare dialog's read-only scope and its internal
LCS diff, the missing `Edit anyway` budget, and the two migration decisions (the store is driven
directly rather than through the provider; a hoisted H1 leaves the body).

## Gaps carried out of Phase 4

Carried into `FINAL-REPORT.md`: the keystroke budget (DEV-031), `./shell` against docs/02 §7's
60 kB (DEV-012), unbudgeted lazy chunks (DEV-023), single-machine perf and visual baselines
(DEV-028, ASM-153), and the two docs/06 §7 spec questions from Phase 2.
