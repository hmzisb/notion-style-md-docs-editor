# Checkpoint — Notion-parity batch (2026-08-27)

Four requested updates, in order of landing:

| # | Task | Status | Next action |
|---|------|--------|-------------|
| T1 | Sidebar tree: one branch expanded at a time | todo | PageTree `setExpandedItems` prunes to the opened row's path |
| T2 | Title `Enter` moves the caret into the editor | todo | verify in the browser first; fix only if broken |
| T3 | Slash menu "Page": create a subpage and link it | todo | `relativeHref` in core, slash item creates + inserts the link |
| T4 | Text colour on the selection, Notion defaults | todo | codec rule (`<span data-color>`), mark plugin, toolbar swatch |

Gate before each commit: `pnpm typecheck && pnpm lint && pnpm test`.
