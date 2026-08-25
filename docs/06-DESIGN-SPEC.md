# 06. Design Spec: Notion feel, shadcn default look

This document is the visual contract. Numbers are Tailwind utilities or pixel values. Every component lists its states. Claude Code screenshots each UI task at 1440x900 and 390x844, light and dark, and compares against this document before committing.

## 1. Principles

1. **Content is the interface.** Chrome is thin, muted, and appears on hover or focus. The page canvas is the only high-contrast area.
2. **Quiet by default.** No permanent status labels, no decorative borders, no shadows on static surfaces. Elevation is reserved for popovers, menus, dialogs.
3. **Precision over decoration.** The quality comes from spacing, alignment, type rhythm, and consistent hit targets, not from color or motion.
4. **Everything is a page.** One row style in the tree, one canvas style for every page, one icon language (Lucide + emoji).
5. **Inherit the host.** shadcn CSS variables, host font stack, host radius. The module never introduces its own palette.

## 2. Tokens

Consumed shadcn variables (read, never redefined outside `theme.css`): `--background`, `--foreground`, `--card`, `--popover`, `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`, and the sidebar set `--sidebar`, `--sidebar-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-border`, `--sidebar-ring`.

`theme.css` (opt-in) reproduces shadcn's current default theme (neutral base color, `--radius: 0.625rem`, OKLCH values copied from a fresh `npx shadcn@latest init` output at build time, light and `.dark`) scoped to `.docs-root`. Sidebar variables fall back to their page counterparts when the host does not define them:

```css
.docs-root { --docs-sidebar: var(--sidebar, var(--background)); /* same for the other five */ }
```

Module-private variables (prefixed `--docs-`, defined in `styles.css` on `.docs-root`):

| Variable | Default | Used by |
|---|---|---|
| `--docs-sidebar-width` | 240px | shell grid; updated by the resize handle |
| `--docs-sidebar-min` / `--docs-sidebar-max` | 200px / 480px | resize clamp |
| `--docs-header-height` | 44px | header, sticky offset |
| `--docs-content-width` | 700px | canvas column (`max(64px, 50% - 350px)` gutters, same as Plate UI's editor) |
| `--docs-row-height` | 28px | tree rows, palette rows |
| `--docs-indent` | 12px | tree indent per level |
| `--docs-gutter` | 28px | block handle column left of content |
| `--docs-motion` | 150ms | menu/popover fade; `0ms` under reduced motion |

## 3. Typography

Font: inherits `font-sans` from the host. Playground loads Inter (variable) with `font-feature-settings: "cv11", "ss01"` off (keep Inter default) and `-webkit-font-smoothing: antialiased`.

| Role | Classes | Notes |
|---|---|---|
| Page title | `text-[40px] leading-[1.2] font-bold tracking-[-0.01em]` | placeholder "Untitled" in `text-muted-foreground/40` |
| Body text | `text-base leading-[1.65]` (16 px) | block vertical padding `py-[3px]`, blocks separated by margin `mt-[1px]` |
| H1 in body | `text-[30px] leading-[1.3] font-bold mt-8 mb-1` | first block of the page: `mt-0` |
| H2 | `text-2xl leading-[1.3] font-semibold mt-6 mb-0.5` | |
| H3 | `text-xl leading-[1.3] font-semibold mt-4 mb-0.5` | |
| UI text (sidebar, header, menus) | `text-sm` (14 px), `leading-5` | |
| Meta text (status, hints, timestamps) | `text-xs text-muted-foreground` | |
| Inline code | `font-mono text-[85%] bg-muted rounded-[4px] px-[0.3em] py-[0.15em]` | no color change |
| Code block | `font-mono text-sm leading-6` on `bg-muted rounded-md` | |
| Palette items | `text-sm` | |

Line length: canvas column 700 px at 16 px gives ~85 characters, matching Notion.

Scrollbars: `scrollbar-width: thin; scrollbar-color: color-mix(in oklch, var(--foreground) 20%, transparent) transparent` on the sidebar and the content region; WebKit fallback `::-webkit-scrollbar { width: 8px }` with a rounded thumb. Text selection inside the canvas uses the host default; block selection uses `bg-primary/10`.

## 4. Layout geometry

```
┌──────────────┬───────────────────────────────────────────────────────────────┐
│ Sidebar      │ Header (44px, sticky)   ⋮ breadcrumbs        status · Edit · ⋯  │
│ 240px        ├───────────────────────────────────────────────────────────────┤
│              │                                                               │
│ ▾ 📘 Guides  │              [icon 40px]                                      │
│    Auth      │              Page title 40px                                   │
│    Billing   │                                                               │
│ ▸ 🧪 Specs   │              body … 700px column, gutters max(64px, 50%-350px) │
│              │                                                               │
│ + New page   │                                                               │
└──────────────┴───────────────────────────────────────────────────────────────┘
```

- Shell: CSS grid `grid-cols-[var(--docs-sidebar-width)_1fr]`; sidebar collapsed → `0px` with `transition: width 200ms ease-in-out` (`transform` for the mobile sheet).
- Content region scrolls independently (`overflow-y-auto`, `overscroll-contain`); sidebar scrolls independently; header sticky inside the content region.
- Canvas: title block `pt-20 md:pt-[88px]`, then content. Bottom padding `pb-[40vh]` so the last block can be scrolled to the middle (Notion does this).
- Below 768 px: sidebar becomes a sheet (shadcn `Sheet`, left side, 280 px), header condenses to menu button + icon + title + `⋯`, gutters `px-4`, title `text-[32px]`.

## 5. Sidebar

Surface: `bg-[var(--docs-sidebar)] text-[var(--docs-sidebar-foreground)]`, right border `border-r border-[var(--docs-sidebar-border)]`. No shadow.

**SidebarHeader** (`h-11 px-2 flex items-center justify-between`): workspace title (`text-sm font-medium truncate`, from `meta.title`, optional icon 16 px), right side: collapse button (`PanelLeftClose`, ghost, `size-7`) visible on hover of the sidebar, and New page (`SquarePen`, ghost, `size-7`, tooltip "New page ⌘⌥N") when `write`.

**SidebarNav** (`px-2 pt-1 pb-2 space-y-0.5`): rows "Search" (`Search` icon, opens palette, right-aligned kbd `⌘P` in `text-xs text-muted-foreground`) and "Home" (`House`). Same row style as tree rows.

**PageTree** rows (`h-7` = 28 px, `rounded-md`, `px-1`, `text-sm`, `gap-1`):
- Structure: `[chevron 20px][icon 20px][title flex-1 truncate][actions]`, indent `calc(var(--docs-indent) * depth) + 4px`.
- Chevron: `ChevronRight size-4 text-muted-foreground/70`, rotates 90° when expanded (`transition-transform 150ms`). Rendered for nodes with children or folders; invisible spacer otherwise. Chevron button hit area `size-5 rounded-sm hover:bg-black/8 dark:hover:bg-white/10`.
- Icon: emoji at `text-base` centered; Lucide `size-4`; default page icon `FileText size-4 text-muted-foreground/60`; folder without page `Folder`.
- Title: `text-[var(--docs-sidebar-foreground)]/85` default; active row `font-medium text-[var(--docs-sidebar-foreground)] bg-[var(--docs-sidebar-accent)]`; hover `bg-[var(--docs-sidebar-accent)]/70`; focus-visible `ring-2 ring-[var(--docs-sidebar-ring)] ring-inset`.
- Row actions (`opacity-0 group-hover:opacity-100 focus-within:opacity-100`): `Plus` (add child, tooltip "Add a page inside") and `Ellipsis` (menu). Both `size-6 rounded-sm`. Touch: always visible on the active row only.
- Drag state: dragged row `opacity-50`; drop between rows shows a 2 px `bg-primary` line spanning the row width at the correct indent with a 6 px dot at its start; drop into shows the target row with `bg-[var(--docs-sidebar-accent)]` and `ring-1 ring-primary/40`.
- Rename state: title replaced by an `Input` (`h-6 text-sm px-1`) with the text selected; `Enter` commits, `Esc` cancels, blur commits.
- Loading: 8 skeleton rows `h-7` with `Skeleton` blocks of varying widths (60 to 90%) and depth offsets. During a first uncached index build on a filesystem store, a `text-xs text-muted-foreground` line under the skeleton reads "Indexing 1,240 / 5,000 pages" (from `onProgress`).
- Empty: "No pages yet" with a "Create your first page" button when `write`.

**SidebarFooter** (`p-2 border-t border-[var(--docs-sidebar-border)]`): "New page" row (`Plus` + "New page") when `write`, then the host `sidebarFooter` slot.

**Resize handle:** 4 px wide hit area on the sidebar's right edge, `cursor-col-resize`, visible 1 px line `bg-border` on hover and while dragging, `role="separator"`. Double-click resets to 240.

**Collapsed:** sidebar width 0; a floating `PanelLeftOpen` ghost button appears at `top-2 left-2` in the content region, on hover of the left 48 px strip or always on touch. `Cmd+\` toggles. P4 optional: hovering the left 12 px strip for 300 ms shows the sidebar as an overlay (Notion peek) that hides when the pointer leaves.

## 6. Header

`h-11 px-3 flex items-center gap-2 bg-background/80 backdrop-blur sticky top-0 z-10`, no border by default; a bottom border `border-b border-border` fades in when the content region is scrolled past 0.

- Left: sidebar open button (when collapsed), breadcrumbs.
- Breadcrumbs (`text-sm`): each ancestor as a ghost button `h-7 px-1.5 rounded-md hover:bg-accent` with icon 16 px and title truncated at 160 px; separators `/` in `text-muted-foreground/50`. Current page shown last, not a link, `text-foreground`. More than 3 ancestors: show first, `…` dropdown with the middle ones, last two.
- Right: `SaveStatus` (section 9), `ModeToggle` (ghost button "Edit" / primary-ish "Done" in edit mode, `h-7 px-2.5 text-sm`), host `headerActions` slot, `PageMenu` (`Ellipsis` ghost `size-7`).

## 7. Page canvas

- **PageIcon:** 40 px block above the title (`size-10 rounded-md hover:bg-accent`, emoji at `text-[36px]`, Lucide `size-9`). When no icon: nothing rendered; a ghost "Add icon" button (`Smile` + text, `h-7 text-xs text-muted-foreground`) appears above the title on hover of the title block in edit mode (and always on touch). Click opens `IconPicker`.
- **PageTitle:** auto-growing textarea, no border, no background, `text-[40px] font-bold`, placeholder "Untitled". `Enter` moves focus to the first block (creates one if the page is empty); `ArrowDown` at the end moves to content; `Esc` blurs. Debounced `updateMeta` 600 ms after typing stops plus flush on blur. In read mode the title is plain text; clicking it in a `write` host enters edit mode with the caret in the title.
- **Body:** Plate UI `Editor` variant `default` styles, overridden where needed to match section 3. Gutter (`--docs-gutter`) on the left for `block-draggable` controls; the controls are `opacity-0` until the block is hovered, then `opacity-100` (`transition-opacity 100ms`); `GripVertical` handle and `Plus` button, each `size-6 rounded-sm text-muted-foreground hover:bg-accent`.
- **Blocks:**
  - Blockquote: `border-l-[3px] border-foreground pl-4` (no italics, no muted color).
  - Divider: `my-2 border-t border-border` with a 12 px hit area.
  - Lists: marker column 24 px; todo checkbox `size-4 rounded-[3px] border border-foreground/40 checked:bg-primary`; checked text `line-through text-muted-foreground`.
  - Code block: `bg-muted rounded-md my-1 px-4 py-3`, language label top-right `text-xs text-muted-foreground` becoming a select on hover, copy button top-right on hover (`Copy` → `Check` for 1.5 s).
  - Table: `border border-border` cells `px-2 py-1 text-sm`, header row `bg-muted/50 font-medium`, hover column/row add buttons per Plate UI defaults.
  - Image: `rounded-md max-w-full my-2`, caption `text-sm text-muted-foreground text-center mt-1`, resizable with Plate's resize handles (aspect locked), skeleton `aspect-video` while loading, broken image shows an inline `ImageOff` notice with the path.
  - Callout: `bg-muted rounded-md p-4 flex gap-3 my-1`, icon `size-5 mt-0.5 text-foreground/80`; variants tint only the icon (NOTE `text-blue-600 dark:text-blue-400`, TIP green, IMPORTANT violet, WARNING amber, CAUTION red).
  - Toggle: chevron `size-4 text-muted-foreground rotate-0 → rotate-90` on open; summary text medium weight; children indented 24 px; closed toggle with no children shows "Empty toggle. Click or drop blocks inside." in `text-muted-foreground` when in edit mode.
  - Link: `underline decoration-[1px] decoration-muted-foreground/60 underline-offset-[3px] hover:decoration-foreground`; internal links get a leading `FileText size-3.5` icon when they resolve to a page.
- **Selection:** block selection `bg-primary/10` overlay with `rounded-sm`; text selection uses the host default.
- **Empty page:** icon slot, "Untitled", one empty paragraph with the placeholder shown.

## 8. Menus, popovers, dialogs

- All floating surfaces: `bg-popover text-popover-foreground border border-border rounded-lg shadow-md` (shadow only here), padding `p-1`, items `h-8 px-2 rounded-md text-sm gap-2` with Lucide `size-4` icons, keyboard hint right-aligned in `text-xs text-muted-foreground`, destructive items `text-destructive`.
- Enter/exit animation: opacity 0→1 and `scale-[0.98]→1`, 120 ms ease-out; exit 80 ms. Under `prefers-reduced-motion` no transform, opacity only, 0 ms.
- **Slash menu:** `w-72 max-h-80` scrollable, grouped with `text-xs font-medium text-muted-foreground px-2 py-1.5` headers (Basic blocks, Lists, Media, Advanced), items with a 32 px icon tile (`bg-background border border-border rounded-md flex items-center justify-center`), name, and one-line description (`text-xs text-muted-foreground`). Filter text after `/` narrows; no matches shows "No results" and `Esc` closes.
- **Floating toolbar:** appears above the selection, `h-9 p-1 gap-0.5` icon buttons `size-7`: Turn into (dropdown with the block list + current highlighted), Bold, Italic, Underline (if kept), Strikethrough, Code, Link. Separator `w-px h-5 bg-border mx-0.5`. Hides on scroll and when the selection collapses.
- **Command palette:** shadcn `CommandDialog`, `max-w-[640px]`, input `h-12 text-base`, groups Recent (max 5, with relative time), Pages (fuzzy title match via cmdk filtering, breadcrumb path in `text-xs text-muted-foreground` below the title), Actions (New page, Toggle sidebar, Expand all, Collapse all, Switch theme when the host provides `onThemeChange`). Rows `h-10`. Footer `text-xs text-muted-foreground` with ↑↓ to navigate, ↵ to open, esc to close.
- **Icon picker:** popover `w-[352px]`, tabs Emoji / Icons, search input, Remove button in the tab bar. Emoji tab: `frimousse` grid (9 columns, 36 px cells, skin tone selector). Icons tab: Lucide names filtered by search, 8 columns, 36 px cells, icon `size-5`. Random button in the emoji tab.
- **Move to:** command-style dialog listing pages with breadcrumb path; selecting moves the page as the last child; "Root" is the first item.
- **Delete dialog:** `AlertDialog` title "Delete '<title>'?", body "This deletes the page and N sub-pages. This cannot be undone." (omit the sub-page clause when N = 0), buttons Cancel and Delete (`variant="destructive"`).
- **Page menu (`⋯`):** Copy link, Copy as Markdown, Download .md, separator, Change icon, Rename, Move to, separator, Word count (as a disabled info row: "1,240 words"), separator, Delete.

## 9. Save status (`SaveStatus`)

Placement: header right, `text-xs text-muted-foreground h-7 flex items-center gap-1.5 px-2`. Rendered only in these states (D-24):

| Session status | Label | Icon | Extra |
|---|---|---|---|
| saving (after 800 ms in flight) | Saving… | `Loader2 animate-spin size-3.5` | |
| dirty and paused (no timer running, e.g. save failed with non-network error) | Unsaved changes | `CircleDot` | click → flush |
| offline | Offline, retrying | `CloudOff` | tooltip with the next retry time |
| conflict | Changed on disk | `TriangleAlert text-amber-600` | click scrolls to the banner |
| draft | Restored draft | `History` | click scrolls to the banner |
| error | Couldn't save | `CircleAlert text-destructive` | click → retry |
| clean, dirty with timer running, saved | (nothing) | | the header stays quiet |

The `ModeToggle` tooltip in edit mode reads "Saved <relative time>" when clean, using `lastSavedAt`.

## 10. Banners

Rendered between the header and the canvas inside the content column, `rounded-md border px-3 py-2 text-sm flex items-start gap-3 my-2`, icon `size-4 mt-0.5`, buttons on the right (`h-7 text-xs`). Variants: info (`bg-muted border-border`), warning (`bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900`), danger (`bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900`).

| Banner | Variant | Text | Buttons |
|---|---|---|---|
| Lossy | warning | "Some content here can't be edited without changes: <reasons>. Editing will drop it." | Edit anyway, Learn more (opens the reasons list) |
| Conflict | danger | "Changed on disk since you opened it." | Reload, Overwrite |
| Draft restored | info | "Restored unsaved changes from <relative time>." | Keep, Discard |
| Draft base mismatch | warning | "This page changed since your unsaved edits." | Apply draft, Keep file |
| Large page | info | "Large page: opened in read mode for performance." | Edit anyway |
| Read-only store | none (no banner; the absence of edit affordances is enough) | | |

## 11. Empty and error cards

Centered in the content region, `max-w-sm text-center`, icon `size-8 text-muted-foreground/60 mb-3`, title `text-base font-medium`, body `text-sm text-muted-foreground mt-1`, primary action `mt-4`.

| Situation | Title | Body | Action |
|---|---|---|---|
| No page selected | "Select a page" | "Choose a page from the sidebar or press ⌘P to search." | New page (write) |
| No pages at all | "No pages yet" | "Create your first page to get started." | Create page (write) |
| Page not found | "This page no longer exists" | "It may have been moved or deleted." | Go home |
| Folder without page | "This folder has no page yet" | "Create one to add content here." | Create page (write) / list of children (read) |
| Provider unreachable | "Docs are unavailable" | "<provider error message>" | Retry |
| Contract too new | "Docs backend is newer than this app" | "Update the app to open these docs." | none |
| Not available offline | "Not available offline" | "This page hasn't been opened on this device yet." | Retry |
| Editor crashed | "Editor failed to render this page" | "Reload the page or open it in read mode." | Reload, Open in read mode |

## 12. Dark mode

Follows a `.dark` class on any ancestor (shadcn convention). `theme.css` includes the `.dark .docs-root, .dark.docs-root` variants. No component uses a color that is not a token, except the callout variant tints and banner variants listed above, which specify both light and dark values.

## 13. Motion

| Element | Motion | Duration |
|---|---|---|
| Menus, popovers, palette | opacity + scale 0.98→1 | 120 ms in, 80 ms out |
| Sidebar collapse/expand | width | 200 ms ease-in-out |
| Mobile sheet | translateX | 200 ms |
| Tree chevron | rotate | 150 ms |
| Row actions, block handles | opacity | 100 ms |
| Skeletons | shimmer | 1.5 s loop |
| Copy button | icon swap | none |
| Everything else | none | |

`prefers-reduced-motion: reduce` sets all durations to 0 except shimmer, which becomes a static muted block.

## 14. Copy

Sentence case. Plain verbs. The verb on the button matches the verb in the result ("Delete" → toast "Deleted 'Auth'"). No exclamation marks. No apologies. No "please". Errors say what happened and what to do. All copy lives in `strings.ts` and every key is overridable through the `strings` prop.

## 15. Visual QA checklist (screenshot review)

- Title, icon, and body share one left edge.
- Sidebar row text baseline aligns with its icon center.
- No layout shift when hover actions appear (reserve their width).
- No layout shift when the save status appears (reserve `min-w-[96px]` in the header right group).
- Header border appears only after scroll.
- Focus ring visible on every interactive element by keyboard, never on mouse click.
- Dark mode: no pure white surfaces, no pure black text, borders visible but soft.
- 390 px: no horizontal scroll; sheet sidebar; 44 px touch targets on rows and buttons.
