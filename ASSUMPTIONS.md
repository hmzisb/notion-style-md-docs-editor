# ASSUMPTIONS

Decisions Claude Code made without asking, per `CLAUDE.md` section 6. The user reviews this file, not chat. Newest first.

## ASM-164 · UX-T04 · 2026-08-27
Question: three of Notion's nine text colours miss the 4.5:1 that docs/06 section 1 asks of text - orange 3.28:1, yellow 2.75:1 and red 4.26:1 on white. Darken them, or ship the palette as it is?
Assumed: ship it. The light values are Notion's own; dark mode uses a lighter set that measures 5.05:1 to 7.64:1 on the near-black ground.
Why: the ratio governs the module's own chrome and its default body text, both untouched here - a colour is content the writer chose for emphasis, and the reader can always turn it off. Darkening the three would leave the file's hex and the app's paint saying different things for the sake of a rule the writer opted out of.
Cheap to reverse: yes - nine variables in `styles.css`, and the stored hex is what any other reader sees anyway.

## ASM-163 · UX-T02 · 2026-08-27
Question: the owner asked for a Notion-style `/page` row in the slash menu. Notion writes a sub-page block into the page you are on and opens the new page; should this one write a Markdown link into the parent as well?
Assumed: no. The row creates a child of the page being edited and opens it with the title focused - the sidebar's own "Add a page inside" flow, reached from the keyboard - and writes nothing into the parent.
Why: a link would not survive. A leaf page becomes `<dir>/index.md` the moment it gains a child (docs/03 section 4.2), so writing the link rewrites the very file the editor is holding, and the session raises "Changed on disk" over its own draft - measured, not guessed. Even past that, docs/03 section 4.7 leaves inbound links unrewritten when a page is renamed, so the child's first title would break the link the parent had just been given. The tree is this module's hierarchy surface, and it shows the child immediately.
Cheap to reverse: no - a sub-page link needs the session to accept a conversion it caused, and needs link rewriting on rename.

## ASM-162 · P4-T05 · 2026-08-27
Question: docs/03 section 4.3 says a page's title falls back to the first `# H1` in the body "not stripped", so what should `--write-ids` do with that heading once it has copied it into frontmatter `title`?
Assumed: take it out of the body. The migration writes `title: <the H1>` and removes that line, and only when the H1 is the page's first content line.
Why: after the migration the shell renders the title above the page, so leaving the H1 would show it twice - the read-time rule is about pages nobody has migrated, not about the file this tool has just rewritten. A heading further down is a section of the page, and hoisting it would change what the page says, so it is left alone.
Cheap to reverse: no - it rewrites files. Run it on a copy, or on a clean checkout.

## ASM-161 · P4-T05 · 2026-08-27
Question: docs/09 asks for the `--write-ids` pass to go through a Node `FileStore`; the store can be driven directly or through `createFileStoreProvider`.
Assumed: the migration reads and writes through `NodeFileStore` directly, and the provider is used only in the test, to prove the tree the module builds is the same one before and after.
Why: the pass is per-file text work - split, patch, join - and the provider's page API would parse each page to a value and serialize it back, which is the one thing a migration must not do to a file the user did not edit. `store.list()` already applies the walk's exclusions, so the file set is the same either way.
Cheap to reverse: yes

## ASM-160 · P4-T04 · 2026-08-27
Question: docs/09 asks that `Edit anyway` on a page past the 5,000-block threshold work "within budget", and docs/10 section 5 has no budget for that path.
Assumed: measure it rather than invent a budget. On the reference machine, opting past the guard on a 5,200-block page takes 16.2 s against a real build; `perf.spec.ts` asserts a 25 s tripwire, so a change that makes it worse is not silent, and the number is recorded on every run.
Why: the threshold exists because editing a page this size is slow; a budget written after the fact would either be the measurement (and fail on a slower machine) or a number nothing enforces. The behaviour - read-only, the banner, the opt-in - is asserted separately in `large.spec.ts`, which runs on every e2e.
Cheap to reverse: yes

## ASM-158 · P4-T03 · 2026-08-27
Question: docs/04 section 3.3 lists `Compare (text diff dialog)` as optional and does not say what the diff shows or whether it can resolve the mismatch.
Assumed: a read-only side-by-side line diff of the file against the waiting draft, opened from a third ghost action on the mismatch banner. The two banner buttons stay the only way to answer; the dialog has no Apply of its own.
Why: the question the banner asks is "which of these two", and a third answer inside a dialog would be a second place to make the same choice. Read-only also means a page cannot be resolved by a dialog the user opened to look at it.
Cheap to reverse: yes

## ASM-159 · P4-T03 · 2026-08-27
Question: docs/09 offers `a small diff implementation or the `diff` package`.
Assumed: an internal line diff (`packages/react/src/lib/line-diff.ts`, ~90 lines: common prefix/suffix trim, then LCS over what is left), and the dialog behind a lazy chunk of its own so `./shell` does not carry either.
Why: docs/11 section 8 requires a deviation entry with size and licence for a new runtime dependency, and `diff` would be one for a feature marked optional; the fallback above 1,200 changed lines a side is "all of this went, all of that came", which is still readable side by side.
Cheap to reverse: yes

## ASM-156 · P4-T02 · 2026-08-27
Question: docs/03 section 9 gives the adapter `events: 'sse' | 'poll'`, but the contract has no "what changed since" endpoint for the poll to ask.
Assumed: the poll asks the two questions the module acts on, both conditionally - `GET /tree` and `GET /pages/:id` for the page last read, each with `If-None-Match`, so an unchanged backend answers `304` and nothing else. `sse` carries whatever the backend pushes.
Why: a poll that re-reads the whole tree unconditionally is a payload every period for a workspace that changes twice a day; conditional requests make the steady state two empty responses. The page last read is the open page in this module, which is the one docs/04 section 5 names.
Cheap to reverse: yes

## ASM-157 · P4-T02 · 2026-08-27
Question: should `events` default to `'sse'` when the backend advertises `capabilities.subscribe`?
Assumed: no - the default is `'none'`, and `capabilities.subscribe` is forced off unless the host asked for events.
Why: a host that mounts the module gets no background connection it did not ask for, and a capability is what the module may call rather than what the backend can do. A host that wants live updates writes one option.
Cheap to reverse: yes

## ASM-154 · P4-T01 · 2026-08-27
Question: docs/04 section 5 suppresses a save echo by comparing the event version with `session.lastSavedVersion`, which is a React-side check - but a store that reports its writes synchronously (the memory store, and any future one) calls the watcher from inside `writeText`, before the save has resolved and before the session knows the version.
Assumed: the provider suppresses its own echo as well, by remembering the version of every page it has read or written (`seenVersions`) and emitting a `page` event only for a version it has not seen. The session-level check stays exactly as the spec has it.
Why: without it, the watcher can invalidate the page query while the save that caused it is still in flight; the refetch lands under a dirty editor and `refreshed` turns that into a conflict banner for a change the user made themselves. Two cheap checks at two layers, and the provider's is the one that cannot race.
Cheap to reverse: yes

## ASM-155 · P4-T01 · 2026-08-27
Question: the playground opened its OPFS workspace without `watch`, so nothing in the default e2e run exercised subscriptions.
Assumed: OPFS opens with `watch: true`, like the folder workspace.
Why: another tab writing to the same OPFS folder is a real case for a browser workspace, and it is the only mode a test can write behind the app's back. Cost is one listing per 5 s while a workspace is open.
Cheap to reverse: yes

## ASM-153 · P3-T14 · 2026-08-27
Question: `toHaveScreenshot` baselines are per-renderer, and a pixel written by this machine's Chromium on macOS is not what a Linux CI or a WebKit run produces.
Assumed: the baselines are the darwin Chromium OPFS run only - `snapshotPathTemplate` carries `{platform}` and `{projectName}`, and the spec skips every project but `opfs`.
Why: font rasterising differs enough between platforms that a shared baseline is a permanent red; another OS regenerates its own set on first run, and the checked-in set stays the reference for the machine that reviews the design. A visual diff is a review aid, not a portable contract.
Cheap to reverse: yes

## ASM-152 · P3-T11 · 2026-08-26
Question: two e2e specs that click into the body and type straight away wrote their text in two places - the first key where the click left the caret, the rest where the caret had been before it - and did it about two runs in three.
Assumed: a `clickCaret` fixture that holds the wait inside the click (`click({ delay: 60 })`), used everywhere a test types straight after clicking into the editor.
Why: Slate takes the caret from the browser's `selectionchange`, which Chromium dispatches a task after the click; a key pressed before that arrives is applied to the selection the model still holds, and `beforeinput`'s flush has nothing pending to flush. Nobody types two milliseconds after a click, so the module is not what needs the fix - the driver is. `block-dnd.spec.ts` had already worked around it locally with a sleep; that is now the same helper.
Cheap to reverse: yes

## ASM-151 · P3-T11 · 2026-08-26
Question: docs/10 section 5 budgets "cold page open from IndexedDB", and a reload lands back on the page that was open - which is painted before the clock starts, so the first measurement of it came out negative.
Assumed: the measurement navigates to another page first, reloads there, and then opens the page under test from the tree, with the persisted cache warm and the network provider still resolving.
Why: what the budget is about is the first paint of a page the app has never rendered in this session but has in its cache; a reload onto the same page measures nothing.
Cheap to reverse: yes

## ASM-150 · P3-T11 · 2026-08-26
Question: docs/04 section 3.1 sets the draft debounce at 500 ms, "if serialize exceeds 30 ms on the 3k fixture, switch draft to 1 s". Which page that is decides the number: the fixture file `pnpm perf:gen` writes is 3,000 Markdown blocks, and it parses to 4,503 blocks of the value, because a list item and a table row are blocks too. The first 3,000 of them - the "3k-block page" docs/10 section 5 budgets - serialize in 26 ms; the whole file costs 38 ms.
Assumed: read the clause against the file, so `DRAFT_MS` is 1 s, and `fixtures/perf/serialize.test.ts` is the measurement that decides it: it asserts the 30 ms budget on 3,000 value blocks with the 20% tolerance and reports the whole fixture next to it.
Why: the debounce protects the largest page a user actually has open, which is the file, not a prefix of it; and a draft one second behind the last keystroke is still well inside the 1.5 s autosave it precedes. The docs/10 row stays green either way, so nothing is being papered over.
Cheap to reverse: yes

## ASM-149 · P3-T10 · 2026-08-26
Question: inside a `page.evaluate` callback the linter reads a DOM where `Element.textContent` is never null, so `?? ''` on it is reported as an unnecessary condition - while `tsc`, which the same files pass through, types it `string | null` and requires the fallback.
Assumed: keep the fallback, which is what the browser needs, and carry one `eslint-disable-next-line @typescript-eslint/no-unnecessary-condition` per site with the reason next to it.
Why: the two checkers disagree and only one of them is right about the runtime; `reportUnusedDisableDirectives` is an error here, so the directive removes itself the day the types agree.
Cheap to reverse: yes

## ASM-148 · P3-T10 · 2026-08-26
Question: docs/07 section 7's state matrix says every way into edit mode - `E`, `Enter`, the Edit button, `Cmd+Shift+E` - lands at the start of the first block, but only the two keys asked the canvas for a caret; the button and the shortcut set the mode and nothing else, so the focus stayed where it was and the first keystroke went nowhere.
Assumed: entering edit mode places the caret at the start of the first block by default, unless something asked for a caret of its own (a click, `Enter` in the title) or the page already holds the focus - which is how the title keeps it on a rename and on a page created a moment ago.
Why: the matrix is unambiguous about where the caret goes; the containment check is what keeps the title's own claim, which lands one commit earlier than the editor chunk.
Cheap to reverse: yes

## ASM-147 · P3-T10 · 2026-08-26
Question: docs/04 section 3.2 gives a version that changed under an open session two outcomes - swap in silently when clean, conflict when dirty - and the module's own first-title rename is such a change: it rewrites the frontmatter of the page being typed into, so the file hashes differently while the body under it does not move.
Assumed: a version whose body is byte-identical to the one the session started from is adopted, dirty or not: the base moves to the new version and nothing is reset. `useUpdateMeta` invalidates the page it wrote, so the session is told at all.
Why: without the invalidation the session saves against a version that no longer exists and the provider rejects it; with the invalidation alone, renaming a page while typing in it raised "Changed on disk" over the user's own rename. A frontmatter write is not a body conflict, and there is nothing to reload or overwrite.
Cheap to reverse: yes

## ASM-146 · P3-T10 · 2026-08-26
Question: docs/09 P3-T10 asks for a "reduced-motion snapshot", and a screenshot cannot prove that an animation was skipped rather than caught after it finished.
Assumed: the check reads what the page applies under `prefers-reduced-motion: reduce` - computed `animation-duration`, `transition-duration`, the `--docs-motion` token and the absence of a transform - on a menu opened with the media feature emulated.
Why: `getAnimations()` is a racy snapshot of what happens to be running and a pixel baseline only proves the end state; the applied rule is the thing docs/06 section 8 actually requires. Playwright's `test.use({ reducedMotion })` does not reach the page through this file's fixtures, so the test emulates the media feature itself.
Cheap to reverse: yes

## ASM-145 · P3-T06 · 2026-08-26
Question: `useHotkeys` calls `preventDefault()` on every match before it runs, so the `Enter` binding of docs/07 section 7 (content scope) swallowed `Enter` on every button inside the content region - the page menu, the icon button, the banner actions - and the button never saw a click.
Assumed: a bare `Enter` or `Space` on a control that activates on it (`button`, `a[href]`, `summary`, `role=button|link|menuitem|option|treeitem`) never reaches a hotkey, and the guard lives in `useHotkeys` rather than in the one binding that hit it.
Why: docs/07 section 1 gives the focused control the keys it answers for; fixing it at the dispatcher covers every binding, and the region itself (`role=region`, activates on nothing) still takes `Enter` into edit mode.
Cheap to reverse: yes

## ASM-144 · P3-T06 · 2026-08-26
Question: docs/07 section 10 says a delete toasts, but the page menu that starts one is inside the header of the page being deleted - and TanStack Query drops the per-call `onSuccess`/`onError` of a mutation whose caller unmounted, which is exactly what deleting the open page does.
Assumed: `useDeletePage` says both toasts itself, from the mutation's own callbacks, and neither the tree nor the page menu says them any more.
Why: the toast is the operation's, not the caller's - the two call sites were already saying the same two strings, and a message the user only gets when they deleted from the sidebar is worse than one place owning it.

## ASM-143 · P3-T06 · 2026-08-26
Question: docs/06 section 8 has "Download .md" and never says what the file is called.
Assumed: the page title, stripped of anything a file name cannot hold, and `page.md` when that leaves nothing.
Why: half the pages in a workspace are `index.md`, so the path would hand the reader a folder of files with the same name; the title is what they asked for by name.

## ASM-142 · P3-T06 · 2026-08-26
Question: docs/06 section 8 defines the page menu against a page and says nothing about a folder node, which the header can also be showing (docs/03 section 4.1).
Assumed: no `⋯` on a folder - it has no file to copy, download or count, and its title and place in the tree are the row menu's business.
Why: five of the eight items would be dead, and the three that are not are already on the row the folder has in the sidebar. See [[asm-141]] for the same node's card.

## ASM-141 · P3-T05 · 2026-08-26
Question: docs/06 section 11 gives the folder card an action for a host that can write and a child list for one that cannot, and does not say which a writing host gets.
Assumed: a writing host gets both - the "Create page" action and the child list under it.
Why: the list is the only way into the pages the folder holds, and hiding it behind the host's capabilities would make a folder's own children unreachable for the host that can do more, not less.

## ASM-140 · P3-T04 · 2026-08-26
Question: docs/04 section 4 puts "navigate to parent or home" in the delete's optimistic column but says nothing about a delete the provider then refuses, which leaves the reader on the parent of a page that still exists.
Assumed: the mutation records where it navigated from and navigates back on error, the way `useCreatePage` returns to the page the create was started from.
Why: the rollback is meant to leave nothing behind; a reader stranded one level up from a page that came back is half a delete, and it is the only part of it the toast cannot explain.

## ASM-139 · P3-T04 · 2026-08-26
Question: the delete dialog is opened from a row menu item or from a row's own `Delete` key, and both of those go away with the page. Radix restores focus to whatever had it when the dialog opened, which after a confirmed delete is a row that no longer exists.
Assumed: the tree places the keyboard itself once the dialog has gone - on the next sibling, else the previous one, else the parent after a delete, and back on the row after a cancel - from an effect that runs after Radix's focus scope has torn down.
Why: docs/07 section 9 has the keyboard land somewhere real after every dialog; doing it from the close handler instead puts the focus back while the dialog's focus trap is still up, and the trap takes it straight back.

## ASM-138 · P3-T04 · 2026-08-26
Question: docs/07 section 10 lists what toasts are for and a successful delete is not on the list, while docs/06 section 14 gives "Delete" -> "Deleted 'Auth'" as the example of a button's verb matching its toast.
Assumed: a confirmed delete toasts `menu.deleted`; a refused one toasts `error.delete`.
Why: docs/06 names this exact toast and the string is already in `strings.ts`; the section 10 list reads as the shape of the rule ("never for save success") rather than a closed set.

## ASM-137 · P3-T04 · 2026-08-26
Question: docs/01 section 6 hides what a provider cannot do, and `capabilities.delete` says whether it can delete - but the tree also has no `Delete` for a host that passed no `onCreate`.
Assumed: the row menu's `Delete` and the `Delete`/`Backspace` hotkeys are both gated on `capabilities.delete`, and the menu item additionally on the host having given the tree an `onCreate`, the same pair `Move to` uses. Offline, the item is disabled with the D-05 reason on it rather than hidden.
Why: a read-only host asked for a tree that shows pages, not one that removes them; the capability and the host's own intent are two different refusals and both have to hold.

## ASM-136 · P3-T03 · 2026-08-26
Question: docs/07 section 3 wants no indicator drawn over a target the guard refuses. headless-tree's `onDragOver` returns before it updates `dnd.dragTarget` when `canDrop` is false, so the last target it did accept stays in state - and the line and the ring stay drawn where the pointer no longer is.
Assumed: `canDrop` records its verdict in a `blocked` state, and the line and the row ring render nothing while it is set; the drag ending clears it.
Why: the guard is the tree's own rule, so the tree is what has to stop drawing for it; the alternative was re-deriving the library's hit testing from the raw `dragover` to know which row the pointer is over.

## ASM-135 · P3-T03 · 2026-08-26
Question: a page dropped onto a row lands inside it, and the parent may be collapsed - or be a page with no children at all, which is what a first drop into it makes it. `item.expand()` returns without doing anything when `isFolder()` is false, which is exactly that case.
Assumed: the destination is expanded through the sidebar store (`setExpanded(parentId, true)`), the way `DocsShell` already expands the parent of a page it creates.
Why: the store is the tree's expansion state, and it takes an id whether or not the node has children yet; going through the item instance makes "can this be expanded" a question about the tree before the move rather than after it.

## ASM-134 · P3-T03 · 2026-08-26
Question: docs/07 section 3 puts "into" in the middle 50% of a row. headless-tree's `reorderAreaPercentage` is the fraction at each end that reorders instead.
Assumed: `0.25`, so the top and bottom quarters insert and the middle half goes inside; `openOnDropDelay: 600` and `indent: 12` come from the same section and `--docs-indent`.
Why: the config is stated as one end's share, not the middle's; 0.25 at each end is the same rule written the library's way.

## ASM-133 · P3-T03 · 2026-08-26
Question: docs/07 section 3 auto-scrolls within 32 px of the tree's edge. `dragover` fires only while the pointer moves, and a pointer held against the edge does not.
Assumed: the container's capture-phase `dragover` starts a 16 ms interval that scrolls by 6 px while the pointer is in an edge band, cleared on leave, drop and drag end. Capture, because rows call `stopPropagation` on their own `dragover`.
Why: the case the rule exists for is a pointer that has stopped at the edge with the list still to travel.

## ASM-132 · P3-T03 · 2026-08-26
Question: docs/07 section 3 starts a drag after 4 px of movement, and long-presses for 400 ms on touch.
Assumed: the drag is the browser's own HTML5 drag, which headless-tree's `dragAndDropFeature` is built on, so the threshold is the browser's (~5 px in Chromium) and there is no long-press. The same line of docs/07 disables touch drag below 768 px in v1, which is where `useIsMobile` turns `draggable` off; the keyboard and Move to are the rest of the answer there.
Why: replacing the transport with a pointer-event drag to buy 1 px of threshold would cost the drag image, the cursor feedback and `Esc` - all of which the browser already provides. Dragging from the row's own buttons was checked and does not start a drag: Chromium does not treat a `button` as draggable content.

## ASM-131 · P3-T03 · 2026-08-26
Question: which hosts get `Move to` in the row menu, and what does it do offline?
Assumed: present when the host passed `onCreate` and the provider reports `capabilities.move`; disabled with the offline reason above it while the provider is unreachable, the way Add inside, Rename and Change icon are (ASM-126).
Why: a host that gave the tree no way to add a page did not ask for a way to rearrange one either, and D-05 is about writes not reaching a provider rather than about the item being wrong.

## ASM-130 · P3-T03 · 2026-08-26
Question: docs/06 section 5 says a drop onto a row makes the page its child, without saying where among the children it lands.
Assumed: last, which is what docs/06 section 8 already says for the Move to dialog; between two rows the index is headless-tree's `insertionIndex`, which counts the siblings with the dragged row taken out - the same coordinate `movePage` and `applyMove` use.
Why: one rule for both ways in, and the one the dialog already states.

## ASM-129 · P3-T02 · 2026-08-26
Question: docs/06 section 5 gives every row a `⋯`, and docs/10 section 5 gives 45 mounted rows a 20 ms frame. A Radix dropdown and a popover per row cost more than that: the tree scroll test measured 22.9-23.2 ms with them mounted, 20.0 ms with the popover taken out.
Assumed: the row renders a plain button, and the first `pointerdown` on it mounts `tree/row-menu-surface` - the menu, the popover and the picker trigger - in its place, already open. The surface is a tsup entry of its own, dynamically imported, and `ignore`d in both the `./shell` and the `./tree + ./view` size-limit entries, the ASM-063 shape.
Why: nothing a row has not been asked for should be on the screen or on the wire; the press that opens the menu is early enough to build it, and the same deferral is what keeps the frame inside docs/10 section 5.
Cheap to reverse: yes

## ASM-128 · P3-T02 · 2026-08-26
Question: the icon picker was `shell/IconPicker` because `PageTitle` was the only thing that opened one. The row menu opens the same picker, and `./tree` may not import from `./shell` (docs/02 section 2).
Assumed: `IconPicker` and its lazy `icon-picker-grid` chunk move to `tree/`, and the shell imports them from there.
Why: the boundary rule allows shell to import tree and not the other way round, so the shared surface belongs on the lower layer; the alternative was a second copy of frimousse behind a second chunk.
Cheap to reverse: yes

## ASM-127 · P3-T02 · 2026-08-26
Question: docs/07 section 5 rejects an empty title by shaking the field. docs/06 section 14 turns animation off under `prefers-reduced-motion`.
Assumed: the shake is `element.animate()` rather than a class and a keyframe - one call, guarded on `matchMedia('(prefers-reduced-motion: reduce)')` and on `animate` existing at all, with `aria-invalid` carrying the same news to a screen reader either way.
Why: a CSS class has to be added, removed on `animationend` and re-added for a second attempt; the Web Animations call is the whole feature and cannot be left stuck on.
Cheap to reverse: yes

## ASM-126 · P3-T02 · 2026-08-26
Question: docs/06 section 5 lists the row menu's items; D-05 says structural writes are unavailable while the provider is unreachable. Which items does that take?
Assumed: Add inside, Rename and Change icon are disabled with the offline reason above them; Copy link stays live, because a link is the host's own URL and needs no provider. The row's `+` and `Cmd+Shift+Right` are gated the same way.
Why: D-05 is about writes reaching a provider that is not there; a link is computed locally, and disabling it would be an outage the reader did not have.
Cheap to reverse: yes

## ASM-125 · P3-T02 · 2026-08-26
Question: docs/06 section 5's row menu has Move to and Delete, and P3-T03 and P3-T04 are what build them.
Assumed: the two items are absent until their tasks land, not present and disabled.
Why: a disabled item with no reason attached reads as a broken feature; an item that appears with its task reads as a feature arriving. The menu's shape is asserted by `rename.spec.ts` per item, so nothing silently stays missing.
Cheap to reverse: yes

## ASM-124 · P3-T02 · 2026-08-26
Question: docs/07 section 5 says an empty title is refused and the field stays open. What happens when the field is empty and the user clicks away instead of pressing Enter?
Assumed: the rename is abandoned and the row keeps the title it had; only Enter on an empty field shakes.
Why: refusing a blur has nowhere to put the focus back except the field the user just left, which traps them in a row they were leaving; the title is unchanged either way.
Cheap to reverse: yes

## ASM-123 · P3-T01 · 2026-08-26
Question: a page created here opens on a temporary id, and the file the provider writes carries `title: Untitled`. Should the title field open on that word?
Assumed: no. The optimistic row and the created file both say "Untitled", but the title field opens empty, on its placeholder.
Why: docs/01 section 5.3 opens the page "with the title focused" so the first keystroke names it; a field pre-filled with `Untitled` would make that keystroke append to a word the user has to delete first.
Cheap to reverse: yes

## ASM-122 · P3-T01 · 2026-08-26
Question: `Cmd+Alt+N` and the palette create a page inside the page that is open (docs/01 section 5.3), and a row with no children yet is collapsed by definition. Where does the new row become visible?
Assumed: `createPage` in `DocsShell` expands the parent row before it mutates, so every entry point that creates a child - the row `+`, `Cmd+Shift+Right`, `Cmd+Alt+N`, the palette - opens the row it went into.
Why: docs/01 section 5.3 says the row appears optimistically; a row inside a collapsed parent appears nowhere, and the tree only renders what is expanded.
Cheap to reverse: yes

## ASM-121 · P3-T01 · 2026-08-26
Question: a title typed before the provider answered has no id to be saved under.
Assumed: `PageTitle` holds it in a ref and commits it from an effect the moment the real id lands; the debounce timer fires through the `latest` ref, so a keystroke and its commit can be on either side of the swap.
Why: docs/03 section 4.7 makes the first title the rename, and it must be the title the user actually typed - dropping it, or sending it under a temporary id, both lose the rename.
Cheap to reverse: yes

## ASM-120 · P3-T01 · 2026-08-26
Question: docs/09 P3-T01 lists "palette action and `Shift+Enter`" as two entry points, and P2-T12 wired both to the same call, which passed the palette's query as the title.
Assumed: the action row creates an untitled page; only `Shift+Enter` carries the query.
Why: docs/07 section 2 defines `Shift+Enter` as the one that "creates a page titled with the query"; the action row is reached by typing its own name, so passing the query there names pages "New page".
Cheap to reverse: yes

## ASM-119 · P3-T01 · 2026-08-26
Question: where does the navigation to a new page belong - in `useCreatePage` or in the callers that have the parent id?
Assumed: in the mutation. `onMutate` patches the cache and navigates in the same tick; `onSuccess` replaces the temporary id with `{ replace: true }`; `onError` returns to the page the user came from.
Why: `onMutate` is async (it awaits `cancelQueries`), so a caller that navigated first would put the shell on an id the tree does not hold yet and paint "This page no longer exists" on the way in.
Cheap to reverse: no - every entry point would have to repeat the ordering.

## ASM-118 · P3-T01 · 2026-08-26
Question: the temporary id has to survive being replaced without remounting the editor (docs/04 section 4), and two things are keyed on the page id: `ShellContent`'s `<PageCanvas key>` and `usePlateEditor`'s dependency array.
Assumed: `canvasKey(ns, id)` returns the id the page was created under for as long as the session lasts, and both places key on that instead of on the page id.
Why: a React key alone would not have been enough - `usePlateEditor` rebuilds the editor from its deps, which would have thrown away the undo history and the caret without unmounting anything.
Cheap to reverse: yes

## ASM-117 · P3-T01 · 2026-08-26
Question: where does the fresh-page flag live - React state, the zustand session store, or a module-level map?
Assumed: a module-level map keyed by namespace (`data/fresh.ts`), holding the alias, the provider's id and whether the title has landed.
Why: every reader asks inside a callback or inside a render that another change already scheduled; a store would re-render the whole shell on the very swap this exists to make invisible.
Cheap to reverse: yes

Format:

```
## ASM-001 · <TASK-ID> · <date>
Question: <the ambiguity, one line>
Assumed: <the choice>
Why: <one line>
Cheap to reverse: yes | no
```

---

## ASM-116 · Gate 2 · 2026-08-26
Question: the gutter controls (`+`, drag handle) are `opacity-0` until the block is hovered, and were also in the tab order - so `Tab` out of a paragraph landed on an invisible button, twice per block.
Assumed: `tabIndex={-1}` on both. They stay pointer affordances; `Enter` opens a block below and docs/07 section 3 moves one with `Cmd+Shift+Up/Down`, so no function is keyboard-only reachable through them.
Why: the alternative - revealing them on focus - puts two stops per block between a writer and the next real control, on a page that can have hundreds.
Cheap to reverse: yes

## ASM-115 · Gate 2 · 2026-08-26
Question: docs/06 section 7 puts a `FileText` icon on an internal link that resolves to a page, without saying whether the editor draws one too.
Assumed: it does. `DocumentEditor` now takes `rootId` and resolves links against the same tree index the read view uses, and `LinkElement` draws the icon inside a `contentEditable={false}` span.
Why: docs/05 section 8 - an icon that appears only in read mode moves every word after it on the way into edit mode. `edit-mode.spec.ts` asserts the link's box is identical in both modes and that a click on the icon still resolves to a caret position.
Cheap to reverse: yes

## ASM-114 · Gate 2 · 2026-08-26
Question: docs/10 section 2 wants every field named; the editable and the block clipboard have no strings in docs/03's map.
Assumed: two new keys, `editor.body` ("Page content") and `editor.blockClipboard` ("Selected blocks"), added to `defaultStrings`.
Why: the strings map is the module's only translation surface; hard-coded English in a component cannot be overridden by a host.
Cheap to reverse: yes

## ASM-113 · Gate 2 · 2026-08-26
Question: the "Add icon" affordance only exists in edit mode, and docs/06 section 7 does not say where it sits.
Assumed: out of flow, in the padding above the title (`absolute bottom-full`), rather than as a block above it.
Why: docs/05 section 8 - in flow it pushed the whole page down 38 px on the way into edit mode. A page that already has an icon shows the icon in flow, as before.
Cheap to reverse: yes

## ASM-112 · Gate 2 · 2026-08-26
Question: shadcn's small buttons ask for `rounded-[min(var(--radius-md),12px)]`, but `--radius-md` is declared `@theme inline` - substituted into the utilities this sheet generates, never emitted as a property - so the `var()` resolved to nothing and every small button came out square.
Assumed: `.docs-root` declares `--radius-sm/md/lg/xl` as real custom properties alongside the theme values, duplicating the scale.
Why: docs/06 section 6 asks for rounded controls; the alternative is editing 25 vendored registry files to spell the radius out (against docs/11 section 5). `edit-mode.spec.ts` asserts a non-zero radius so a future token rename fails loudly.
Cheap to reverse: yes

## ASM-111 · P2-T14 · 2026-08-26
Question: a page that fails mid-loop tells the reader nothing about the other 29.
Assumed: every page is attempted, failures are collected with their file name, and the test asserts the whole list at the end - a per-step timeout (10 s) keeps a hung page from eating the budget.
Why: 30 pages are 30 answers; the first failure is not the report.
Cheap to reverse: yes

## ASM-110 · P2-T14 · 2026-08-26
Question: which line of each corpus page the test should type into.
Assumed: the longest run of a line that reaches the DOM as one piece (marks split a line into several nodes), 8-70 characters, unique in the page, preferring a line with no marks at all; fences, toggles, tables, headings, images and links are skipped. The word goes at the end of the caret's visual line.
Why: the assertion is about the file, so the anchor only has to be findable and unambiguous; picking it from the source keeps all 30 pages on one code path instead of a hand-written table.
Cheap to reverse: yes

## ASM-109 · P2-T14 · 2026-08-26
Question: docs/09 P2-T14 asks for "one word" of diff per page, but the first save of a corpus page also stamps `id` into frontmatter (DEV-002).
Assumed: the id line is not part of the diff. `withoutId` strips it from both sides before comparing, and the draft test asserts the stamp itself once, so the behavior is still covered.
Why: the id write is required by docs/03 section 4.2; folding it into "one word" would either hide it or fail 30 pages for one documented byte.
Cheap to reverse: yes

## ASM-108 · P2-T13 · 2026-08-26
Question: docs/03 section 10 wants an optional provider method present exactly when its flag is on, and the file-store provider now has `uploadAsset`; a writable store can always take one.
Assumed: `capabilities.upload` is `!store.readOnly`, and `uploadAsset` is attached to the provider only when that flag survives the `capabilities` override - the same shape `subscribe` already uses.
Why: a read-only store advertising an upload method would break the conformance invariant every caller trusts, and a host that overrides the flag off gets a provider with no method to call rather than one that rejects halfway through a write.
Cheap to reverse: yes

## ASM-107 · P2-T13 · 2026-08-26
Question: `@platejs/media` ships a `PlaceholderPlugin` with its own upload flow (`insertMedia`, `uploadConfig`, `UploadError`); docs/05 section 6 only asks for paste, drop and a picker.
Assumed: a small `docsUpload` plugin of our own - `onPaste`/`onDrop` handlers plus two transforms - and the image node carries the upload on transient props (`uploadId`, `uploadName`, `uploadFailed`).
Why: the placeholder plugin inserts a `placeholder` node type the codec has no rule for, so an interrupted upload or an unlucky autosave would write a block the file cannot represent; transient props on the image node the codec already knows cost ~1.5 kB and cannot leak into Markdown.
Cheap to reverse: yes

## ASM-106 · P2-T13 · 2026-08-26
Question: an image block exists before it has a URL - the slash item inserts it empty, and an upload fills it in later. What should a save that lands in between write?
Assumed: the codec drops every image whose `url` is `''` on the way out (`withoutPending`), and the transient upload props are cleared with `setNodes({ prop: null })` when the upload settles.
Why: docs/05 section 3 says the file is the source of truth, and `![]()` is a broken image nobody typed; the autosave is a debounce behind the caret, so this case is reached by doing nothing at all.
Cheap to reverse: yes

## ASM-105 · P2-T13 · 2026-08-26
Question: where does a pasted or dropped image go, and what does the block show while it is being written?
Assumed: paste inserts under the block the caret is in; a drop lands after the block under the pointer (`editor.api.findEventRange`), each file getting its own block; the block shows a dashed row with a spinner and the file name, `aria-live="polite"`, and a failed upload leaves the block asking for a URL with a `role="alert"` line under it.
Why: docs/05 section 6 asks for progress "where the picture will be" and a way back for a failure; keeping the writer's place is the one thing a failed upload must not cost them.
Cheap to reverse: yes

## ASM-104 · P2-T13 · 2026-08-26
Question: the multipart path of the http adapter cannot be exercised end to end - jsdom cannot send a `FormData` body through `fetch`, so the request hangs before msw ever sees it.
Assumed: that one test injects `fetch` and reads the request where it is made: the URL, the method, a `FormData` body carrying the file, and no content type of ours.
Why: the boundary is what the runtime adds, so "we set no content type" is the actual requirement, and it is the assertion that would catch the regression; the wire itself is covered by the OPFS e2e and by the handler tests.
Cheap to reverse: yes

## ASM-103 · P2-T12 · 2026-08-26
Question: `preloadEditor()` is fired and forgotten from the shell's idle preload and from every hover; docs/05 section 8 says nothing about what a load that fails should do.
Assumed: a failed import clears the cached promise so the next call tries again, and the three fire-and-forget callers swallow the rejection.
Why: the promise was cached rejected, so one failed fetch - the radio going off mid-import is the way it happens - left the visit unable to edit at all, and the unhandled rejection printed a `pageerror` the e2e console check rightly failed on. The read view is what stays up either way (docs/04 section 3.4), so there is nothing to report to the user; a click on Edit retries. The offline e2e now warms the chunk before it pulls the radio, because nothing here caches assets for a cold start offline.
Cheap to reverse: yes

## ASM-102 · P2-T12 · 2026-08-26
Question: the slash menu puts the caret back in the editor after it inserts a block, and the image block asks for its URL in a field of its own that takes the focus first (docs/05 section 6).
Assumed: an item can say it takes the caret itself (`ownsFocus`), and the image and the link say so.
Why: `InlineComboboxItem` calls `restoreFocus(editor)` after the click handler, which blurred the URL field a frame after it auto-focused - and an image with no URL removes itself on blur, so the block the user just asked for disappeared. The link item already opted out through `inline`; the image needs the same opt-out for a different reason, so the reason is now its own flag.
Cheap to reverse: yes

## ASM-101 · P2-T12 · 2026-08-26
Question: the plan names the fixture `rules/caption.md`; the corpus has `rules/image-caption.md`.
Assumed: the corpus wins.
Why: the fixture is a file that exists and the corpus manifest names it; the plan line is a reference to it, not a second file to create.
Cheap to reverse: yes

## ASM-100 · P2-T12 · 2026-08-26
Question: Plate types the image rule's `serialize` as returning an mdast `Image`, but a block image is a paragraph holding one image - which is what Plate's own image rule returns.
Assumed: build the paragraph and return it through `as unknown as MdImage`.
Why: the behaviour is what the serializer consumes, and the stock rule proves the shape; the alternative is to emit an inline `Image` at block level, which remark writes without the blank lines around it and the caption paragraph then glues onto the image line.
Cheap to reverse: yes

## ASM-099 · P2-T12 · 2026-08-26
Question: the caption field in the editor could always be visible, the way a placeholder line is, or only once there is something to show.
Assumed: it appears when the image has a caption or is selected.
Why: docs/05 section 8 asks read and edit to draw the same page; an always-on empty field is a line of type in edit that read does not have. Selecting the image is how a writer asks for the field, and `CaptionTextarea` focuses it from there.
Cheap to reverse: yes

## ASM-098 · P2-T12 · 2026-08-26
Question: Plate's stock image rule maps the mdast `alt` to the node's `caption`, and docs/05 section 5 makes the caption the italic paragraph after the image instead.
Assumed: `alt` and `caption` stay two separate properties on the node - `alt` is the Markdown alt text, `caption` is the italic paragraph - and the rule is overridden to keep them apart. The paragraph is folded into the node on read (`remarkCaptions`, top level only) and unfolded again before serialization (`unfoldCaptions`).
Why: the two carry different text and either would otherwise overwrite the other on a round trip; a caption also has to survive being inside a toggle, which only a value pass ordered before `foldToggles` can do. Top level only, because a caption in a list item or a table cell is not the shape docs/05 section 5 pins.
Cheap to reverse: no - the node shape is what the editor and both renderers read.

## ASM-097 · P2-T11 · 2026-08-26
Question: `packages/react/src/styles/styles.css` compiles the fallback sheet from `@source '../**/*.tsx'`, but `lib/block-styles.ts` - the one place both renderers take their block classes from - is a `.ts` file.
Assumed: widen the glob to `'../**/*.{ts,tsx}'`.
Why: the built sheet only carried those classes because the Tailwind CLI also scans the package directory it runs in; anything compiling this sheet from a different base (the playground's Vite plugin, and any host that does the same) dropped every one of them, which is why `h1` measured 16 px in both modes in the dev server. The glob is the source of truth for what the sheet is compiled from, so it has to name the files the classes are actually in.
Cheap to reverse: yes

## ASM-096 · P2-T11 · 2026-08-26
Question: docs/05 section 7 asks the read view to fold a toggle, but a static render has no editor to keep the open set in.
Assumed: `DocumentView` holds the open set as React state keyed by the block's index in the top-level value, and hides a block by rendering nothing for it.
Why: the value is the only identity a static render shares with its own previous render - `id` is not on every block of every page - and filtering the value instead would shift the indices of the blocks after a folded one, which is the key itself. State resets derived from the value (`folds.value === value`) rather than an effect, so a page change cannot show one stale frame.
Cheap to reverse: yes

## ASM-095 · P2-T11 · 2026-08-26
Question: docs/07 section 2 gives `Tab` to indent, and docs/05 section 5 makes indenting under a toggle what puts a block inside it - but a closed toggle hides what it holds, caret and all.
Assumed: `Tab` opens every toggle enclosing the block it just moved, through an `overrideEditor` on the shared `tab` transform.
Why: Plate's own turn-into button does the same thing (`openNextToggles`) for the same reason, and a hidden block is not just invisible - typing into one reverses the characters, so the alternative is corrupt bytes. Overriding the transform covers every path that indents, not the one key this was found through.
Cheap to reverse: yes

## ASM-094 · P2-T11 · 2026-08-26
Question: DEV-012 made the palette cut a precondition for any further shell growth, and P2-T11's strings took the entry past its 105 kB cap.
Assumed: split the palette into its own tsup entry (`shell/command-palette`) behind `React.lazy`, keep `CommandPalette` as the wrapper that mounts it, and weigh the chunk under the `ignore` rule ASM-063 set for the editor and the icon picker.
Why: nothing renders the palette until a key is pressed, so it is the cheapest of the three cuts DEV-012 lists, and it is the only one whose surface is a single component. The wrapper keeps the dialog mounted once loaded so closing still runs its own animation.
Cheap to reverse: yes

## ASM-093 · P2-T10 · 2026-08-26
Question: docs/05 section 5 names the five alert variants but not what happens to `> [!NOTE] text`, where the marker shares its line with prose.
Assumed: only a marker that owns its line makes a callout; anything else stays a blockquote and keeps its bytes.
Why: that is what GitHub renders, and remark-gfm does not parse alerts at all, so the codec is the only judge - a looser rule would silently eat the words after the marker on a blockquote that was never an alert.
Cheap to reverse: yes

## ASM-092 · P2-T10 · 2026-08-26
Question: the variant list is two halves - core owns the mdast marker and the `icon` string, `@/lib` owns the Lucide icon, the tint and the label - and docs/02 section 2 forbids `react-lib` from importing `@docs/core`.
Assumed: `lib/callout.ts` carries the presentation half with its own `note` fallback, and the two halves are checked against each other in `editor/ui/callout-node.tsx` by `const VARIANTS: Record<CalloutVariant, CalloutStyle> = CALLOUT_VARIANTS`.
Why: keeps the leaf layer a leaf while still failing the build the day core learns a sixth variant this file cannot draw.
Cheap to reverse: yes

## ASM-091 · P2-T10 · 2026-08-26
Question: the stock Plate callout carries an author-picked emoji in `icon`, and a GFM alert has nowhere to put one.
Assumed: the icon button picks the variant instead, `icon` is written from `CALLOUT_ICONS` as the variant's Lucide name, and an emoji already in the value is dropped on save.
Why: docs/05 section 2 makes Markdown the document; a control that edits something the file cannot hold is a control that loses the user's work at the next save. docs/05 section 5 also pins IMPORTANT to `megaphone`, so the stock `MessageSquareWarning` goes with it.
Cheap to reverse: yes

## ASM-090 · P2-T09 · 2026-08-26
Question: docs/04 section 5 has a tree event invalidate "the tree", and the tree query is keyed per `rootId`.
Assumed: a tree event invalidates the `[ns, 'tree']` prefix, so every root a host has mounted refetches.
Why: the event says the storage changed, not which subtree; a scoped host and an unscoped one can be mounted at once (docs/04 section 7) and both are stale. Query dedupes the refetch of anything that is not mounted.
Cheap to reverse: yes

## ASM-089 · P2-T09 · 2026-08-26
Question: echo suppression needs the version the session last wrote, which lived only inside the session's own ref.
Assumed: `lastSavedVersion` is part of `SessionState`, next to `lastSavedAt`, and `useProviderEvents` reads it from the namespace's store.
Why: the store is already the place where everything outside the editor reads a page's save state, so nothing new has to exist and nothing has to be cleaned up when a page closes.
Cheap to reverse: yes

## ASM-088 · P2-T08 · 2026-08-26
Question: docs/04 section 3.4 asks for buttons disabled with a tooltip, and a `disabled` button takes no focus and fires no pointer events.
Assumed: the gated controls carry `aria-disabled` and stay focusable; the title field is `readOnly`. Both keep their tooltip, on hover and on focus.
Why: a control the keyboard cannot reach is a reason nobody can read, and the reason is the whole point of the message. `readOnly` also leaves the title selectable and scrollable, which a reader offline still wants.
Cheap to reverse: yes

## ASM-087 · P2-T08 · 2026-08-26
Question: D-05 lists create, move, delete, rename and icon as structural, and only rename and icon exist so far.
Assumed: `useStructuralGate` in `data/online.ts` is the one place that answers it, and the title and icon are its first two callers; P3's tree writes use the same hook.
Why: one hook is smaller than the same `useOnline` comparison in six components and keeps the message identical everywhere. Content edits stay ungated - the draft store and the save retry already carry them (docs/04 section 3.4).
Cheap to reverse: yes

## ASM-086 · P2-T08 · 2026-08-26
Question: Query's default `networkMode` pauses every fetch while `navigator.onLine` is false, and a provider may be a directory on this machine.
Assumed: the module's own `QueryClient` sets `networkMode: 'offlineFirst'` for queries and mutations; the provider is what decides whether it is reachable.
Why: OPFS and memory workspaces work perfectly well with the radio off, and pausing their reads would blank the shell for no reason. A host that brings its own client keeps Query's default, so `ShellContent` also treats a paused read as "Not available offline" rather than leaving the skeleton up.
Cheap to reverse: yes

## ASM-085 · P2-T07 · 2026-08-26
Question: docs/06 section 7 wants the title saved "as you type" without naming an interval, and docs/03 gives `updateMeta` a `renameFile` flag.
Assumed: commit 600 ms after the last keystroke, and flush immediately on blur, on Enter and on unmount; `renameFile` is left off for now.
Why: 600 ms is the same debounce the draft store already uses, so a title and its body settle together; flushing on the three ways out of the field means no keystroke is lost to a navigation. `renameFile: true` on a page's first title belongs with `useCreatePage` (P3-T02) - turning it on now would rename every file on every keystroke pause.
Cheap to reverse: yes

## ASM-084 · P2-T07 · 2026-08-26
Question: the title field and the picker need strings docs/08 section 6 does not list.
Assumed: added `editor.title` ("Page title", the textarea's label) and `editor.iconLoading` ("Loading emoji…"), and changed the default of `editor.iconSearch` from "Search icons…" to "Search…".
Why: both tabs share one search box and one of them searches emoji, so "Search icons…" was wrong in half the picker; the keys follow the existing `editor.*` naming and a host overriding them needs no code change.
Cheap to reverse: yes

## ASM-083 · P2-T07 · 2026-08-26
Question: docs/07 section 9 asks for `role="gridcell"` cells in a `role="grid"`, and the icons tab has ~1600 of them.
Assumed: the grid is driven from the search box - it keeps focus, owns the arrows and Enter, and points at the highlighted cell with `aria-activedescendant`; the cells are `tabIndex={-1}` and carry `aria-selected`.
Why: a roving tabindex over 1600 cells still needs the search box for anything but scrolling, and virtualization means the focused cell can be unmounted out from under the user. This is also how frimousse drives the emoji tab, so both tabs answer the same keys.
Cheap to reverse: yes

## ASM-082 · P2-T07 · 2026-08-26
Question: the picker pulls frimousse and `lucide-react/dynamic`, and docs/02 section 7 budgets `./shell` without them.
Assumed: the heavy half lives in `src/shell/icon-picker-grid.tsx`, which is a tsup entry, dynamically imported by the thin `IconPicker` export and added to the `./shell` `ignore` list in `.size-limit.json`.
Why: same mechanism as `./editor` (ASM-063) - only a tsup entry keeps a stable relative specifier after the build, and `size-limit`'s `ignore` is esbuild's `external`, which matches on that specifier. A non-entry module would be emitted as a hashed chunk that no `ignore` entry can name.
Cheap to reverse: yes

## ASM-081 · P2-T07 · 2026-08-26
Question: frimousse fetches its emoji data from jsdelivr at mount, and D-05 says the module works offline.
Assumed: keep the default CDN and ship no emoji data; offline, the emoji tab shows its loading state and the icons tab (bundled) still works.
Why: emojibase is ~1 MB per locale - bundling it to make one tab work offline costs every host the download. D-05 covers reading and editing pages, which no fetch here touches. The e2e stubs the route with a trimmed fixture so the suite neither hits the network nor trips `quietConsole` on frimousse's `console.error`.
Cheap to reverse: no

## ASM-080 · P2-T06 · 2026-08-26
Question: docs/07 section 7 gives the editor's first `Escape` to the block selection and the second to leaving edit mode, but the shell's `Escape` hotkey ran in every scope and took the first one.
Assumed: the shell's edit-mode `Escape` keeps the default scopes (global, tree, content), so inside the editable and inside a text input it does not fire; `PageCanvas` still takes the press that has a block selection up.
Why: docs/07 section 1 is what scopes are for - `Esc` inside the editor belongs to the editor. Elsewhere in the shell there is no block to select, so leaving edit mode is still the only sensible answer.
Cheap to reverse: yes

## ASM-079 · P2-T06 · 2026-08-26
Question: docs/06 section 7 hangs the gutter controls in the page's left margin, and docs/06 section 4 shrinks that margin to `px-4` below 768 px - less than the two 24 px controls need.
Assumed: the gutter is not drawn below 768 px (`max-md:hidden`), and the editable is `overflow-x-visible` above it so the controls are not clipped.
Why: the alternative is a page that scrolls sideways on a phone, which docs/06 section 13 calls a defect. Every gutter action has a keyboard or slash-menu route (docs/07 section 2), and the HTML5 drag backend has nothing to offer a touch pointer anyway. The editable clips nothing of its own: every wide block (code, tables) carries its own `overflow-x-auto`.
Cheap to reverse: yes

## ASM-078 · P2-T06 · 2026-08-26
Question: `@platejs/selection` and `@platejs/dnd` address a block by its `id`, and a page parsed from Markdown has none - so nothing was selectable or draggable.
Assumed: `NodeIdPlugin` in the editor kit with `initialValueIds: 'always'`, which stamps an id on every block of a parsed page.
Why: the ids live in the editor's value only - the codec neither reads nor writes them, so no page's bytes change (D-02). `'if-needed'`, the default, only fills gaps in a value that already has ids, which a parsed page never does.
Cheap to reverse: yes

## ASM-077 · P2-T05 · 2026-08-26
Question: the slash menu's popover is an Ariakit `Portal`, which mounts on `document.body` - outside `.docs-root`, where none of the module's variables reach (docs/11 section 4).
Assumed: it renders into `portalRoot()`, the same container every Radix portal in `ui/` uses.
Why: without it the menu paints as bare text with a black border over the page, which the 1440 and 390 screenshots of docs/06 section 12 showed in both themes; the container already exists for exactly this reason.
Cheap to reverse: yes

## ASM-076 · P2-T05 · 2026-08-26
Question: choosing a block with the mouse leaves the editor with no DOM focus at all from the second slash command of a session onwards - the combobox input is removed while Slate still believes the editor is focused, so `tf.focus()` returns early and the next keystroke goes to `<body>`.
Assumed: `InlineComboboxItem` prevents the default on `mousedown` and, after the item's transform, calls `tf.blur()` then `tf.focus()` on a macrotask.
Why: `blur` is what corrects Slate's stale focus flag, and going back in through `tf.focus()` (rather than `element.focus()`) restores the DOM selection the transform left, so the first character typed lands in the new block.
Cheap to reverse: yes

## ASM-075 · P2-T05 · 2026-08-26
Question: docs/05 section 2 puts a block in the slash menu; `@plate/transforms`'s stock `insertBlock` inserts at the selection and clears the old block with `removeNodes({ previousEmptyBlock: true })`.
Assumed: every block is inserted at `PathApi.next(path)` and the empty block left behind is removed by the path it started at, guarded by a node identity check.
Why: inserting at the selection splits the block the caret lives in, and `previousEmptyBlock` reads from wherever the caret ended up - a table parks it in a cell, where the paragraph above is not a sibling, so a stray empty block was left over the table.
Cheap to reverse: yes

## ASM-074 · P2-T05 · 2026-08-26
Question: the image entry in the stock slash menu calls `insertMedia`, which asks for the URL through `window.prompt`.
Assumed: it inserts an empty `img` block instead, and `ImageElement` asks for the URL in the block itself (docs/05 section 6).
Why: a native prompt is unstyleable, untranslatable through `strings` (docs/08 section 3) and unreachable in the e2e; the block already has to handle an empty `url` for a page that arrives with one.
Cheap to reverse: yes

## ASM-073 · P2-T05 · 2026-08-26
Question: an autosave can catch a page while the slash menu is open, and `slash_input` is a void node with no serialization rule - `@platejs/markdown` warns `Unreachable code: {"type":"slash_input"}` to a console that docs/10 section 4 requires to stay clean.
Assumed: the base kit serializes `slash_input` to empty text.
Why: the query lives in the menu's own DOM input, never in the value, so there is nothing to write; the alternative is suppressing the save while a menu is up, which loses keystrokes.
Cheap to reverse: yes

## ASM-072 · P2-T05 · 2026-08-26
Question: Plate's exit-break binds `Cmd+Enter` to "insert a block after this one", and docs/07 section 2 gives `Cmd+Enter` to the to-do checkbox.
Assumed: docs/07 wins - exit-break keeps `Cmd+Shift+Enter` (insert before) and loses `Cmd+Enter`.
Why: the shortcut table is the contract a reader learns; the block-after behaviour is one `Enter` away at the end of a block.
Cheap to reverse: yes

## ASM-071 · P2-T05 · 2026-08-26
Question: docs/06 section 13 wants every control to carry an accessible name, and Radix draws the mark buttons as `role="radio"` toggle items whose only content is an icon.
Assumed: `withTooltip` passes its string tooltip through as `aria-label` unless the caller gave a better one, and the floating toolbar itself is labelled `Formatting`.
Why: the tooltip is already the name a sighted user reads, so it is the one a screen reader should read; without it the mark buttons had no accessible name at all, which the e2e now locates them by.
Cheap to reverse: yes

## ASM-070 · P2-T05 · 2026-08-26
Question: docs/05 section 6 keeps a trailing empty paragraph under the last block, and Plate marks an empty paragraph with a zero-width space so Markdown can carry it.
Assumed: the codec strips trailing empty paragraphs before serializing and marks only top-level blank paragraphs.
Why: without the strip, every save of a page ending in a heading or a table grows a `\u200b` line; with the marker applied everywhere, an empty table cell - a paragraph too - is rewritten to `| \u200b |`, which is bytes the user never touched (D-02).
Cheap to reverse: yes

## ASM-069 · P2-T05 · 2026-08-26
Question: `blocks.spec.ts` has to read back the Markdown a block saved, but page creation and any download UI are P3 work, so a test has nowhere to write.
Assumed: the spec seeds `workspace/blocks.md` straight into OPFS before the app opens, and reads the bytes back out of OPFS after leaving edit mode.
Why: bytes on disk are the only assertion that covers the codec, the autosave and the transform together; the alternative asserts the editor's own value, which is what the unit tests already do.
Cheap to reverse: yes

## ASM-068 · P2-T04 · 2026-08-26
Question: docs/05 section 6 makes a page over 5,000 blocks open read-only behind the large-page banner, but the guard itself is P4-T04's task, not T04's.
Assumed: the guard ships with its banner - `PageCanvas` counts top-level blocks and withholds the editor until "Edit anyway" - so the banner is never dead UI; P4-T04 keeps the 5k fixture, the e2e and the budget check.
Why: a banner whose only button lifts a guard that does not exist would have to be written twice and reviewed on a screenshot that lies.
Cheap to reverse: yes

## ASM-067 · P2-T04 · 2026-08-26
Question: docs/05 section 4 names fidelity reasons in mdast terms (`html`, `footnoteDefinition`, `unknown_node:<type>`); docs/06 section 10 renders them in a sentence.
Assumed: seven `reason.*` strings translate the known tokens ("raw HTML", "footnotes", ...), `reason.unknown` covers `unknown_node:<type>`, and an unknown token falls back to itself rather than being dropped.
Why: every user-facing string is overridable through `strings` (docs/08 section 3), and a reason the reader cannot parse is worse than a raw node type.
Cheap to reverse: yes

## ASM-066 · P2-T04 · 2026-08-26
Question: docs/06 section 9 gives the offline state a tooltip but no click action, which would leave that tooltip out of reach of the keyboard.
Assumed: the offline pill is a button whose click saves now, like the error pill; only `Saving…` renders as plain text, since there is nothing to do about it.
Why: an unreachable tooltip is an a11y defect (docs/07 section 9), and "retry now" is what the reader wants when they see the retry time.
Cheap to reverse: yes

## ASM-065 · P2-T03 · 2026-08-26
Question: docs/04 section 3.1 puts the draft's serialization in `requestIdleCallback` with "fallback `setTimeout 0`", and the module's existing `requestIdle` helper (written for the editor preload) had neither a deadline nor a per-caller delay.
Assumed: `requestIdle(run, timeoutMs)` now passes `{ timeout: timeoutMs }` to `requestIdleCallback` and uses `timeoutMs` for the fallback; the draft calls it with `0`, the preload keeps `200`.
Why: a draft is the copy of the user's work that survives a killed tab, so it may not wait on an idle period that a busy tab never gives; `{ timeout: 0 }` is the spec's own "no deadline" and matches "in `requestIdleCallback`", while the fallback delay is what docs/04 asks for literally. The tests drive the fallback path: jsdom's stand-in is not on the fake clock and takes a number where the DOM takes an options object.
Cheap to reverse: yes

## ASM-064 · P2-T03 · 2026-08-26
Question: docs/04 section 3 sketches `DocumentSession` and names four session fields (`status`, `lastSavedAt`, `retryAt`, `draftRestored`), but the banners and the status pill of docs/06 sections 9-10 need three more facts, and docs/08 section 5 says the session owns the editor ref without saying how it gets one.
Assumed: `SessionState` also carries `draftMismatch`, `draftAt` and `pending`, and `DocumentSession` gains one method, `bind(editor)`.
Why: `draftMismatch` is the only way to tell the "This page changed since your unsaved edits" banner from the restored-draft one (docs/04 section 3.3 defines both, the state sketch names neither); `draftAt` is the "<relative time>" both banners print; `pending` separates "dirty with a timer running", which docs/06 section 9 renders as nothing, from "dirty and paused", which it renders as a button. `bind` is `DocumentEditor`'s `onReady` handed on - the session needs `editor.tf.setValue` for conflict Reload, draft Discard and a silent refresh, and the shell already holds that instance for its own caret work. Nothing was dropped: every field of the sketch is still there.
Cheap to reverse: yes

## ASM-063 · P2-T02 · 2026-08-26
Question: docs/02 line 168 requires `./shell` to be measured without the editor chunk, and offers the Tailwind host's Vite report as the fallback "if the tool counts dynamic chunks" - which `size-limit` does.
Assumed: the entry keeps `size-limit` and lists the dynamic specifier `./editor/index.js` in `ignore`, which esbuild takes as `external` and so leaves out of the bundle it weighs; the Vite fallback is not needed.
Why: `ignore` is the same mechanism docs/02 section 7 already prescribes for third-party packages and DEV-010 uses for `lucide-react/dynamic`, it keeps one tool and one number for every entry, and the editor chunk stays budgeted on its own at `./editor`. The root entry `.` gets the same line, for the same import.
Cheap to reverse: yes

## ASM-062 · P2-T02 · 2026-08-26
Question: docs/09 P2-T02 names the end-to-end spec `mode.spec.ts`, but `apps/playground/e2e/modes.spec.ts` already exists for the workspace modes (OPFS, file-system access, demo).
Assumed: the file is `edit-mode.spec.ts`.
Why: two specs one letter apart, about unrelated meanings of "mode", is a trap for every later reader and for `-g` filters; the name says which mode it covers.
Cheap to reverse: yes

## ASM-061 · P2-T01 · 2026-08-26
Question: the copied `media-image-node` renders a caption textarea, but the read view (docs/06 section 7) draws no caption at all.
Assumed: the editor's image node drops the caption UI for now; `CaptionPlugin` stays in the kit so the data survives a round-trip, and the caption is designed in P2-T12.
Why: `caption` currently holds the Markdown alt text, so an editable textarea would show alt text as a visible caption in edit mode and nothing in read mode - the visual jump docs/05 section 8 forbids.
Cheap to reverse: yes

## ASM-060 · P2-T01 · 2026-08-26
Question: docs/11 section 6 asks for `eslint-plugin-react-hooks`, whose v7 `recommended-latest` config is mostly the React Compiler's adoption lint.
Assumed: wire the plugin in with `rules-of-hooks` and `exhaustive-deps` as errors, and leave the compiler rules off.
Why: the compiler rules flag 16 items in shipped, tested P1 code (`preserve-manual-memoization`, `set-state-in-effect`); adopting the compiler is its own task with its own gate, and docs/11 asks for the rules of hooks, not for that migration.
Cheap to reverse: yes

## ASM-059 · P2-T01 · 2026-08-26
Question: `DocumentEditor`'s `toolbar` prop (docs/08 section 5) accepts `'fixed'`, but docs/06 has no design for a fixed toolbar.
Assumed: `'floating'` and `'fixed'` both mount the floating toolbar for now; only `'none'` changes the kit, by dropping it. The prop is honoured for real in P2-T05.
Why: the alternative is a toolbar with no spec, which would have to be redrawn once docs/06 defines one; dropping the value from the type would break the public prop docs/08 pins.
Cheap to reverse: yes

## ASM-058 · P1-T13 · 2026-08-26
Question: docs/09 P1-T13 asks for a Lighthouse a11y run script, but `lighthouse` is not in docs/11's dev-dependency list and no gate runs it.
Assumed: `scripts/lighthouse-a11y.ts` shells out to `npx -y lighthouse@12` instead of adding the package; the score is captured for the phase report, and `@axe-core/playwright` stays the gate.
Why: docs/11 section 1 is a locked tooling contract, and a report-only tool that drags in its own Chrome does not belong in every install; the number it produces is identical either way.
Cheap to reverse: yes

## ASM-057 · P1-T12 · 2026-08-25
Question: docs/07 section 4 says a "Search in content" row "runs `provider.search` after 250 ms debounce", which reads both as a row the reader picks and as an automatic run.
Assumed: the search runs on its own once the query stops changing for 250 ms and is two characters long; the row is what the group shows while that is in flight, and the way to retry a failed one.
Why: a palette that already knows the query should not ask twice for it; the row still exists for the two states that need a control.
Cheap to reverse: yes

## ASM-056 · P1-T12 · 2026-08-25
Question: the palette's Switch theme action has to name a theme, but the host owns the theme and the module is never told which one is on.
Assumed: the action reads `.dark` on `<html>` - the class docs/06 section 2 has the host apply - and calls `onThemeChange` with the other one.
Why: the only honest source for "which theme is on" inside a module that does not own it is what the page is currently painted with.
Cheap to reverse: yes

## ASM-055 · P1-T12 · 2026-08-25
Question: docs/09 P1-T12 stubs page creation "with a toast", and every user-facing string has to live in `strings.ts` (docs/06 section 14).
Assumed: a `palette.createUnavailable` key carries the stub copy ("Creating pages is not available yet"), and P3-T01 deletes the key along with the stub.
Why: a hard-coded string would be the one line of copy a host cannot override, for the one behaviour that is temporary.
Cheap to reverse: yes

## ASM-054 · P1-T12 · 2026-08-25
Question: docs/07 section 1 scopes the global shortcuts to "inside `.docs-root`", which says nothing about a keystroke that arrives with nothing focused, or about two shells on one page.
Assumed: a shortcut fires when the event target is inside this shell's root, or when nothing is focused and the target is the body. Two shells on a page both answer the body case.
Why: with no focus there is no shell to attribute the keystroke to, and the alternative - the first shell wins - is arbitrary in the other direction.
Cheap to reverse: yes

## ASM-053 · P1-T12 · 2026-08-25
Question: docs/07 section 2 writes the global shortcuts as `Cmd+...`, and `formatKeys` renders `Ctrl+...` off macOS, but nothing says which modifier the matcher accepts where.
Assumed: `Mod` matches Cmd or Ctrl on every platform, matching the vendored `SidebarProvider` that already binds `Cmd+\` that way; only the glyphs are platform-specific.
Why: one shell answering `Cmd+P` and `Ctrl+P` differently by platform would be a bug report from every reader on the wrong keyboard.
Cheap to reverse: yes

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
