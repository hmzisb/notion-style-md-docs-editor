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

## ASM-052 · P1-T11 · 2026-08-25
Question: a test that provokes a failed request (a refused backend, offline) trips the docs/10 section 4 rule that a console error fails the run.
Assumed: the e2e console allowlist admits `Failed to load resource: net::ERR_*`, which the browser logs before any handler sees it.
Why: the app's answer to an unreachable backend is asserted in the test itself; failing on the browser's own log would make that case untestable.
Cheap to reverse: yes

## ASM-051 · P1-T11 · 2026-08-25
Question: P1-T11 is verified by an e2e spec, but docs/09 puts the Playwright config in P1-T13.
Assumed: the config, the fixtures and `modes.spec.ts` land here; T13 adds the axe, perf and Lighthouse work on top. The `opfs-webkit` project runs only `@smoke`-tagged specs, because WebKit under Playwright cannot open an OPFS directory.
Why: a spec cannot run without a config, and the webkit project earns its keep by proving the landing adapts to a browser with no directory picker rather than by failing on an engine limitation.
Cheap to reverse: yes

## ASM-050 · P1-T11 · 2026-08-25
Question: which modes may restore themselves when the playground loads.
Assumed: demo, browser storage and remote reopen on load; a folder waits on the landing for the click that its permission prompt needs.
Why: `requestPermission` outside a user gesture is refused, so an automatic folder restore would land on a permission error instead of a workspace.
Cheap to reverse: yes

## ASM-049 · P1-T11 · 2026-08-25
Question: docs/01 section 5.7 asks that switching folders never shows stale pages, but two different folders can both be named `docs`, and the cache namespace is built from the provider key.
Assumed: every folder the user picks takes the next picker slot, and the key is `fs:<slot>:<name>`; an OPFS import takes the next epoch, and the key is `opfs:workspace:<epoch>`.
Why: the slot is already what the handle is filed under, so it is a workspace identity that survives a reload and is unique per pick; an import replaces the workspace wholesale, which is the same event.
Cheap to reverse: yes

## ASM-048 · P1-T11 · 2026-08-25
Question: what a first visit shows, before any mode has been chosen.
Assumed: the landing. `WorkspaceSettings.mode` is `null` until the user picks, rather than defaulting to demo.
Why: docs/01 section 5.7 makes the landing the first run; a default that skips it would hide three of the four modes from anyone who never presses the workspace button.
Cheap to reverse: yes

## ASM-047 · P1-T10 · 2026-08-25
Question: a schema parse rebuilds an object in schema order, which loses the frontmatter key order docs/03 section 4.2 requires a provider to preserve.
Assumed: `getPage` reorders the parsed `meta` back into the order the server sent, keeping any key the schema added.
Why: the order is part of the contract the conformance suite checks, and the alternative — a loose schema that skips validation for `meta` — gives up the drift detection the parse exists for.
Cheap to reverse: yes

## ASM-046 · P1-T10 · 2026-08-25
Question: docs/03 section 10 requires an optional method to exist exactly when its capability flag is on, but the http adapter learns its flags only from `getMeta`.
Assumed: `search` and `uploadAsset` are attached to the provider object inside `getMeta`, and removed again if the backend withdraws the flag.
Why: the same mutation `capabilities` already needs; a provider that always exposes the methods would offer a UI button the backend refuses.
Cheap to reverse: yes

## ASM-045 · P1-T10 · 2026-08-25
Question: `updateMeta` takes a `renameFile` option, but the contract's `PATCH /pages/:id` has no field for it.
Assumed: `renameFile: true` rejects with `unsupported` rather than being dropped silently.
Why: the file-naming policy belongs to the backend over HTTP; dropping the flag would tell the caller a rename happened when it did not.
Cheap to reverse: yes

## ASM-044 · P1-T10 · 2026-08-25
Question: a backend may advertise `capabilities.subscribe`, but the adapter has no `GET /events` client until P4-T02.
Assumed: the adapter forces `subscribe: false` however the backend answers, and defines no `subscribe` method.
Why: an advertised capability with nothing behind it breaks every caller that trusts the flag; P4-T02 flips it on with the listener in the same change.
Cheap to reverse: yes

## ASM-043 · P1-T09 · 2026-08-25
Question: docs/03 section 4.11 puts the index cache in the filesystem adapter, but the frontmatter read it caches lives in core's `createFileStoreProvider`.
Assumed: `FileStoreProviderOptions` gains an optional `infoCache?: Map<string, PageInfo>`, and the adapter passes a `Map` subclass backed by IndexedDB.
Why: additive and one line in core; the alternative is a second copy of the walk in the adapter, which is exactly what D-03 exists to prevent.
Cheap to reverse: yes

## ASM-042 · P1-T09 · 2026-08-25
Question: `FileSystemDirectoryHandle.entries()` is not typed without the `DOM.AsyncIterable` lib, which `tsconfig.base.json` did not include.
Assumed: add `DOM.AsyncIterable` to the shared `lib` list rather than hand-declaring the iterator in the adapter.
Why: docs/11 pins the tooling versions, not the lib list; a hand-written declaration for a standard API is a permanent maintenance cost for nothing.
Cheap to reverse: yes

## ASM-041 · P1-T09 · 2026-08-25
Question: docs/03 section 3 says the filesystem adapter polls when it has no change events, but names no interval.
Assumed: 2000 ms, and `watch` is off unless the host asks for it, so a folder is never polled by default.
Why: a poll is a full recursive listing plus a `getFile` per entry; twice a second on 5k files would cost more than the feature is worth, and once every two seconds is under the threshold where an outside edit feels stale.
Cheap to reverse: yes

## ASM-040 · P1-T09 · 2026-08-25
Question: how often the IndexedDB index is written, and what happens when IndexedDB is unavailable (private mode, no `indexedDB` global).
Assumed: one write per 250 ms burst, so a cold build of 5k pages saves once; every IndexedDB failure is swallowed and the adapter falls back to reading the files.
Why: the cache is an optimisation, and an optimisation that can break the app is a defect.
Cheap to reverse: yes

## ASM-039 · P1-T09 · 2026-08-25
Question: docs/09 P1-T09 asks for "a temp-file-and-move pattern where supported", which on a new file has nothing to protect.
Assumed: an overwrite writes a hidden `.<name>.<n>.tmp` and renames it over the target where `FileSystemFileHandle.move` exists; a file that does not exist yet is written straight to its own name.
Why: the point of the dance is that a failed write leaves the previous content intact; for a new file it would only leave a temp file behind on failure instead of a partial one.
Cheap to reverse: yes

## ASM-038 · P1-T09 · 2026-08-25
Question: a real directory can be empty; a `remove` or a `move` leaves the source directory behind.
Assumed: the store derives directory entries from the paths of the files under them, exactly as the memory store does, and never deletes a directory the user still has on disk.
Why: it keeps both stores on one set of tree semantics (an empty folder is not a node), and deleting a directory the module did not create is not a decision an adapter should make silently.
Cheap to reverse: yes

## ASM-037 · P1-T09 · 2026-08-25
Question: what `pickDirectory` should do on an engine with no `showDirectoryPicker` (everything outside Chromium).
Assumed: resolve to `null`, the same as a user cancelling, rather than throwing `unsupported`.
Why: docs/08 section 7 says the host hides "Open folder" when it is unsupported, so the caller is already branching on a value; a throw would make the unsupported case the noisy one.
Cheap to reverse: yes

## ASM-036 · P1-T08 · 2026-08-25
Question: the Markdown alt text deserializes into the image's `caption`, which is also what docs/06 section 7 styles as a visible caption.
Assumed: nothing is drawn under an image in P1; the text stays the `alt` attribute.
Why: docs/05 section 5 makes a caption a different thing - the italic paragraph after the image - and schedules it for P2; showing alt text under every image would invent captions the author never wrote.
Cheap to reverse: yes

## ASM-035 · P1-T08 · 2026-08-25
Question: a code block in read mode has no syntax highlighting, because the block set's highlighter (`lowlight`) is 30 kB+ gz and belongs to the editor chunk.
Assumed: `./view` renders code as plain monospace text with the language label and the copy button, and highlighting is considered with the editor in P2.
Why: docs/09 P1-T08 asks for the label and the copy button, not for highlighting, and `./tree + ./view` is budgeted at 80 kB gz for both entries together.
Cheap to reverse: yes

## ASM-034 · P1-T08 · 2026-08-25
Question: what a link should look like when it points inside the tree but at a page the reader cannot reach (moved, deleted, or outside the host's `rootId` subtree).
Assumed: it renders as inert text in `text-muted-foreground` with a dotted underline and the raw href as its `title`, rather than as a link that goes nowhere or as an external link.
Why: docs/05 section 11 allows only `http`, `https` and `mailto` out; a relative href is not addressable, so there is nothing to navigate to, and a dead link that looks live is worse than one that reads as text.
Cheap to reverse: yes

## ASM-033 · P1-T08 · 2026-08-25
Question: raw HTML survives the codec as an `html` mark (DEV-003), and docs/05 section 11 says it is never rendered.
Assumed: the mark renders in a `hidden` span - present in the DOM, painted by nothing, read by nothing - through a one-key plugin registered only in the view.
Why: the bytes have to stay in the value or a save would drop them; `hidden` keeps them out of the page and out of the accessibility tree without a second value.
Cheap to reverse: yes

## ASM-032 · P1-T08 · 2026-08-25
Question: `DocumentView` resolves internal links against a tree index, and the shell can be scoped to a subtree with `rootId`.
Assumed: `DocumentView` takes the same optional `rootId` prop and resolves against that subtree, so a link to a page outside the host's scope stays unresolved.
Why: the reader can only navigate to what the shell shows; resolving against the full tree would produce links the sidebar cannot follow.
Cheap to reverse: yes

## ASM-031 · P1-T07 · 2026-08-25
Question: jsdom answers no media query and measures every element as 0x0, so the shell tests would each need the same stubs as the tree tests.
Assumed: `matchMedia`, `offsetWidth`/`offsetHeight` and the pointer-capture methods are stubbed once in `testing/setup.ts` rather than per test file.
Why: they are gaps in the environment, not fixtures of one suite; a second copy in the shell tests would drift from the first.
Cheap to reverse: yes

## ASM-030 · P1-T07 · 2026-08-25
Question: docs/06 section 15 asks for 44 px touch targets at 390 px, but a target is about the pointer, not the viewport.
Assumed: the 768 px breakpoint drives it - `useIsMobile()` for the virtualiser's row height, `max-md:` for the sidebar and header buttons - not `pointer: coarse`.
Why: the review step for every UI task is a screenshot at 390x844 taken with a mouse; a `pointer: coarse` rule would be invisible there and could never be verified.
Cheap to reverse: yes

## ASM-029 · P1-T07 · 2026-08-25
Question: a Radix portal mounts on `document.body`, outside `.docs-root`, and docs/11 section 4 offers either the `container` prop or a `DocsPortalRoot` mounted by `DocsProvider`.
Assumed: `lib/portal.ts` owns one lazily created `div.docs-root` (`display: contents`) on `document.body`, and every portal in `ui/` passes it as `container`.
Why: it costs no render, no context and no provider element. It is one element per document, which CLAUDE.md section 8 would call a singleton, but it holds no instance state - two `DocsProvider`s share inert chrome. Known ceiling: two shells under different theme ancestors would share one container and one theme; the fix then is a per-provider container passed through context.
Cheap to reverse: yes

## ASM-028 · P1-T07 · 2026-08-25
Question: `DocsShellSidebarOptions.defaultWidth` and `defaultCollapsed` compete with the persisted sidebar store, which docs/08 section 4 does not resolve.
Assumed: they seed a namespace that has never persisted anything, once, during the first render; after that the store wins and the host defaults are ignored.
Why: a host default that overrode the store would undo the user's own resize on every mount, and seeding during render avoids a second paint.
Cheap to reverse: yes

## ASM-027 · P1-T07 · 2026-08-25
Question: docs/06 puts a title block, a mode toggle, a page menu, a search row and a toaster in the shell; none of their owners (P1-T08, P1-T12, P2, P3-T01) exist yet.
Assumed: T07 ships the layout, the header, the states and the canvas title block only, and each control lands with the task that owns it.
Why: the alternative is stub components that later tasks would have to unpick, against CLAUDE.md section 3 ("scaffold exactly what the task specifies").
Cheap to reverse: yes

## ASM-026 · P1-T06 · 2026-08-25
Question: docs/06 section 5 draws a tree row with `[chevron][icon][title][actions]` and reference v2 Appendix B passes `item.getProps()` straight onto the row.
Assumed: the row takes primitives (`id`, `title`, `depth`, `expanded`, `active`, `focused`, ...) plus stable callbacks and writes its own ARIA, instead of spreading the headless-tree item props.
Why: docs/09 P1-T06 requires `React.memo` rows on primitive props, and `getProps()` returns a new object per render, so every row would re-render on every scroll tick.
Cheap to reverse: yes

## ASM-025 · P1-T06 · 2026-08-25
Question: docs/07 section 2 lists type-ahead as "provided by headless-tree", but headless-tree's `searchFeature` only works when the host renders the input it owns, and docs/06 section 5 has no such input in the sidebar.
Assumed: `PageTree` renders a visually hidden, focusable input wired to `getSearchInputElementProps()`, labelled "Find a page by name", after the tree container so headless-tree's keydown handler reaches it. Matching is by title prefix, per docs/07's wording.
Why: without the input, typing a letter opens a search that swallows every following keystroke; with it, type-ahead behaves as the keyboard map describes and `Escape` returns the focus to the matched row.
Cheap to reverse: yes

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
