# Registry sync

shadcn registry items are **copied source** (docs/11 section 5): edit them freely. This file
records what was copied and when, so a later `shadcn diff`/re-add can be merged by hand.

|        |                                                                                                                         |
| ------ | ----------------------------------------------------------------------------------------------------------------------- |
| CLI    | `shadcn@4.19.0`                                                                                                         |
| Init   | `npx shadcn@latest init -b radix` (base `radix`, style `radix-nova`, preset `nova`, base color `neutral`, lucide icons) |
| Copied | 2026-08-25                                                                                                              |
| Target | `src/ui/*` (alias `@/ui`), `src/hooks/*`, `src/lib/utils.ts`                                                            |

Confirm the engine before adding anything: `pnpm --filter @hmzisb/notion-docs-react exec shadcn info` must
report `base radix`.

## Items from `@shadcn` (P1-T01)

`alert-dialog`, `button`, `command`, `dialog`, `dropdown-menu`, `input`, `input-group`, `kbd`,
`popover`, `scroll-area`, `separator`, `sheet`, `sidebar`, `skeleton`, `sonner`, `textarea`,
`tooltip`

`input-group` and `use-mobile` arrived as dependencies of `input` and `sidebar`.

## Local edits to keep on re-add

| File                 | Edit                                                                 | Why                                                                                                                          |
| -------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/ui/sidebar.tsx` | `document.cookie` write and the `SIDEBAR_COOKIE_*` constants removed | docs/06 section 4: the module stores no cookies; sidebar width and open state belong to the host or to the shell's own state |
| `src/ui/sidebar.tsx` | `SIDEBAR_KEYBOARD_SHORTCUT` `'b'` -> `'\\'`                          | docs/07: `Cmd+\` toggles the sidebar; `Cmd+B` is bold in the editor                                                          |
| `src/ui/sonner.tsx`  | `next-themes` import removed, `theme` prop dropped                   | D-11: the module never owns the host theme, it follows the `.dark` class                                                     |

## Plate items from `@plate` (P2-T01)

Copied 2026-08-26 from `https://platejs.org/r/<name>.json`, not through the CLI (DEV-015):
shadcn 4.19 ignores `--path` and would overwrite the primitives listed above. Target
`src/editor/ui`, with every `@/components/ui/*` import redirected to `@/ui/*` (docs/11
section 5).

`block-draggable`, `block-list`, `block-selection`, `blockquote-node`, `callout-node`,
`code-block-node`, `code-node`, `editor`, `floating-toolbar`, `floating-toolbar-buttons`,
`heading-node`, `hr-node`, `inline-combobox`, `link-node`, `link-toolbar`,
`link-toolbar-button`, `mark-toolbar-button`, `media-image-node`, `paragraph-node`,
`resize-handle`, `slash-node`, `table-icons`, `table-node`, `toggle-node`, `toolbar`,
`turn-into-toolbar-button`

Their kits (`src/editor/kits/*`) came from the same registry items. `checkbox` was the one
missing shadcn primitive and was added through the CLI as usual.

To re-check one against upstream: `curl -s https://platejs.org/r/<name>.json | jq -r '.files[0].content'`.

## Local edits to keep on re-add (Plate items)

| File                                    | Edit                                                                                                      | Why                                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| every node component                    | classes replaced by `blockStyles` from `src/lib/block-styles.ts`                                          | docs/05 section 8: read and edit draw a block identically, so both renderers read one table        |
| `heading-node.tsx`                      | `H4`-`H6` removed                                                                                         | docs/05 section 2: the codec parses three heading levels                                           |
| `media-image-node.tsx`                  | caption UI removed, `caption.tsx` not copied                                                              | ASM-061: `caption` holds Markdown alt text that the read view does not draw                        |
| `block-selection.tsx`                   | overlay is `rounded-sm bg-primary/10`                                                                     | docs/06 section 7                                                                                  |
| `block-draggable.tsx`, `table-node.tsx` | drop indicator is `bg-primary`                                                                            | docs/06 section 7                                                                                  |
| `code-block-node.tsx`                   | `lowlight` languages narrowed to the codec's set                                                          | docs/05 section 2                                                                                  |
| `code-block-node.tsx`                   | the language list moved to `lib/code-languages.ts`; the format and copy buttons rest hidden until hover   | docs/05 section 8, docs/06 section 7                                                               |
| ten files                               | strict-mode fixes (missing guards, unused imports, a `contentEditable={false}` wrapper in `callout-node`) | the repo builds with `noUncheckedIndexedAccess`; see DEV-016 for the lint rules that stay off here |
