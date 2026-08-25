# 10. Testing and Quality

## 1. Tooling

| Layer | Tool | Notes |
|---|---|---|
| Unit (core, react logic) | Vitest | `environment: node` for core, `jsdom` for react; `fake-indexeddb` for cache tests; `fast-check` for tree properties |
| Component | React Testing Library + `user-event` | Real keyboard interaction; no snapshot of DOM trees except the capability audit |
| Provider conformance | `runProviderConformance` (core) | memory, filesystem polyfill, http via `msw` |
| E2E | Playwright (Chromium; WebKit for the OPFS project as a smoke) | Projects: `demo` (memory), `opfs` (filesystem adapter over OPFS) |
| A11y | `@axe-core/playwright` in e2e; RTL `toHaveAccessibleName` assertions | Lighthouse a11y script for the report |
| Visual | Playwright `toHaveScreenshot` | Baselines in repo, 0.2% max diff ratio, both themes |
| Size | `size-limit` with the esbuild plugin, peers marked external | Budgets in section 5 |
| Package shape | `publint`, `@arethetypeswrong/cli` | Part of `pnpm build` |

## 2. Test matrix (what must exist)

**core**
- `tree.test.ts`: every `apply*` op, property tests (no orphans, unique ids, parent/child consistency, move guard), `descendantCount`, `ancestorsOf`.
- `frontmatter.test.ts`: split/join round trips, key order, unknown keys, CRLF, size cap, malformed YAML.
- `paths.test.ts`, `ordering.test.ts`: slug tables, collisions, natural sort, midpoint and renumber.
- `links.test.ts`: 30-row resolution table.
- `walk.test.ts`: corpus manifest snapshot (nodes, kinds, titles, order, `idByPath` forms).
- `provider-read.test.ts`, `provider-write.test.ts`: every rule in docs/03 §4.
- `conformance.test.ts`: suite against memory.
- `codec.test.ts`: golden `*.expected.md` for every corpus page, idempotence, stringify option pinning, MDX-off behavior on `<br>`.
- `fidelity.test.ts`: manifest-declared levels and reasons.
- `rules-*.test.ts`: callout, toggle, caption golden + idempotence.

**react**
- `provider.test.tsx`, `queries.test.tsx`: namespace derivation, re-key on identity change, stale times.
- `cache.test.ts`: restore-before-fetch, buster, quota degrade, LRU eviction and identity stability.
- `sidebar-store.test.ts`, `recents.test.ts`.
- `tree.test.tsx`: keyboard, persistence, active row, virtualization row count, memoization (render counter).
- `shell.test.tsx`: collapse, resize keyboard, breadcrumbs overflow, empty/error cards, live region.
- `view.test.tsx`: link resolution, asset rendering, external link policy.
- `filesystem.test.ts`, `http.test.ts`: adapter behavior + conformance.
- `session.test.tsx`, `drafts.test.ts`: state machine with fake timers, flush events, draft paths, deep-equal short circuit, `beforeunload`.
- `status.test.tsx`, `banners.test.tsx`.
- `editor.test.tsx`: corpus pages render without errors; `readOnly` toggle keeps the same editor instance.
- `title-icon.test.tsx`, `palette.test.tsx`, `hotkeys.test.ts`, `offline.test.tsx`, `mutations.test.tsx`.
- `audit.test.tsx`: read-only host renders no write affordances; strings coverage; events coverage.

## 3. E2E spec list (`apps/playground/e2e/`)

`modes`, `palette`, `mode`, `blocks`, `block-dnd`, `title-icon`, `offline`, `conflict`, `upload`, `roundtrip`, `create`, `rename`, `move`, `delete`, `folder`, `page-menu`, `block-menu`, `a11y`, `keyboard-only`, `perf`, `visual`, and Phase 4 `watch`, `large`. Each spec seeds its own workspace (demo: fresh memory provider per test; OPFS: a fresh subdirectory per test, removed after) so tests are independent and parallel-safe.

Shared helpers: `openPage(title)`, `enterEdit()`, `typeInEditor(text)`, `waitForSaved()` (polls the OPFS file version), `readFile(path)`, `writeFileBehindApp(path, content)`, `expectMarkdown(path, snippet)`.

## 4. Quality rules

- No skipped tests in `main`. No `test.only`. No `sleep()` in e2e; wait on state.
- Console errors and warnings fail e2e (`page.on('console')` collector) except an allowlist file for known upstream warnings, each with a link.
- Every bug fix adds a test that failed before the fix.
- Golden files change only through a reviewed commit that explains the serializer change.

## 5. Budgets (measured in `perf.spec.ts` and `size-limit`; tolerance 20% unless marked hard)

| Metric | Budget | Fixture |
|---|---|---|
| Cached page switch (click → content painted) | < 100 ms | corpus |
| Cold page open from IndexedDB (no network) | < 150 ms | corpus |
| Keystroke to paint | < 16 ms p95 | 3k-block page |
| Tree scroll | 60 fps, ≤ 45 mounted rows | 5k-node tree |
| Tree expand-all | < 100 ms | 5k-node tree |
| `getTree` on filesystem adapter, warm index cache | < 300 ms | 5k files in OPFS |
| Save round trip (serialize + write) | < 300 ms p95 | 3k-block page, OPFS |
| Draft serialize | < 30 ms | 3k-block page |
| `./tree` + `./view` | ≤ 80 KB gz excl. peers (hard) | |
| `./editor` | ≤ 260 KB gz excl. peers | |
| `.` core entry of `@docs/react` | ≤ 25 KB gz | |
| `@docs/core` | ≤ 40 KB gz excl. `platejs` peers and `yaml` | |
| Playground TTI (local, warm) | < 1.5 s | |

## 6. Fixture corpus manifest

`fixtures/corpus/manifest.json` lists every file with: expected node kind, title, parent path, `order`, icon, expected fidelity level and reasons, and whether it is part of the `exact` round-trip set. Tests read the manifest; adding a page means adding a manifest entry and an `expected.md` when the round trip is not byte-identical.

## 7. CI (`.github/workflows/ci.yml`)

Jobs: `lint-typecheck`, `unit` (core + react), `build` (tsup + publint + attw + size-limit), `e2e` (Chromium, demo + OPFS, uploads Playwright report and screenshots), `smoke` (both hosts). `pnpm gate all` runs the same locally. Caches: pnpm store, Playwright browsers.
