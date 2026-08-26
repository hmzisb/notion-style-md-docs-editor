# DEVIATIONS

Every departure from `docs/` gets an entry before the code lands. Newest first. Keep entries factual and short.

## DEV-027 · P3-T10 · 2026-08-26
Spec said: docs/06 section 1 pins the shadcn default palette and its tokens, and section 3 requires 4.5:1 for body text; the destructive control shadcn ships is `text-destructive` on `bg-destructive/10`.
Reality: that pair measures 3.82:1 in light mode (`#e7000b` on `#f8e1e2`), which axe fails on the Delete button and on both destructive menu items. No reduction of the tint reaches 4.5:1 - the ink is what has to move. Dark mode already measures 6.1:1.
Decision: a `--docs-destructive-ink` variable, `color-mix(in oklab, var(--destructive) 85%, black)` in light mode and `var(--destructive)` in dark, used by the destructive button variant and the destructive menu items. The token itself is untouched, so a host that themes `--destructive` still themes both.
Impact: `styles/styles.css`; `ui/button.tsx`, `ui/dropdown-menu.tsx`, `ui/context-menu.tsx`; `e2e/a11y.spec.ts` covers it; no public API change.
Reverse when: shadcn's own destructive pair reaches 4.5:1, or docs/06 names a destructive ink of its own.

## DEV-026 · P3-T08 · 2026-08-26
Spec said: docs/06 section 5 enumerates the sidebar header - workspace title on the left, and on the right "collapse button ... and New page (`SquarePen` ...) when `write`". Nothing else.
Reality: docs/09 P3-T08 requires a "sidebar footer or header control for expand-all/collapse-all", and the footer already holds the New page row plus the host's `sidebarFooter` slot, where a control the host did not put there would read as the host's.
Decision: a third header button, left of the collapse button, on the same hover-reveal as it (`focus-visible` and touch keep it visible). One control for both directions - `ChevronsDownUp` "Collapse all" while anything is open, `ChevronsUpDown` "Expand all" otherwise - and it is absent entirely in a workspace with no expandable row. The copy is the palette's `palette.expandAll` / `palette.collapseAll`, so a host that renames the action renames it in both places.
Impact: `shell/DocsSidebar.tsx` (`ExpandToggle`); `data/sidebar-store.ts` (`expandableIds`, shared with the palette); `shell/shell.test.tsx`; no public API change, +0.26 kB on the shell chunk.
Reverse when: docs/06 section 5 gains its own header inventory for this, or the control moves into an overflow menu.

## DEV-025 · P3-T07 · 2026-08-26
Spec said: docs/05 section 2 - the emoji inline picker (`:`) through `@platejs/emoji` (`EmojiKit`), with shortcodes when Plate's Markdown kit registers `remark-emoji`. Marked "P3 optional".
Reality: neither `@platejs/emoji` nor an emoji dataset is installed, and the registry's `emoji-kit` pulls `@emoji-mart/data` - a single JSON of every emoji, ~120 kB gz - into the editor chunk, which measures 213.65 kB against a 260 kB budget. `remark-emoji` is not installed either, so the codec would carry the shortcodes through as literal text.
Decision: skipped. The `:` combobox is not built and no dependency is added. Emoji reach a page two other ways already: the icon picker's `frimousse` grid for page icons (docs/06 section 12), and the operating system's own picker in any text field.
Impact: no emoji autocomplete inside the editor. The Markdown is unaffected - an emoji typed by any other means is a character like another and round trips.
Reverse when: the editor budget has ~120 kB of room, or Plate ships an emoji plugin that loads its dataset on the first `:`.

## DEV-024 · P3-T07 · 2026-08-26
Spec said: docs/05 section 2 - the block menu comes from `@platejs/selection`'s `BlockMenuKit`, which is `BlockMenuPlugin` rendering Plate's `BlockContextMenu` as `render.aboveEditable`.
Reality: `BlockMenuPlugin` is declared `editOnly` (v53.1.6), so it leaves the plugin list the moment the page flips to read mode. Its `aboveEditable` wrapper leaves the tree with it, React unmounts the subtree below, and the editable is rebuilt - which docs/05 section 8 forbids and `editor.test.tsx` catches ("flips read mode on the editor already mounted"). Its option store also only holds the open state and the pointer position, both of which Radix's own `ContextMenu` already owns.
Decision: `BlockMenuKit` is our own `createPlatePlugin({ key: 'docsBlockMenu' })` with the same `render.aboveEditable`, registered in both modes; the menu turns itself off through the trigger (`disabled` on read-only and on a coarse pointer) instead of by leaving the tree. The selection half is unchanged - `BlockSelectionKit` with `enableContextMenu`, Plate's own - and it is what selects the blocks the menu acts on. The four items run Plate's transforms: `setBlockType`, `blockSelection.duplicate()`, `copySelectedBlocks`, `blockSelection.removeNodes()`.
Impact: `editor/kits/block-menu-kit.tsx`, `editor/ui/block-context-menu.tsx`, `ui/context-menu.tsx` (shadcn, trimmed to the seven parts used). `editor.blockMenu.*` strings. No `blockMenu` plugin key, so a host that wanted to open the menu programmatically through `editor.getApi(BlockMenuPlugin)` cannot; nothing in the module does.
Reverse when: Plate drops `editOnly` from `BlockMenuPlugin`, or exposes the menu as a component that does not gate on it.

## DEV-023 · P3-T02 · 2026-08-26
Spec said: docs/02 section 7 budgets `./tree + ./view` at 80 kB gz and `./shell` at 60 kB, and docs/10 section 4 makes `size-limit` the gate that holds them.
Reality: `size-limit`'s `ignore` list is esbuild's `external`, matched against the specifier text the bundle emits, and an entry that matches nothing is not an error. Two of them had stopped matching: the shell ignored `./icon-picker-grid.js`, but the picker moved to `tree/` in this task (ASM-128) and the emitted specifier is now `./tree/icon-picker-grid.js`. The `./tree + ./view` entry never ignored the picker at all, because until this task nothing in the tree reached it - with the row menu it does, and the entry measured 81.88 kB gz, 1.88 over budget, most of it code no row downloads unless its `⋯` is pressed.
Decision: both entries now ignore `./tree/icon-picker-grid.js` and `./tree/row-menu-surface.js`, which is how `./editor` and `./command-palette` are already weighed (ASM-063). `./tree + ./view` measures 37.46 kB gz against the 80 kB budget. The like-for-like cost of this task is +6.59 kB there - `sonner`, reachable from the tree for the first time because rename and copy link toast - and +0.93 kB in the shell.
Impact: `.size-limit.json`. The lazily loaded chunks are ignored in every entry that loads them and are not weighed under an entry of their own, so nothing gates their growth; that hole is the same one `./command-palette` sits in and is P3-T11's to close along with the rest of the docs/10 section 5 budget rows.
Reverse when: P3-T11 gives each lazy chunk a limit of its own.

## DEV-022 · P3-T01 · 2026-08-26
Spec said: docs/04 section 5 - a `tree` event from `provider.subscribe` invalidates the tree query, unconditionally. Only `page` events are echo-suppressed.
Reality: a provider that watches its own storage emits `tree` from inside `createPage`, before the call resolves. The refetch that follows lands mid-mutation, knows nothing about the temporary id the new page is open under, and takes the optimistic row off the screen the user is typing into.
Decision: a `tree` event is ignored while `client.isMutating() > 0`. This is the same echo suppression the section already applies to `page` events, on the mutation instead of the version: the change being reported is ours, the cache already holds it, and every mutation invalidates the tree on settle a moment later.
Impact: `data/subscriptions.ts`. An external change that happens to land during one of our mutations is picked up by that mutation's own settle invalidation rather than immediately - milliseconds, and only while a write is in flight.
Reverse when: the module gains a way to tell its own writes from the watcher's, e.g. a provider event that carries the id it came from.

## DEV-021 · P3-T01 · 2026-08-26
Spec said: docs/08 lists `DocsStrings` as the host's override surface, and P2-T12 added `palette.createUnavailable` ("Creating pages is not available yet") for the palette's stubbed create.
Reality: P3-T01 wires creation up, so the string names a state that no longer exists. Leaving it would ship a public key that nothing renders.
Decision: removed `palette.createUnavailable` from `DocsStrings`. A host that overrode it now gets a type error naming the key, which is the loud version of the change.
Impact: `data/strings.ts`; `shell/palette.test.tsx` asserts the create flow instead of the toast; `e2e/palette.spec.ts` likewise. Breaking for a host that set that key, in a module that has not shipped a release.
Reverse when: never - the stub it belonged to is gone.

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

## DEV-020 · Gate 2 · 2026-08-26
Spec said: docs/10 section 2 - every focusable control carries an accessible name, and the a11y e2e is clean at all four viewport/mode combinations.
Reality: `@platejs/selection` portals its own `<input class="slate-shadow-input">` onto `document.body` to carry copy, cut and paste while whole blocks are selected. It ships unlabelled and in the tab order, so axe reports a critical `label` violation in edit mode - and a keyboard reaches an invisible field. The plugin exposes no prop for it.
Decision: `DocumentEditor` names it from the DOM once the editor mounts - `aria-label` from the `editor.blockClipboard` string, `tabindex="-1"` so the tab order skips it. The module does not own that node; reaching for it by class is the only handle upstream gives.
Impact: `packages/react/src/editor/DocumentEditor.tsx`, one new string key. Breaks silently (no name, no crash) if the class is renamed upstream; `a11y.spec.ts` in edit mode is what catches that.
Reverse when: `@platejs/selection` takes a label option, or ships the input already named and out of the tab order.

## DEV-019 · Gate 2 · 2026-08-26
Spec said: docs/11 section 5 - vendored Plate registry files stay close to upstream so a later re-add stays mergeable.
Reality: Plate's stock list rendering draws a bullet by injecting `role="listitem"` and `display: list-item` onto the block itself, with no list element anywhere. That is a `listitem` with no `list` parent - axe `aria-required-parent`, critical - and it is what an indent-list architecture produces: there is no real `<ul>` in the value to hang it from. Wrapping the children instead does not help; `belowNodes` renders inside the element, which only adds a second violation.
Decision: the inject is dropped in `kits/list-kit.tsx` and `ui/block-list.tsx` emits a real one-item `<ul><li>` for a bulleted item, exactly as it already emitted `<ol><li>` for an ordered one. Markers, indentation and the Markdown the codec writes are unchanged; only the DOM is.
Impact: `packages/react/src/editor/kits/list-kit.tsx`, `packages/react/src/editor/ui/block-list.tsx`. Edit mode is now axe-clean at 1440x900 and 390x844; `blocks.spec.ts` and `block-dnd.spec.ts` are unchanged and green.
Reverse when: Plate's list plugin renders a real list element around each item.

## DEV-018 · P2-T14 · 2026-08-26
Spec said: docs/09 P2-T14 - "reload mid-typing -> draft banner -> Keep -> save -> file contains the draft".
Reality: a reload cannot leave a draft owing. docs/04 section 3.1 flushes the session on `visibilitychange` -> hidden and on `pagehide`, and the unmount effect flushes too, so a tab that goes away politely saves what it had. The one path that reaches the banner is a tab that never runs those handlers.
Decision: the e2e drives that tab instead. A second tab types, waits for the 500 ms draft write and then has its clock stopped through CDP (`Emulation.setVirtualTimePolicy`, `pause`) before the 1500 ms save - the tab that sleeps, loses power or is killed. The first tab opens the same page and gets the banner, and `Keep` saves the draft. The assertion the plan asks for is unchanged; only the way the tab dies is.
Impact: `apps/playground/e2e/roundtrip.spec.ts` (the third test). No product change. `Page.crash` was tried first and cannot be used: both tabs are same-origin and share a renderer, so crashing one takes the whole context down.
Reverse when: the session stops flushing on `pagehide`, or Playwright can kill one tab's renderer without its siblings.

## DEV-017 · P2-T05 · 2026-08-26
Spec said: docs/05 section 3 pins `bullet: '-'` so a save never reflows a file the user did not touch (D-02).
Reality: `- Item\n- [x] Task\n` is one GFM list with one task item, but Plate's indent lists model a to-do as its own `listStyleType`, so the value holds two lists. Two lists in a row cannot share a marker without merging back into one, and remark writes the second with its other bullet: the page comes back as `- Item\n\n* [x] Task\n`.
Decision: accept it. `bullet` stays `-`, which is what every list that is not directly preceded by a list of another type gets, and what the golden corpus covers. `bulletOther` cannot also be `-`; the only other fix is to model a to-do as a bullet item carrying `checked`, which is not how `@platejs/list` renders one.
Impact: a file that mixes bullet and to-do items inside a single list reflows on its first save. No corpus page does; `blocks.spec.ts` accepts either marker for the second list and says why.
Reverse when: `@platejs/list` models a to-do as a `checked` bullet item, or the serializer learns to merge sibling lists that differ only by `checked`.

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
P2-T04 takes it to 101.21 kB: the status pill and the five banners of docs/06 sections 9-10, their icons and the shared relative-time formatter. The limit is raised to 102 kB, the fourth and last step of this ratchet: the Gate 2 cut lands before Phase 3.
P2-T03 takes it to 96.68 kB: the document session, the draft store and the session store (docs/04 section 3) are data-layer code the shell imports statically, and `DocsShell` is what mounts the page that owns a session. The limit is raised to 98 kB on the same rule as before - one step ahead of the measurement - and the Gate 2 cut is now worth at least 27 kB gz (palette 17.5, toaster 9.8) against a 60 kB budget that the menu stack alone would still exceed.
P2-T07 takes it to 104 kB: the title textarea, the icon button and `useUpdateMeta` (docs/06 section 7). The picker itself is not in this number - `shell/icon-picker-grid` is a tsup entry of its own, dynamically imported and `ignore`d here, so frimousse and `lucide-react/dynamic` are weighed where they load (ASM-063). The limit is raised to 105 kB; the ratchet is now three steps past the point where the Gate 2 cut was due, and that cut is the first item of the Gate 2 review.
P2-T10 leaves it at 104.88 kB, about 120 bytes under the cap: the callout node and its variant menu are editor code, and the shell only pays for the strings. The ratchet has no step left, so the palette/toaster/menu-stack cut is now a precondition for any further shell growth, not just the first item of the Gate 2 review.
P2-T11 takes it past the cap - 105.38 kB with the toggle's strings and node - so the cut this entry has been deferring landed: `shell/command-palette` is a tsup entry of its own, dynamically imported behind `React.lazy` from `CommandPalette` and `ignore`d in the shell entry, which is the ASM-063 shape. The shell now measures 98.08 kB gz and the limit comes down to 100 kB - the first time this ratchet has moved the right way. The toaster (`sonner`, 9.8 kB gz) and the Radix menu stack are still in the entry and still the rest of the Gate 2 cut.
P3-T02 takes it to 100.74 kB and the limit back up to 102 kB. The row menu is the third cut this entry was waiting on and it lands the same way the palette did: the `⋯` is a bare button until it is pressed, and the menu, the popover and the picker behind it are `tree/row-menu-surface`, a tsup entry of its own that is dynamically imported and `ignore`d here (ASM-129, and docs/10 section 5 for why the mount is deferred too). What the shell still pays for is the trigger, the rename field, their strings and the clipboard helper. `sonner` and the Radix menu stack that the breadcrumb overflow uses are what is left of the cut. P3-T03 takes it to 103.95 kB and the limit to 105 kB: `@headless-tree/core`'s `dragAndDropFeature`, `useMovePage` and the tree's own drag, drop-line and edge-scroll code (docs/07 section 3). The `Move to` dialog is not in that number - `tree/move-to-dialog` is a tsup entry of its own, dynamically imported and `ignore`d here on the ASM-063 shape. The same task takes `./tree + ./view` from 37.46 to 40.8 kB gz against its 80 kB hard budget. P3-T04 leaves it at 104.75 kB, a quarter of a kilobyte under the cap: `useDeletePage`, the two hotkeys and the plumbing that opens the dialog are what the shell pays for, while the dialog itself and the Radix alert-dialog behind it are `tree/delete-dialog`, a tsup entry of its own on the ASM-063 shape. The ratchet has no step left again, so the next task that grows the shell either cuts `sonner` or the breadcrumb menu stack the same way, or raises this cap with a reason. P3-T05 leaves it at 104.95 kB - fifty bytes under the cap - for `useSavePage` and the folder card's action (docs/03 section 4.1). P3-T06 is the task that made the cut: the page menu of docs/06 section 8 is `shell/page-menu-surface`, a tsup entry dynamically imported from the header's `⋯`, and `sonner` finally left the entry with it. Callers now toast through `lib/toast`, a queue with no dependencies; `ui/toast-surface` is the tsup entry that owns `sonner` and the one `Toaster` docs/07 section 10 asks for, and the shell mounts it on the first message rather than on every page load. The shell measures 95.64 kB gz - 9.3 kB below where P3-T05 left it, with the page menu already in it - and the limit comes down to 98 kB. `./tree + ./view` drops from 42.94 to 38.56 kB for the same reason. What is left of the Gate 2 cut is the Radix menu stack the breadcrumb overflow uses, and it is now the only thing between this entry and a budget that was written for 60 kB.
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
