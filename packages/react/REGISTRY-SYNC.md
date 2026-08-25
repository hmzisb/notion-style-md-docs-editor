# Registry sync

shadcn registry items are **copied source** (docs/11 section 5): edit them freely. This file
records what was copied and when, so a later `shadcn diff`/re-add can be merged by hand.

|        |                                                                                                                         |
| ------ | ----------------------------------------------------------------------------------------------------------------------- |
| CLI    | `shadcn@4.19.0`                                                                                                         |
| Init   | `npx shadcn@latest init -b radix` (base `radix`, style `radix-nova`, preset `nova`, base color `neutral`, lucide icons) |
| Copied | 2026-08-25                                                                                                              |
| Target | `src/ui/*` (alias `@/ui`), `src/hooks/*`, `src/lib/utils.ts`                                                            |

Confirm the engine before adding anything: `pnpm --filter @docs/react exec shadcn info` must
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

## Plate items

None yet. P2 adds them with `npx shadcn@latest add @plate/<item>` into `src/editor/ui`
(docs/11 section 5); their `@/components/ui/*` imports are redirected to `@/ui/*`.
