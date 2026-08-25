# 07. Interactions, Shortcuts, States, Accessibility

`Cmd` means `mod` (Cmd on macOS, Ctrl elsewhere). Shortcuts are implemented with one small hotkey utility (`packages/react/src/data/hotkeys.ts`, ~60 LOC, no dependency) for shell scopes, and with Plate's `shortcuts` option inside the editor. No shortcut here collides with another scope that can be active at the same time, nor with browser-reserved keys (`Cmd+N`, `Cmd+T`, `Cmd+W`, `Cmd+Shift+N`, `Cmd+Q`).

## 1. Scopes

| Scope | Active when |
|---|---|
| global | anywhere inside `.docs-root`, unless a text input outside the editor has focus (rename input, title, search) |
| tree | focus inside `PageTree` |
| content | focus on the content region wrapper (`tabIndex=0`), read mode |
| editor | Plate editable focused |
| palette / dialogs | handled by cmdk and Radix |

## 2. Shortcut map

### Global
| Keys | Action |
|---|---|
| `Cmd+\` | Toggle sidebar |
| `Cmd+P` | Command palette |
| `Cmd+K` | Command palette when the editor is not focused (inside the editor `Cmd+K` is Link) |
| `Cmd+Alt+N` | New page (child of the open page, else root); opens in edit mode with the title focused |
| `Cmd+S` | Save now (flush); `preventDefault` always inside `.docs-root` |
| `Cmd+Shift+U` | Open parent page |
| `Cmd+Shift+E` | Toggle edit mode (works in every scope, including from the editor) |
| `Esc` | In edit mode with nothing open: back to read mode. In read mode: clears block selection or blurs |

### Tree (focus inside the tree, provided by headless-tree unless noted)
| Keys | Action |
|---|---|
| `↑` `↓` | Move focus between visible rows (roving tabindex) |
| `→` | Expand, or move to first child if already expanded |
| `←` | Collapse, or move to parent if collapsed |
| `Home` `End` | First / last visible row |
| `Enter` `Space` | Open the focused page |
| `F2` | Rename inline (own implementation) |
| `Delete` `Backspace` | Delete with confirmation dialog (own) |
| `Cmd+↑` `Cmd+↓` | Move page up/down among siblings (own; requires `move`) |
| `Cmd+Shift+→` | Add a page inside the focused page (own) |
| type-ahead | Jump to a row by typing its title prefix (headless-tree) |
| `Cmd+A` | No-op (never selects all rows) |

### Content region (read mode)
| Keys | Action |
|---|---|
| `E` or `Enter` | Enter edit mode, caret at the start of the first block |
| `Tab` | Standard focus order continues into links |

### Editor (Plate `shortcuts`; Notion mapping)
| Keys | Action |
|---|---|
| `Cmd+B` `Cmd+I` `Cmd+U` `Cmd+Shift+S` `Cmd+E` | Bold, italic, underline (if kept), strikethrough, inline code |
| `Cmd+K` | Link popover |
| `Cmd+Alt+0` | Turn into text |
| `Cmd+Alt+1` `2` `3` | Heading 1, 2, 3 |
| `Cmd+Alt+4` | To-do list |
| `Cmd+Alt+5` `6` | Bulleted, numbered list |
| `Cmd+Alt+7` | Toggle (if kept) |
| `Cmd+Alt+8` | Code block |
| `Cmd+Alt+9` | Callout (if kept) |
| `Cmd+Shift+.` | Blockquote |
| `Tab` `Shift+Tab` | Indent / outdent list items and toggle children |
| `Cmd+Enter` | Toggle checkbox in a to-do; open/close a toggle |
| `Cmd+Shift+↑` `Cmd+Shift+↓` | Move block up / down |
| `Cmd+D` | Duplicate block |
| `Cmd+A` | Select block text; second press selects all blocks |
| `Esc` | Collapse selection to block selection; second press exits edit mode |
| `Shift+Enter` | Soft line break |
| `/` | Slash menu (at block start or after a space) |
| `:` + 2 chars | Emoji combobox (P3 optional) |
| `Cmd+Z` `Cmd+Shift+Z` | Undo / redo |
| Markdown autoformat | see docs/05 section 6 |

Every shortcut also appears in a tooltip or menu hint using the platform glyphs (`⌘⌥N` on macOS, `Ctrl+Alt+N` elsewhere) through a `formatKeys()` helper.

## 3. Sidebar drag and drop (headless-tree DnD)

- Drag starts after 4 px of pointer movement on a row (not on its buttons). Touch: long-press 400 ms, disabled below 768 px in v1.
- Drop positions: before, after (insertion line), into (row highlight). "Into" activates in the middle 50% of the row height for rows that are pages; folders and pages both accept children.
- Auto-expand a collapsed target after 600 ms hover. Auto-scroll when within 32 px of the tree's top/bottom edge.
- Descendant guard: a node cannot drop into its own subtree; the cursor shows `not-allowed` and no indicator is drawn.
- `Esc` cancels. Drop calls `movePage(id, { parentId, index })` with optimistic patch; failure restores the previous position and shows a toast "Couldn't move '<title>'".
- Keyboard alternative: `Cmd+↑/↓` reorder, "Move to" dialog for reparenting.

## 4. Command palette behavior

- Opens with `Cmd+P` or `Cmd+K` (outside the editor), the Search row, or the header search icon on mobile.
- Empty input: Recent (up to 5), then Actions.
- With input: Pages filtered by title (cmdk fuzzy scoring over the full index; 5k titles are fine), plus matching Actions. If `capabilities.search`, a "Search in content" row runs `provider.search` after 250 ms debounce and lists hits with snippets under a Results group.
- `Enter` opens (read mode), `Cmd+Enter` opens in edit mode, `Shift+Enter` creates a page titled with the query when nothing matches and `write` is true.
- Selecting a page records it in Recents.

## 5. Inline rename and title edit

- Tree rename: `F2`, double-click on the title text, or menu Rename. Input replaces the title with the text selected. `Enter` commits, `Esc` cancels, blur commits. Empty title is rejected (input shakes 150 ms, stays open). Commit calls `updateMeta` optimistically.
- Page title: see docs/06 section 7. The tree row title updates optimistically as the user types (debounced 600 ms), so the sidebar and the canvas never disagree for longer than a moment. On a fresh page (created this session, empty body) the first commit passes `renameFile: true` so the file takes the title's slug; later commits never rename files (docs/03 §4.7).

## 6. Icon picker

- Triggers: page icon click, "Add icon" hover button, tree row menu Change icon, page menu Change icon.
- Emoji tab default. `Enter` on a highlighted cell selects; `Esc` closes. Search filters both tabs. Remove clears the icon. Selection calls `updateMeta({ icon })` optimistically and closes.

## 7. Mode transitions

| From | Trigger | To | Focus |
|---|---|---|---|
| read | click in content (pointer moved < 4 px between down and up, `window.getSelection().isCollapsed` true, target is not a link, checkbox, code copy button, or toggle chevron) | edit | caret at click point |
| read | `E` (focus anywhere inside the content region), `Enter` (only when the region wrapper itself is `document.activeElement`), Edit button, `Cmd+Shift+E` | edit | start of first block |
| read | click on title (write host) | edit | caret in title |
| edit | `Esc` (nothing open), Done, `Cmd+Shift+E` | read | content region wrapper |
| edit | navigation | read on the new page | content region wrapper |
| any | delete of the open page | read on parent/home | content region wrapper |

Entering edit mode calls `navigation.navigate({ pageId, mode: 'edit' }, { replace: true })` so the URL reflects the mode without polluting history; leaving does the same with `mode: 'read'`.

## 8. State matrix (component × state)

| Component | loading | empty | error | offline | read-only | conflict | lossy | draft |
|---|---|---|---|---|---|---|---|---|
| Sidebar tree | 8 skeleton rows | "No pages yet" | inline retry row | normal (cached) | no `+`, no menu items that write | normal | normal | normal |
| Header | breadcrumbs skeleton | hidden | hidden | status Offline | no Edit toggle | status Changed on disk | normal | status Restored draft |
| Canvas | title + 6 lines skeleton (only without cache) | empty page state | error card | cached content or Not available offline | read mode only | banner | banner before first edit | banner |
| Palette | Recent + Actions | "No results" | retry row for content search | title search only | no New page action | normal | normal | normal |
| Row actions | hidden | hidden | hidden | disabled with tooltip | hidden | normal | normal | normal |

## 9. Accessibility

- Landmarks: sidebar `nav[aria-label="Pages"]`, content region `section[role="region"][aria-label="Document"]` (never `main`: the host owns `main` and nested mains are invalid; the playground wraps the shell in `main`), header `div[role="toolbar"]` for the action group only (breadcrumbs are `nav[aria-label="Breadcrumb"]` with an ordered list).
- Tree: `role="tree"`, rows `role="treeitem"` with `aria-level`, `aria-expanded` (when expandable), `aria-selected` for the active page, roving tabindex; headless-tree's `AssistiveTreeDescription` kept. Row action buttons are real `<button>`s with `aria-label`s including the page title ("Add a page inside Auth").
- Live regions: `SaveStatus` container `aria-live="polite"`; conflict banner `role="alert"`; lossy and draft banners `role="status"`; a visually hidden `aria-live="polite"` region announces "Opened <title>" on page change.
- Dialogs and popovers: Radix handles focus trap, restore, and `Esc`. Menus open on `Enter`/`Space`/`↓` from their triggers.
- Resize handle: `role="separator"`, `aria-orientation="vertical"`, `aria-valuenow/min/max`, `←/→` adjust by 16 px, `Shift` by 64 px.
- Collapse button: `aria-expanded`, `aria-controls` pointing at the sidebar id.
- Editor: Plate semantics; toolbar `role="toolbar"` with arrow-key traversal; slash menu and palette expose listbox semantics through cmdk; visible focus rings from `--ring` on every control; the editable never shows an outline.
- Icon picker cells: `role="gridcell"` inside `role="grid"` (frimousse provides this for emoji; replicate for the Lucide grid).
- Color contrast: every text/background pair from the default theme meets WCAG AA; callout variant tints use 600 (light) and 400 (dark) shades.
- Reduced motion: docs/06 section 13.
- Touch: 44 px minimum targets below 768 px (rows keep 28 px visual height but the row's hit area extends to 44 px via padding on the sheet variant).
- Zoom: layout works at 200% browser zoom; nothing depends on `vh` for readability except the bottom padding.

## 10. Toasts

shadcn `sonner`-style toaster mounted once by `DocsShell` (hosts composing their own layout provide `onEvent` and render their own). Used only for: mutation failures, copy actions ("Copied link"), download, rename of files when enabled. Never for save success. Position bottom-right, 4 s, one at a time per key.
