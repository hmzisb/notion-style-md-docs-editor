# Checkpoint — owner UX requests, 2026-08-27

| Task | What | Status | Next action |
|---|---|---|---|
| T1 | Page tree: one branch expanded at a time | done | committed `147b3a5`, DEV-033 |
| T2 | Title `Enter` moves the caret into the editor | done | already worked; verified live in the dev server, no change |
| T3 | Slash menu `Page` row makes a subpage | done | committed `2a14022`, ASM-163 (no in-doc link: conversion conflict) |
| T4 | Text colour from the floating toolbar | done | DEV-034, ASM-164: `codec/rules/color.ts` (`<span data-color>` + per-colour stringify handlers), `ColorKit`, the toolbar swatch menu, nine `--docs-text-*` variables, 17 codec tests and one e2e |

Gate before each commit: `pnpm typecheck && pnpm lint && pnpm test`.
UI tasks also need `pnpm --filter playground exec playwright test <spec>` and screenshots at 1440x900 / 390x844, light and dark.
