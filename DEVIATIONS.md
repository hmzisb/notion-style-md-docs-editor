# DEVIATIONS

Every departure from `docs/` gets an entry before the code lands. Newest first. Keep entries factual and short.

Format:

```
## DEV-001 · <TASK-ID> · <date>
Spec said: <doc and section, one line>
Reality: <what the installed library / platform / measurement actually offers>
Decision: <what was built instead; behavior preserved or not>
Impact: <public API, bundle size, tests, docs touched>
Reverse when: <condition under which the spec's version becomes possible>
```

Categories that always require an entry: new runtime dependency (with gz size and license), a dropped stretch block (D-17), a budget exceeded (with the breakdown), a locked decision that could not be implemented as written, a golden file change.

---

## DEV-016 · P2-T01 · 2026-08-26
Spec said: docs/02 section 2 and docs/11 section 6 hold every file in the repo to the same `strictTypeChecked` + `stylisticTypeChecked` lint.
Reality: the 25 copied Plate registry files fail 60 of those rules after `--fix` - `no-unsafe-*` on Plate's `any`-typed element props, `no-non-null-assertion`, `no-unnecessary-condition`, `no-deprecated`. None is a correctness finding; rewriting them all would fork the vendored source and make a later re-add unmergeable, which is the one thing docs/11 section 5 asks us to protect.
Decision: `eslint.config.js` turns nine non-correctness rules off for `packages/react/src/editor/ui/**` only. Those files still pass `tsc --strict` with `noUncheckedIndexedAccess`, the rules of hooks and every boundary rule; ten genuine strict-mode defects found in them were fixed by hand rather than suppressed.
Impact: `eslint.config.js`; the module's own code, including `src/editor/kits/**` and `src/editor/*.tsx`, is unaffected.
Reverse when: Plate's registry ships types that satisfy the type-safety rules, or the module stops treating these files as vendored.

## DEV-015 · P2-T01 · 2026-08-26
Spec said: docs/11 section 5 - add Plate items with `npx shadcn@latest add @plate/<item>` into `src/editor/ui`.
Reality: shadcn 4.19 ignores `--path` and writes every item to `aliases.ui`, so the items land in `src/ui` next to the primitives. It also re-adds their shadcn dependencies: `add @plate/callout-node` overwrites `tooltip.tsx`, `separator.tsx` and `dropdown-menu.tsx`, three files that carry the local edits in `REGISTRY-SYNC.md`, and it writes a `-static` twin per node that this module never renders (the read view is `@docs/core`'s `PlateView`, not the static registry).
Decision: the items were taken from the same registry the CLI reads (`https://platejs.org/r/<name>.json`), written to `src/editor/ui`, and their `@/components/ui/*` imports redirected to `@/ui/*` - the redirect docs/11 section 5 already requires. `checkbox` was the one missing primitive and came from `@shadcn` through the CLI as normal. `REGISTRY-SYNC.md` records the item list and the method, so a later re-add still diffs against a known source.
Impact: `packages/react/src/editor/ui/*` (25 files), `packages/react/src/ui/checkbox.tsx`, `packages/react/REGISTRY-SYNC.md`.
Reverse when: the CLI honours `--path` and stops force-overwriting already-installed primitives.

## DEV-014 · P1-T13 · 2026-08-26
Spec said: docs/06 section 5 - the sidebar's Search row carries a right-aligned `⌘P` kbd in `text-xs text-muted-foreground`.
Reality: on the sidebar surface that pair measures 4.42:1 (`#737373` on `#f7f7f7`, 12 px, weight 500), which axe reports as a `color-contrast` violation. `--muted-foreground` clears 4.5:1 against `--background` but not against the lighter `--sidebar`, so every other use of the token in the spec is fine and only this one is not.
Decision: the row's kbd is `text-sidebar-foreground/70` instead, which reads as the same muted grey and measures 5.5:1 in light and 7.6:1 in dark. Everything else about the row is unchanged, and `--muted-foreground` itself is untouched, since `theme.css` is generated from shadcn's palette.
Impact: `shell/DocsSidebar.tsx` only; no API, no bundle change. `e2e/a11y.spec.ts` scans the phone layout, which is where the violation surfaced.
Reverse when: the design picks a `--sidebar` dark enough for `--muted-foreground`, or the shortcut hint moves off the sidebar surface.

## DEV-013 · P1-T08 · 2026-08-25
Spec said: docs/06 section 7 - a to-do checkbox is `size-4 rounded-[3px] border border-foreground/40 checked:bg-primary`.
Reality: a native checkbox paints its own control; `background-color` only reaches it after `appearance: none`, which also removes the tick, so `checked:bg-primary` renders a primary-coloured empty square. Drawing a tick back on costs an SVG and a second set of states for a control the reader cannot operate.
Decision: the checkbox keeps the spec's size, radius and border and colours its checked state with `accent-primary` instead of `checked:bg-primary`. The rendered result is the intended one - a primary-tinted box with a tick - through the platform control.
Impact: `view/nodes.tsx` only; no API, no bundle change. The editor's own checkbox in P2 should use the same class.
Reverse when: the design asks for a custom check glyph, at which point `appearance-none` plus an icon is the way.

## DEV-012 · P1-T07 · 2026-08-25
Spec said: docs/02 section 7 budgets `./shell` at 60 kB gz excluding the editor.
Reality: with the shell assembled it measures 67.94 kB gz. Breakdown (minified bytes before gzip): own shell + tree + data code 32.7, tailwind-merge 26.5, `@tanstack/virtual-core` 21.8, `@headless-tree/core` 15.9, the Radix menu stack behind the breadcrumb overflow (`react-menu` 12.8, `react-collection` 7.0, `react-dropdown-menu` 5.2, `react-dismissable-layer` 5.2, `react-popper` 4.4, `react-focus-scope` 3.6, `react-roving-focus` 3.6) plus floating-ui 21.7, the sheet's `react-dialog` 4.8 with `react-remove-scroll` 5.8, `lucide-react` 4.0. The tree alone is 30 kB gz of it and is budgeted a second time under `./tree + ./view`.
Decision: no limit was set on the `./shell` entry in `.size-limit.json` during the phase, and the overage was carried to Gate 1. At Gate 1 the entry measures 90.01 kB gz with the palette in it (cmdk, `@radix-ui/react-dialog`, sonner). Lazy-loading the palette behind `React.lazy` was tried and reverted: `size-limit` bundles dynamic imports into the entry it measures, so the number moved up 3.4 kB while adding a Suspense boundary the budget cannot see. A `92 kB` limit is set instead, as a ratchet against further growth. The two candidate cuts - a lazily imported menu chunk, and pruning what the vendored sidebar drags in - can only be judged once P2's `PageMenu` and P3's row menus exist, because both consume the same Radix menu stack; cutting it now for one breadcrumb menu could buy nothing at all.
Impact: `.size-limit.json` now caps `./shell` at 92 kB, 2 kB above the measured 90.01, so further growth fails the gate while the deviation stands; `docs/execution/PHASE-1-REPORT.md` records the number and the decision. P1-T08 takes it to 70.89 kB: read mode renders `DocumentView`, which docs/05 section 8 makes a static import of the shell. P1-T12 takes it to 89.99 kB: the palette pulls `cmdk` (17.5 kB gz measured alone) and docs/07 section 10 has `DocsShell` mount the toaster, which pulls `sonner` (9.8 kB gz alone); both are candidates for the same lazy chunk as the menu stack, and the palette is the easiest of the three to defer because nothing renders it until a key is pressed.
P2-T02 takes it to 92.17 kB (the mode toggle, the canvas' click-to-edit and the editor-chunk loader), and 93.09 kB once the code-block language list moved to `lib/code-languages` so the read view can name a language the way the editor does (docs/05 section 8: the swap changes nothing the reader sees) - 0.9 kB gz of shared data that the shell pays for because docs/05 section 8 also makes `DocumentView` a static import. The limit is raised to 94 kB to keep the ratchet one step ahead of the measurement rather than two. That task also settles the objection this entry raised against a lazy chunk: `size-limit`'s `ignore` list is esbuild's `external`, and it takes a relative specifier, so a dynamically imported chunk can be left out of the entry that loads it and weighed under an entry of its own - which is how `./editor` is now measured (ASM-063). The palette, the toaster and the menu stack are therefore all cuttable the same way at Gate 2.
P2-T03 takes it to 96.68 kB: the document session, the draft store and the session store (docs/04 section 3) are data-layer code the shell imports statically, and `DocsShell` is what mounts the page that owns a session. The limit is raised to 98 kB on the same rule as before - one step ahead of the measurement - and the Gate 2 cut is now worth at least 27 kB gz (palette 17.5, toaster 9.8) against a 60 kB budget that the menu stack alone would still exceed.
Reverse when: P2's `PageMenu` and P3's row menus are in place - either the menu stack then moves into a chunk `size-limit` measures on its own and the 60 kB limit is set, or the budget is amended in docs/02 with this breakdown as the reason.

## DEV-011 · P1-T07 · 2026-08-25
Spec said: docs/11 section 4 - `styles.css` carries "no preflight ... no theme reset", only utilities plus the few component rules that cannot be utilities.
Reality: without preflight a bare `border-r` (shadcn's vendored primitives are full of them) falls back to `currentColor`, so the mobile sheet, the menus and every card draw a near-black border in light mode and a near-white one in dark. shadcn ships this as a base rule on `*`, which the module may not use because it may not style anything outside its own subtree.
Decision: `styles.css` gains one `@layer base` rule setting `border-color: var(--border)` and `outline-color: var(--ring)` on `.docs-root` and its descendants, plus an explicit `@layer theme, base, components, utilities` order so any `border-<color>` utility still wins. Nothing outside `.docs-root` is touched: a `<p>` next to the module keeps the browser default.
Impact: `styles/styles.css`; the plain-host smoke test in P1-T13 gets the leak check for free.
Reverse when: the module stops vendoring components that use uncoloured border utilities.

## DEV-010 · P1-T06 · 2026-08-25
Spec said: docs/11 section 1 lists `lucide-react` as bundled "(per-icon imports)", and reference/architecture-v2.md line 123 repeats it.
Reality: per-icon imports work for the fixed UI glyphs, but a page icon is author-supplied free text (`icon: lucide:book-open`, docs/03 section 3) and docs/06 section 136 has the icon picker browse the whole Lucide set. A static per-icon map of 1,600 icons is the entire library in the `./tree` entry; a curated subset would render the default glyph for any name outside it.
Decision: fixed UI glyphs stay per-icon imports (`ChevronRight`, `FileText`, `Folder`). Author-chosen page icons go through `lucide-react/dynamic`'s `DynamicIcon`, behind `React.lazy`, so a workspace of emoji and default icons never loads it, and an unknown name falls back to the kind default. `size-limit` bundles with esbuild and no code splitting, so it inlines that dynamic import and every icon behind it (+196 kB gz); `lucide-react/dynamic` is therefore listed in `ignore` for the `./tree + ./view` and `./shell` budgets - the same treatment docs/02 section 7 already prescribes for the lazily loaded editor chunk. The lazy chunk costs ~14 kB gz plus ~0.3 kB per icon actually used, paid only by workspaces that use Lucide page icons; the phase report records both numbers.
Impact: `tree/IconGlyph.tsx`; `.size-limit.json` (two `ignore` lists). `./tree + ./view` measures 29.8 kB gz.
Reverse when: Lucide ships a tree-shakeable name-to-component map, or the product restricts page icons to a curated set - then `IconGlyph` imports that set directly and the `ignore` entry goes away.

## DEV-009 · P1-T03 · 2026-08-25
Spec said: docs/04 section 1 - a persisted query record lives at key `ns:q:<hash>`.
Reality: `experimental_createQueryPersister` builds its own storage key as `prefix + '-' + queryHash` and is the only thing that reads it back (`retrieveQuery`, `persisterGc`, `restoreQueries`, `removeQueries` all rebuild the same string). The separator is not an option, and `queryHash` is TanStack's own `hashKey` of the query key, not a hash the module chooses.
Decision: the module passes the prefix `<ns>:q` and lets the library join, so records land at `ns:q-["<ns>","page","<id>"]`. The part the docs actually rely on holds: every record the module writes is prefixed with the instance namespace, so two instances never collide and `persisterGc` only walks its own keys.
Impact: `data/cache/persister.ts`; `cache.test.ts` builds expected keys with `hashKey` rather than hardcoding them. No public API change - the key is never exposed.
Reverse when: the persister gains a `key` option, or the module writes its own persister and owns the format end to end.

## DEV-008 · P1-T01 · 2026-08-25
Spec said: docs/11 section 4 - `theme.css` "appends the sidebar fallback block from docs/06 section 2".
Reality: docs/06 section 2 puts every `--docs-*` variable in `styles.css`, and the fallback only earns its name when it loads without `theme.css` - a host that supplies its own shadcn variables never imports `theme.css`, and that is exactly the host whose `--sidebar` may be missing.
Decision: the six `--docs-sidebar*` fallbacks live in `styles.css`, the sheet every host imports. `theme.css` carries only the copied `:root`/`.dark` palette.
Impact: `packages/react/src/styles/styles.css`, `scripts/gen-theme.ts`; no public API change; `dist/theme.css` is 2.7 kB of variables and nothing else.
Reverse when: `styles.css` stops being mandatory for `theme.css` users.

## DEV-007 · P1-T01 · 2026-08-25
Spec said: docs/11 section 4 - "`build:css` runs two Tailwind CLI builds", the second being `theme.css` generated by `scripts/gen-theme.ts` from a fresh `npx shadcn@latest init`.
Reality: that init downloads and scaffolds a whole Vite project (about a minute, network required) and `theme.css` is variables only - there is nothing for the Tailwind CLI to compile. Running it inside `build` would make every build network-bound and let an upstream palette change land unreviewed.
Decision: `scripts/gen-theme.ts` is a one-shot generator (`pnpm --filter @docs/react gen:theme`) whose output is committed at `src/styles/theme.css`; `build:css` runs the one Tailwind CLI build for `styles.css` and copies `theme.css` into `dist`.
Impact: `scripts/build-css.ts`, `scripts/gen-theme.ts`, `packages/react/package.json`; the generated file is reviewed as a diff like any other source.
Reverse when: shadcn exposes the palette as data that can be fetched without scaffolding a project.

## DEV-006 · P1-T01 · 2026-08-25
Spec said: docs/11 section 5 pins `components.json` with `"style": "new-york"`, and the same section requires `npx shadcn@latest init -b radix`.
Reality: those two contradict each other in shadcn 4.19 - `new-york` is the pre-Radix style id, and `init -b radix` writes `"style": "radix-nova"`. `shadcn info` reports `base radix`, which is the check docs/11 actually asks for.
Decision: keep the Radix engine and the style id the CLI writes (`radix-nova`, base colour `neutral`, lucide icons). Everything else in the pinned literal is unchanged, including `aliases.ui = "@/ui"` and the `@plate` registry.
Impact: `packages/react/components.json`; the vendored primitives are the radix-nova variants.
Reverse when: the module moves off the Radix engine.

## DEV-005 · P0-T14 · 2026-08-25
Spec said: docs/09 P0-T14 verifies with `pnpm doctor fixtures/corpus --allow-lossy`.
Reality: pnpm 10 parses unknown `--flags` itself in the `pnpm <script>` shorthand, so that exact line fails with `ERROR  Unknown option: 'allow-lossy'` before the script runs; `pnpm doctor fixtures/corpus -- --allow-lossy` runs nothing at all.
Decision: the script and its flag are exactly as specified; the verify command is `pnpm run doctor fixtures/corpus --allow-lossy`, which pnpm forwards verbatim. Exit code is 1 with a lossy page and no flag, 0 with the flag.
Impact: `scripts/doctor.ts`, root `doctor` script (now `tsx --tsconfig tsconfig.tools.json scripts/doctor.ts`, so the script resolves `@docs/core` to source without a build); `docs/execution/PHASE-0-REPORT.md` records the working command.
Reverse when: pnpm forwards unknown options to scripts in the shorthand form.

## DEV-004 · P0-T13 · 2026-08-25
Spec said: docs/05 section 2 - "Keep underline only if the installed plugin round-trips `<u>` in non-MDX mode; otherwise remove the button and the `Cmd+U` shortcut and log the deviation."
Reality: it does not. `<u>text</u>` parses to inline HTML, never to the mark, and the mark's stock rule serializes to `mdxJsxTextElement`, which non-MDX stringify rejects outright: `Cannot handle unknown node 'mdxJsxTextElement'`. The same is true of `highlight`, `kbd`, `subscript`, `superscript`, `comment` and `suggestion`.
Decision: `BaseUnderlinePlugin` is out of `BaseKit`, and all seven marks are listed as `plainMarks`, so a value that arrives carrying one from anywhere else saves as plain words instead of throwing. P2's editor kit ships no underline button and no `Cmd+U`. `<u>` in a file survives byte for byte as raw HTML (DEV-003).
Impact: `codec/base-kit.ts`; two tests in `codec.test.ts`; docs/05's block table row for Underline is not implemented; no public API change.
Reverse when: Plate's Markdown plugin gains a non-MDX `<u>` rule pair, or the module turns MDX on.

## DEV-003 · P0-T13 · 2026-08-25
Spec said: docs/09 P0-T09 lists the corpus HTML comment as "(lossy)", and reference/architecture-v2.md line 414 reads "Plate drops raw HTML by default ... Lossy for `<details>`, `<img width>`, HTML comments".
Reality: that is a statement about Plate's stock rules, and the stock behavior is worse than lossy - raw HTML deserializes to plain text and comes back escaped (`\<details>`, `\<!-- ... -->`), which silently breaks the block in the file. docs/05 section 4 defines a lossy reason as an "html node **not handled by a custom rule**", and D-16 defines lossy as information dropped.
Decision: the codec registers a verbatim `html` rule pair, so raw HTML survives byte for byte in both directions. Nothing is dropped, so raw HTML alone no longer makes a page lossy: `specs/import-export.md` is declared `exact` in the corpus manifest, and `specs/index.md` (`<details>`) stays `exact` instead of waiting for the P2 toggle rule.
Impact: `codec/base-kit.ts` (`FIDELITY_RULES.html`); `fixtures/corpus/manifest.json` (one page's fidelity level); `testing/corpus.test.ts` no longer requires an `html` reason in the corpus - P0-T14 unit tests that reason directly instead. `<details>` still has no editor block until P2-T11; it renders as its own text.
Reverse when: a host needs raw HTML stripped rather than preserved - then this becomes a codec option, not a default.

## DEV-002 · P0-T11 · 2026-08-25
Spec said: docs/03 section 4.2 - a page with a path-hash id gets "a fresh `generateId()` written into frontmatter" on its first write.
Reality: docs/03 section 10 pins the opposite outcome three times in the conformance cases it requires - "save with null base on folder -> ... id preserved", "child of leaf page (conversion, id preserved)", "move between parents updates paths and keeps ids". Minting a new id on first write breaks every one of them, and it invalidates the id the UI is holding at the exact moment the user saves.
Decision: the first write persists the id the node already has (`h_<hash>` for a page, `f_<hash>` for a converted folder) into frontmatter, which is what freezes it against later path changes. Brand-new pages from `createPage` still get a fresh `generateId()`, which is where section 4.2's ULID rule applies unambiguously.
Impact: `fs/semantics.ts` (`persistId`, `savePage`); `provider-write.test.ts` asserts the id is unchanged after the first save, after a folder conversion and after a move; no public API change.
Reverse when: docs/03 section 10 drops the id-preservation cases, or the React layer gains a rebind step that can follow an id change across a save.

## DEV-001 · P0-T09 · 2026-08-25
Spec said: docs/03 section 4.1 - "A directory without `index.md` is a `folder` node: expandable, not openable, convertible to a page."
Reality: read literally that makes every asset directory a node. The corpus has `assets/` and `guides/auth/assets/`, which hold only images; they would appear in the sidebar as empty, unopenable folders that cannot be converted to a page without first inventing content.
Decision: a directory becomes a node only when it, or something beneath it, holds at least one `*.md` file. Directories that hold only assets are skipped, exactly as the same section already skips the asset files themselves.
Impact: `fs/walk.ts` (`hasPages`); the corpus manifest declares one folder node (`archive`), not three; no public API change.
Reverse when: a UI arrives that wants to browse asset-only directories - then this becomes a walk option rather than a rule.
