# Phase 0 report · Foundation

Closed 2026-08-25. Gate 0: **8 pass, 0 skip, 0 fail — GREEN**, report present.

## Shipped

P0-T01 workspace bootstrap · T02 models and contract schemas · T03 hashing and ids ·
T04 tree index and pure ops · T05 frontmatter · T06 paths and ordering · T07 link
resolution · T08 fixture corpus and perf generators · T09 walk and `MemoryFileStore` ·
T10 provider read side · T11 provider write side · T12 conformance suite ·
T13 Markdown codec · T14 fidelity classifier and `doctor`.

`@hmzisb/notion-docs-core` is complete for the read and write paths, the codec and the contract.
`@hmzisb/notion-docs-react`, `apps/playground` and `smoke/` are still the empty shells T01 created.

## Measurements

| Measure | Result | Budget |
|---|---|---|
| `@hmzisb/notion-docs-core` entry, min + gzip, excl. platejs peers and `yaml` | **30.90 kB** | 40 kB (docs/10 §5) |
| Composition of that entry | zod/mini + own code 18.0 kB, `remark-gfm` 12.9 kB | |
| Tests | 599 in 20 files, all green | |
| Core coverage | 97.97 % statements, 91.92 % branches | no threshold set |
| Corpus round trip | 33 of 33 pages, 30 byte-identical, 3 against goldens | |
| `pnpm run doctor fixtures/corpus` | 33 exact, 2 reformat, 1 lossy | |
| Perf table (docs/10 §5) | not measured; the harness lands in P1-T13 | |

Bundle finding, fixed this phase: the budget is gz and `.size-limit.json` was measuring
brotli. Gzipped the entry was 44.74 kB, 4.74 kB over. The contract schemas moved to
`zod/mini` (ASM-016), which took 14 kB off and left 9 kB of headroom for Phases 1-3.

## Review

- **Correctness**: coverage above; no `any`, `@ts-ignore` or `TODO` in either package;
  probes confirm a `../../etc/passwd` page title becomes `etc-passwd.md` and a title
  carrying a `---` fence is written as a YAML block scalar and re-reads as one title.
- **Boundaries**: `pnpm lint` green at `--max-warnings 0`, boundary rules included.
- **a11y and visual QA**: nothing to review. Phase 0 ships no UI; docs/06 §12 and the
  1440x900 / 390x844 screenshot pass start with the playground in P1.

## Logged this phase

Deviations DEV-001 … DEV-005. Assumptions ASM-001 … ASM-016. Both files carry the
detail; the three that change behavior a host can see are DEV-001 (asset-only
directories are not nodes), DEV-002 (the first write preserves the node's id) and
DEV-003 (raw HTML round trips byte for byte, so an HTML page is `exact`, not lossy).

## Gaps carried into Phase 1

- `<details>` and callouts have no editor block until P2-T11; today they are raw HTML
  that survives the round trip but renders as its own text.
- Footnotes and math have no v1 block: `classifyFidelity` reports them, the editor
  cannot show them.
- Seven marks Plate knows and v1 does not ship are `plainMarks` (DEV-004); underline is
  the one that would otherwise throw.
- No perf numbers yet, and no e2e: both start in P1-T13.
- 9 kB of gz budget left on the core entry; anything Phase 1-3 adds to `@hmzisb/notion-docs-core` has
  to fit in it.
