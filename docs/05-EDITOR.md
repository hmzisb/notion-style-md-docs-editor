# 05. Editor

Plate v53 (`platejs`, `@platejs/*`) with Plate UI registry components. Read the local Plate docs before writing any editor code (`CLAUDE.md` section 4). Registry item names below are indicative; verify each with `npx shadcn@latest view @plate/<item>` and use what the registry actually ships.

## 1. Two kits, one plugin base

| Kit | Package location | Purpose | Imports |
|---|---|---|---|
| `BaseKit` | `@docs/core/src/codec/base-kit.ts` | Headless `Base*` plugins + Markdown plugin config. Used by the codec (`createSlateEditor`) and by `DocumentView` static rendering | `platejs`, `@platejs/*` root entries only |
| `EditorKit` | `@docs/react/src/editor/kits/editor-kit.ts` | React plugins with node components, toolbars, slash, DnD, selection, autoformat, placeholder | `@platejs/*/react`, Plate UI components |

Rule: the codec and the view never import `/react`. The editor kit is built by extending the same plugin list with React components so that serialization behavior is identical in all three paths.

## 2. Block set and plugins

| Block / mark | Plugin (kit) | Markdown form | Phase |
|---|---|---|---|
| Paragraph | core | text | P2 |
| Heading 1-3 | `@platejs/basic-nodes` H1-H3 (`BasicBlocksKit`) | `#`, `##`, `###` | P2 |
| Blockquote | basic-nodes | `>` | P2 |
| Divider | basic-nodes hr | `---` | P2 |
| Bold, italic, strikethrough, inline code | basic-nodes marks (`BasicMarksKit`) | `**`, `*`, `~~`, backticks | P2 |
| Underline | basic-nodes underline mark | No GFM form. Plate's Markdown plugin emits `<u>text</u>` (verify against the installed rules). Keep underline only if the installed plugin round-trips `<u>` in non-MDX mode; otherwise remove the button and the `Cmd+U` shortcut and log the deviation | P2 |
| Bulleted, numbered, todo lists | `@platejs/list` indent-based (`ListKit`) with `TodoList` | `-`, `1.`, `- [ ]` / `- [x]`; nesting by indentation | P2 |
| Code block with language | `@platejs/code-block` + lowlight (`CodeBlockKit`); languages: common set (ts, js, tsx, json, bash, sh, php, python, go, rust, sql, yaml, html, css, md, diff, plaintext) registered explicitly, not `all` | fenced with info string | P2 |
| Table | `@platejs/table` (`TableKit`) | GFM table (no merged cells; merged cells are `lossy`) | P2 |
| Link | `@platejs/link` (`LinkKit`) | `[text](href)` | P2 |
| Image with caption | `@platejs/media` image + `@platejs/caption` (`MediaKit` trimmed to image only) | `![alt](src)` with caption rule (section 5) | P2 |
| Callout | `@platejs/callout` (`CalloutKit`) | GFM alert `> [!NOTE]` (section 5) | P2 stretch, D-17 |
| Toggle | `@platejs/toggle` (`ToggleKit`) | `<details><summary>` (section 5) | P2 stretch, D-17 |
| Autoformat | `@platejs/autoformat` (`AutoformatKit`) | n/a | P2 |
| Slash menu | `@platejs/slash-command` (`SlashKit`) + `slash-node` | n/a | P2 |
| Block DnD | `@platejs/dnd` (`DndKit`) + `block-draggable` | n/a | P2 |
| Block selection | `@platejs/selection` (`BlockSelectionKit`) | n/a | P2 |
| Block menu | `@platejs/selection` block menu (`BlockMenuKit`) | n/a | P3 |
| Exit break, soft break, trailing block, select-on-backspace | `ExitBreakKit`, `TrailingBlockPlugin`, `DeleteKit`/`SelectOnBackspace` per Plate's current names | n/a | P2 |
| Placeholder | `block-placeholder` | n/a | P2 |
| Floating toolbar | `floating-toolbar` + `floating-toolbar-buttons` + `turn-into-toolbar-button` + `link-toolbar-button` + `mark-toolbar-button` | n/a | P2 |
| Emoji inline picker (`:`) | `@platejs/emoji` (`EmojiKit`) | shortcodes via `remark-emoji` when registered by Plate's markdown kit | P3 optional |

Not installed: AI, comments, suggestions, mentions, math, columns/layout, TOC, date, font/color, media embeds, video, audio, file, excalidraw, cursor overlay, discussion, docx, juice, playwright kits.

## 3. Markdown codec (`@docs/core/src/codec/codec.ts`)

```ts
import { createSlateEditor, type Value } from 'platejs';
import { BaseKit } from './base-kit';

export interface CodecOptions { remarkStringifyOptions?: Partial<StringifyOptions>; math?: boolean }
export function createCodec(opts?: CodecOptions): { toValue(body: string, onError?: (e: Error) => void): Value; toMarkdown(value: Value): string };
export const defaultCodec = createCodec();
export const markdownToValue = defaultCodec.toValue;
export const valueToMarkdown = defaultCodec.toMarkdown;
```

Configuration decisions:
- The headless `createSlateEditor` instance is created lazily on the first `toValue`/`toMarkdown` call and reused (no work at import time; `createCodec` returns an object whose methods initialize on demand).
- `remark-gfm` on. `remark-math` off unless `math: true`.
- MDX off: use the Markdown plugin's non-MDX mode (`withoutMdx` or the current option name). Plain docs contain `<br>`, `<img width>` and other HTML that MDX parsing rejects.
- `remarkStringifyOptions` pinned: `bullet: '-'`, `emphasis: '*'`, `strong: '*'`, `fences: true`, `rule: '-'`, `listItemIndent: 'one'`, `resourceLink: false`. Host-overridable through `createCodec` and `DocsProvider` `codec` prop to match a markdownlint config.
- `preserveEmptyParagraphs: true` both ways.
- Headings above H3 deserialize to H3 with a `reformat` reason `heading_level_clamped` (H4-H6 are not in the block set); the serializer never emits H4+.
- Lists: indent-based `ListKit`. Golden tests cover nested, mixed, loose and tight lists, task items, and code inside list items.

## 4. Fidelity (`@docs/core/src/codec/fidelity.ts`)

```ts
export type Fidelity = { level: 'exact' | 'reformat' | 'lossy'; reasons: string[] };
export function classifyFidelity(body: string, value: Value, codec?): Fidelity
```

1. Serialize `value`; if `normalize(out) === normalize(body)` (LF, trailing whitespace, final newline) → `exact`.
2. Parse both with the same remark stack Plate uses (positions stripped). Collect `lossy` reasons from the original mdast: `html` nodes not handled by a custom rule, `footnoteDefinition`, `definition` (reference-style links are rewritten inline: `reformat`, not `lossy`), `math` when math is off, headings above H3 (`reformat`), tables with cells spanning (`lossy`), unknown node types.
3. No lossy reasons and `deepEqual(mdastA, mdastB)` → `reformat`, else `lossy`.
4. Cost: one serialize + two parses per open, cached in L3 with the value. Runs in idle time after the first paint.

`docs doctor` (a Vitest-driven script, `pnpm doctor <folder>`) runs the same function over a folder and prints a table; run it on any corpus before adoption.

## 5. Custom serialization rules (`@docs/core/src/codec/rules/`)

Each rule is a pair (mdast → Plate, Plate → mdast) registered in the Markdown plugin's `rules` option, with golden tests in `fixtures/corpus/rules/*.md` and idempotence tests (parse → serialize → parse equals parse).

- **Callout (GFM alerts):** mdast `blockquote` whose first paragraph starts with `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]` → callout element `{ variant, icon }` with the marker removed. Serialize back to the same form. Icon per variant: `info`, `lightbulb`, `message-square-warning`? Use Lucide: NOTE `info`, TIP `lightbulb`, IMPORTANT `megaphone`, WARNING `triangle-alert`, CAUTION `octagon-alert`. Custom emoji icons on callouts are not persisted (UI hides the icon picker on callouts; variant picker instead).
- **Toggle:** mdast `html` node `<details>` with an optional `<summary>` and the following nodes until `</details>` → toggle element with summary text as the toggle's first line. Serialize as `<details>\n<summary>…</summary>\n\n…\n\n</details>`. Only raw `<details>` blocks are handled; any other raw HTML remains `lossy`.
- **Image caption:** an image with a caption serializes as `![alt](src)` followed by a paragraph containing only `*caption*` (italic). On deserialize, an italic-only paragraph immediately following an image becomes that image's caption. `alt` stays what the author wrote; it is never overwritten by the caption. Round trip must be idempotent; a misfire on a corpus page degrades to `reformat`, never `lossy`.

If a rule cannot pass its golden and idempotence tests inside its task budget (docs/09), remove its block from the slash menu and keep the plugin out of the kit; log the deviation (D-17).

## 6. Editing behaviors

- Editor keyed by `pageId`. `readOnly={mode === 'read'}` toggles in place (no remount, no re-parse, no scroll jump).
- Enter edit mode: click inside content, `E`, `Enter` on the focused content region, Edit button. Leaving: `Esc` (when no popover, menu, or block selection is active), Done button, navigating away. On enter, the caret goes to the clicked position (Plate handles) or the start of the first block for keyboard entry.
- Chunked rendering on. Soft threshold: pages with more than 5,000 top-level blocks open read-only with "Large page: edit anyway".
- Autoformat rules: `# `…`### `, `- `, `* `, `1. `, `[] `, `[x] `, `> `, `---`, triple backtick + language, `**bold**`, `*italic*`, `~~strike~~`, backtick code, `> [!NOTE] ` for callouts (P2 stretch).
- Placeholder: empty focused paragraph shows "Type '/' for commands"; the first empty block of an empty page shows it even when not focused; headings show "Heading 1/2/3".
- Trailing block: an empty paragraph always exists after the last block so the user can click below content.
- Links: `Cmd+K` in the editor opens the link popover (with selection: wrap; without: insert). Internal links resolve through `resolvePageLink` at render and navigate through `DocsNavigation` in read mode; in edit mode a click opens the link popover, `Cmd+click` navigates.
- Images: paste a URL or relative path; when `capabilities.upload` is true, the slash item and paste/drop of files call `uploadAsset` and insert the returned relative path; progress shown inline. `src` resolution through `assetUrl` in an `AssetImage` component with an object-URL cache and a skeleton while loading.
- Code block: language selector (popover with search) on hover or focus, copy button on hover, `Cmd+A` inside a code block selects the block content first, `Tab` inserts two spaces.
- Tables: floating toolbar for row/column insert/delete; `Tab` moves cells; header row styled.
- Block DnD: drag handle appears in the gutter on hover (24 px column left of the block), along with `+` (inserts an empty paragraph below and opens the slash menu). Drop indicator 2 px accent line.
- Block selection: `Esc` from a collapsed selection selects the current block; `Shift+Click`, `Cmd+A` twice selects all; `Delete` removes selected blocks; `Cmd+D` duplicates; arrow keys move the selection.
- Undo/redo: Plate history, `Cmd+Z` / `Cmd+Shift+Z`. History resets on page switch.

## 7. Read-only rendering

- Editing hosts: `<Plate readOnly>` once the editor chunk is loaded (section 8).
- Read-only hosts and the `./view` entry: `DocumentView` on `PlateView` with static node components from the Plate registry (`*-node-static`), same `BaseKit`. Interactive bits in read-only: link navigation, code copy button, image lightbox (P3 optional), toggle open/close (local state), todo checkboxes disabled.

## 8. Editor chunk loading rule (shell)

- `DocsShell` renders `DocumentView` for read mode until `./editor` is loaded.
- Preload `./editor` on `requestIdleCallback` after first paint when `capabilities.write` is true, and on `pointerenter`/`focusin` of the content region.
- When the user requests edit mode before the chunk is ready: show a spinner inside the Edit control (never a full-page spinner), await the chunk, swap `DocumentView` → `<Plate>` inside the same scroll container, restore `scrollTop`, then focus.
- After the swap, read mode stays on `<Plate readOnly>` for that page session (no swap back), so click-to-edit remains instant.
- Hosts that compose their own layout receive `preloadEditor()` from `@docs/react` and can call it whenever they want.

## 9. Security

- No `dangerouslySetInnerHTML` anywhere in the module, including custom node components and static components.
- Raw HTML other than the `<details>` rule is dropped from the value (and flagged `lossy`); never rendered.
- Link `isUrl`: allow `http`, `https`, `mailto`, relative, root-relative; reject `javascript:`, `data:`, `vbscript:` at input and again at render. External links get `rel="noopener noreferrer"` and `target="_blank"` only when the host sets `openExternalLinksInNewTab` (default true).
- Images: relative paths through `assetUrl`; absolute `http(s)` allowed; `data:` blocked unless `allowDataImages` is set by the host.
- Body size cap on deserialize: 2 MB → open read-only with a notice.
- Content is treated as trusted in v1; a sanitizer hook `sanitizeMarkdown?(body)` on `DocsProvider` lets a host add one.
