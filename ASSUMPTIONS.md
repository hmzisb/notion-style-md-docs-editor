# ASSUMPTIONS

Decisions Claude Code made without asking, per `CLAUDE.md` section 6. The user reviews this file, not chat. Newest first.

Format:

```
## ASM-001 · <TASK-ID> · <date>
Question: <the ambiguity, one line>
Assumed: <the choice>
Why: <one line>
Cheap to reverse: yes | no
```

---

## ASM-024 · P1-T05 · 2026-08-25
Question: the playground needs a demo corpus, but `MemoryProvider` takes files in memory and the corpus lives on disk under `fixtures/corpus/`.
Assumed: `providers.ts` inlines the corpus with `import.meta.glob('../../../fixtures/corpus/**/*.md', { query: '?raw', eager: true })` and strips the prefix to get provider paths.
Why: the playground is a dev app, not a shipped artifact, so bundling the fixture text keeps it a static site with no server; the same seed the conformance tests use then drives the UI.
Cheap to reverse: yes

## ASM-023 · P1-T05 · 2026-08-25
Question: Vite 7.3.6 is pinned by docs/11, and `@vitejs/plugin-react@6` resolves `vite/internal`, an export Vite only added in 8 (`ERR_PACKAGE_PATH_NOT_EXPORTED`).
Assumed: the playground pins `@vitejs/plugin-react@^5.2.0`.
Why: docs/11's Vite pin wins over the plugin's latest major; v5 is the release line built for Vite 7 and supports the same Fast Refresh surface.
Cheap to reverse: yes

## ASM-022 · P1-T05 · 2026-08-25
Question: should `apps/playground` import `@docs/react` from the built `dist` or from source?
Assumed: `vite.config.ts` aliases `@docs/react`, its `styles.css` / `theme.css` / `adapters/*` subpaths and `@docs/core` to `src`, so the dev server has HMR into the packages and no build step in the loop.
Why: the published entry shape is already covered by `smoke/` and by `attw` in the gate, so the playground does not need to re-verify it and would otherwise need a rebuild per edit.
Cheap to reverse: yes

## ASM-021 · P1-T03 · 2026-08-25
Question: `persisterFn` is generic (`<T, TQueryKey>`), and a generic function in a `useQuery` options literal drives inference for the whole query to `unknown` - `staleTime` then fails to typecheck against the typed `queryOptions` spread.
Assumed: `queryPersister<T, K>(persister)` in `data/cache/persister.ts` returns the same function annotated as `QueryPersister<T, K> | undefined`, and every call site names its data and key types.
Why: it is an annotation, not a cast - the generic instantiates to the concrete signature - so the query keeps its real data type and no `any` enters the module.
Cheap to reverse: yes

## ASM-020 · P1-T03 · 2026-08-25
Question: docs/04 section 1 names `CACHE_SCHEMA_VERSION` as half of the persist `buster` but never gives it a starting value.
Assumed: `CACHE_SCHEMA_VERSION = 1`, so the buster is `1:1` against `CONTRACT_VERSION` 1; it is bumped whenever the shape written to IndexedDB changes.
Why: records written before the module shipped do not exist, so version 1 is the first schema anyone can have; keeping it separate from the contract version means a cache-only shape change does not have to pretend the provider contract moved.
Cheap to reverse: yes

## ASM-019 · P1-T01 · 2026-08-25
Question: `@arethetypeswrong/cli` resolves every export, so `./styles.css` and `./theme.css` fail with "Resolution failed" - a CSS file has no types and never will.
Assumed: `packages/react/.attw.json` sets `profile: esm-only` and `excludeEntrypoints: ["styles.css", "theme.css"]`, so the gate command in `scripts/gate.ts` stays exactly as written and checks the eight JS entries.
Why: the alternative is shipping a `.d.ts` for a stylesheet, which would be a lie about what the file is.
Cheap to reverse: yes

## ASM-018 · P1-T01 · 2026-08-25
Question: Tailwind emits the variables a utility depends on into `:root, :host`, which docs/11 section 4 forbids ("never `html`, `body`, bare tags, or `*`"), and the emitted block is also wrong here: `--radius-md: calc(var(--radius) * 0.8)` resolves at `:root`, where a plain host has no `--radius`, so every `rounded-md` inside the module would compute to 0.
Assumed: `build-css.ts` rewrites the one `:root, :host` selector in the built sheet to `.docs-root` and then fails the build if any `:root`/`:host` survives. Tailwind's `@property` fallback block (`*, ::before, ::after, ::backdrop { --tw-*: initial }`) is left as written: it only restates initial values of Tailwind-private variables, and the module's own elements need them.
Why: the rewrite is what makes the sheet both leak-free and correct for a non-Tailwind host; the guard means a future Tailwind release cannot reintroduce the leak quietly.
Cheap to reverse: yes

## ASM-017 · P1-T01 · 2026-08-25
Question: docs/10 section 5 budgets `@docs/react`'s `.` entry at 25 kB gz "excl. peers", but `@docs/core` is a dependency of the package rather than a peer, and it already carries its own 40 kB budget.
Assumed: `.size-limit.json` ignores `@docs/core` alongside the peers for all three react entries, and `./shell` is measured with no limit because docs/10 gives it no number.
Why: counting core twice would make the 25 kB budget unreachable by construction; a measured-but-unbudgeted entry still shows growth in every `pnpm build`.
Cheap to reverse: yes

## ASM-016 · Gate 0 · 2026-08-25
Question: docs/10 section 5 budgets `@docs/core` at 40 KB **gz** excluding the platejs peers and `yaml`. `.size-limit.json` was measuring brotli (the `preset-small-lib` default), which read 39.58 kB; the same bundle gzipped is 44.74 kB, 4.74 kB over budget. Breakdown: zod 19.74 kB, remark-gfm and its mdast utils 12.89 kB, the module's own code 11.97 kB.
Assumed: measure gzip, as the budget says, and cut the largest item - `contract/schemas.ts` and `contract/openapi.ts` now import `zod/mini` (the same zod 4.4.3, tree-shakeable functional API) instead of the classic chained API. `.min(1)` becomes `.check(z.minLength(1))`, `.optional()` becomes `z.optional(...)`, and `.meta({ id })` becomes `.register(z.globalRegistry, { id })`. Entry is 30.90 kB gzipped, and `contract/openapi.json` regenerates byte for byte identical.
Why: the budget is a hard number in docs/10 and Phase 1 adds to this entry; 9 kB of headroom is worth one mechanical rewrite. Schemas stay in the root entry, exactly as docs/08 lists them.
Cheap to reverse: yes - the classic API is the same package; the cost is 14 kB gz.

## ASM-015 · P0-T14 · 2026-08-25
Question: docs/05 section 4 step 3 makes `reformat` conditional on `deepEqual(mdastA, mdastB)`, but the two reformats the same section names (`heading_level_clamped`, `definition`) both change the tree by definition, so no page with a reason could ever be a reformat.
Assumed: the known reformats are applied to the source tree before the comparison - headings clamped to H3, references inlined by the same `remarkInlineRefs` pass the codec parses with - and the trees must match after that. An unexplained difference is still `lossy`, with the reason `content_changed`.
Why: keeps step 3 as the honest safety net it was meant to be (a silent content change is never a reformat) while letting the two documented reformats classify as documented.
Cheap to reverse: yes

## ASM-014 · P0-T14 · 2026-08-25
Question: docs/05 section 4 step 2 lists the lossy reasons but not their exact strings, and two of them cannot occur in v1.
Assumed: reason strings are the manifest's (`definition`, `footnoteDefinition`, `heading_level_clamped`, `html`, `math`), plus `unknown_node:<mdast type>` for any other node type the round trip drops and `content_changed` for an unexplained difference. `html` is judged on survival, not on rule introspection: a codec that keeps raw HTML byte for byte (DEV-003) is not lossy, one whose rules drop it is. `table_cell_span` is not implemented - a GFM table cannot span cells, and an HTML table arrives as an `html` node - and `math` stays in the table but is unreachable while `remark-math` is uninstalled.
Why: the classifier has to name a cause a host can act on, and survival is the only definition of "not handled by a custom rule" that works for a codec the module did not configure.
Cheap to reverse: yes

## ASM-013 · P0-T13 · 2026-08-25
Question: docs/05 section 3 keeps `math` in `CodecOptions`, but section 2 lists math among the plugins v1 does not install, so `remark-math` is not a dependency.
Assumed: `createCodec({ math: true })` throws with a message naming the missing dependency.
Why: parsing `$x$` into math nodes that no rule can serialize would drop the formula from the file, which is worse than the option being unavailable; silently ignoring the flag would hide that from the host.
Cheap to reverse: yes

## ASM-012 · P0-T13 · 2026-08-25
Question: mdast has one representation for a soft line break and a hard break (`\n` in a Plate text node), so a serializer has to pick one on the way out.
Assumed: soft. A wrapped paragraph comes back wrapped exactly as the author left it; a source hard break (`\` or two trailing spaces) becomes a soft break, and an angle-bracket autolink `<https://x>` becomes the bare GFM form once.
Why: Plate's default picks hard, which puts a trailing `\` on every wrapped line of every page in the corpus - 29 of 33 pages reformat on the first save. Hard breaks are rare in prose docs, wrapped paragraphs are universal.
Cheap to reverse: no - reversing means a custom Plate node for a hard break, which the editor kit would have to render.

## ASM-011 · P0-T13 · 2026-08-25
Question: docs/05 section 2 lists Callout and Toggle as "P2 stretch, D-17", so it is not obvious whether their `Base*` plugins belong in the P0 kit.
Assumed: both are in `BaseKit` from P0; only their Markdown rules wait for P2-T10 and P2-T11.
Why: docs/05 section 5 says a rule that misses its budget means "keep the plugin out of the kit", which reads as removal from a kit that already has it; registering the plugin early costs nothing because no rule produces those node types yet.
Cheap to reverse: yes

## ASM-010 · P0-T12 · 2026-08-25
Question: docs/09 P0-T12 says the suite must run "against `createMemoryProvider` seeded from the corpus", but docs/08 puts `createMemoryProvider` in `@docs/react/adapters/memory`, and `@docs/react` has no source yet.
Assumed: core's conformance test builds the same thing inline - `createFileStoreProvider(new MemoryFileStore(corpus))`, which is exactly what docs/02 line 145 says `createMemoryProvider` is - and the react adapter will call `runProviderConformance` again when it lands.
Why: exporting a second `createMemoryProvider` from core would put a name in the public API that docs/08 does not list, and moving the suite to react would leave core's own provider unverified until P1.
Cheap to reverse: yes

## ASM-009 · P0-T11 · 2026-08-25
Question: a folder's id is `f_` + a hash of its directory path (docs/03 section 4.2), so moving the directory necessarily changes it, while section 4.6 says "ids are stable".
Assumed: section 4.6's stability claim covers pages, whose ids live in frontmatter; `movePage` on a folder returns the node found at the destination path, under its new id.
Why: the alternative is writing an `index.md` into every folder that is moved, which invents content the user did not ask for; the tree refresh the UI already does after a move carries the new id.
Cheap to reverse: yes

## ASM-008 · P0-T11 · 2026-08-25
Question: `updateMeta` on a folder node has nowhere to write `title` or `icon`, because a folder has no frontmatter.
Assumed: reject it with `unsupported` and a message pointing at saving an index page first.
Why: docs/03 section 4.3 derives a folder's title from its directory name, so honouring a title patch would mean renaming the directory - a move with its own id and link consequences, and one neither section 4.7 nor the section 10 conformance cases ask for.
Cheap to reverse: yes

## ASM-007 · P0-T10 · 2026-08-25
Question: docs/03 section 4.9 defines `TreeSnapshot.version` for the whole tree; a `getTree({ rootId })` snapshot has a different node list and no version rule of its own.
Assumed: the scoped version is `<full tree version>:<rootId>`.
Why: the walk's order map is not retained past `buildSnapshotFromEntries`, so a scope-local fnv1a64 would mean re-walking; the derived form still changes whenever the tree or the scope changes, and only ever over-invalidates.
Cheap to reverse: yes

## ASM-006 · P0-T08 · 2026-08-25
Question: `fixtures/perf/gen.ts` sits outside every package `rootDir`, so no existing Vitest project can run its check.
Assumed: add a third Vitest project, `fixtures`, and include `fixtures/**/*.ts` in `tsconfig.tools.json`.
Why: the generator is real code with a real invariant (deterministic output, exact file count); the alternative was importing across `rootDir`, which `tsc -b` rejects, or shipping it untested.
Cheap to reverse: yes

## ASM-005 · P0-T08 · 2026-08-25
Question: `loadCorpus` must read the repo from disk, but `@docs/core/testing` also carries `runProviderConformance`, which docs/10 section 1 runs in jsdom.
Assumed: `testing/fixtures.ts` imports `node:fs/promises` and `node:url` lazily inside the function, and is listed as an exception to the core node-built-in lint ban.
Why: a static node import would make the whole `./testing` subpath unloadable in a browser test environment; the lazy import keeps the conformance suite platform-neutral and still fails loudly in a browser if `loadCorpus` is actually called there.
Cheap to reverse: yes

## ASM-004 · P0-T01 · 2026-08-25
Question: `attw --pack` fails on an ESM-only package because node10 resolution has no CJS entry.
Assumed: run it as `attw --pack --profile esm-only`.
Why: D-19 asks for ESM-only output; node10 resolution failure is the expected, correct result for that shape, not a defect to hide.
Cheap to reverse: yes

## ASM-003 · P0-T01 · 2026-08-25
Question: `pnpm gate all` in CI would be red for every phase not yet built.
Assumed: `gate all` runs the highest phase that has a `docs/execution/PHASE-N-REPORT.md`; with no report it runs the Gate 0 steps without the report requirement.
Why: a phase report is the signal that a phase shipped (docs/09), so CI verifies what has shipped and stays green during the build.
Cheap to reverse: yes

## ASM-002 · P0-T01 · 2026-08-25
Question: `eslint-plugin-boundaries` v7 classifies `@docs/*` and extensionless relative TS imports as unresolved, so the docs/02 section 2 rules never fire.
Assumed: add dev dependency `eslint-import-resolver-typescript` and point it at the root `tsconfig.json`.
Why: without a resolver the boundary rules are silently vacuous; verified by probe files that the rules now fail core→react and view→tree.
Cheap to reverse: yes

## ASM-001 · P0-T01 · 2026-08-25
Question: docs/11 section 1 pins TypeScript 5.x / Vite 7 / Vitest 3, but npm now ships TypeScript 7.0.2, Vite 8, Vitest 4, ESLint 10.
Assumed: follow docs/11 — TypeScript 5.9.3, Vite 7.3.6, Vitest 3.2.7, ESLint 9.39.5, with `--passWithNoTests` on the root `test` script.
Why: the pinned majors are a locked tooling contract; TypeScript 7 is the native port and would put tsup dts, typescript-eslint and the type-aware lint rules on unproven ground for no product gain.
Cheap to reverse: yes
