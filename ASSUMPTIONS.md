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
