# PROGRESS

Claude Code maintains this file. Check a box only when the task's verification command is green and the commit is made. Add one line under each checked task: what shipped, and the measurement if the task has one.

Legend: `[ ]` not started · `[~]` in progress (only one at a time) · `[x]` done · `[-]` dropped with a DEVIATIONS entry

## Phase 0: Foundation

- [x] **P0-T01** Workspace bootstrap
  - pnpm workspace (core, react, playground, fixtures, smoke), strict TS project refs, ESLint flat config with `boundaries` verified firing, Prettier, Vitest projects, Changesets, tsup, size-limit/publint/attw, `scripts/gate.ts`, CI. `pnpm i && pnpm typecheck && pnpm lint && pnpm test` green.
- [x] **P0-T02** Core models and contract schemas
  - `model.ts`, `provider.ts`, `errors.ts`, zod v4 `contract/schemas.ts`, `contract/version.ts`; `contract/openapi.ts` generates OpenAPI 3.1 with `$ref`s from the zod registry; committed `contract/openapi.json` verified byte-identical by test. 14 tests.
- [ ] **P0-T03** Hashing and ids
- [ ] **P0-T04** Tree index and pure ops
- [ ] **P0-T05** Frontmatter
- [ ] **P0-T06** Paths and ordering
- [ ] **P0-T07** Link resolution
- [ ] **P0-T08** Fixture corpus and perf generators
- [ ] **P0-T09** Walk and MemoryFileStore
- [ ] **P0-T10** FileStore provider: read side
- [ ] **P0-T11** FileStore provider: write side
- [ ] **P0-T12** Conformance suite
- [ ] **P0-T13** Markdown codec
- [ ] **P0-T14** Fidelity classifier and doctor
- [ ] **Gate 0** green, `docs/execution/PHASE-0-REPORT.md` written

## Phase 1: Read path, shell, adapters, playground

- [ ] **P1-T01** React package scaffold and primitives
- [ ] **P1-T02** DocsProvider, namespace, queries
- [ ] **P1-T03** Persisted cache and value cache
- [ ] **P1-T04** Sidebar store and recents
- [ ] **P1-T05** Memory adapter entry and playground bootstrap
- [ ] **P1-T06** PageTree
- [ ] **P1-T07** Shell
- [ ] **P1-T08** DocumentView (read-only)
- [ ] **P1-T09** Filesystem adapter
- [ ] **P1-T10** HTTP adapter
- [ ] **P1-T11** Playground modes
- [ ] **P1-T12** Command palette and global shortcuts
- [ ] **P1-T13** E2E skeleton, a11y, perf baseline
- [ ] **Gate 1** green, `docs/execution/PHASE-1-REPORT.md` written

## Phase 2: Editing

- [ ] **P2-T01** Editor entry and kit
- [ ] **P2-T02** Shell mode transitions and editor loading
- [ ] **P2-T03** Document session and drafts
- [ ] **P2-T04** Save status and banners
- [ ] **P2-T05** Blocks, slash menu, floating toolbar, autoformat
- [ ] **P2-T06** Block DnD and block selection
- [ ] **P2-T07** Title edit and icon picker
- [ ] **P2-T08** Offline handling
- [ ] **P2-T09** Conflicts end to end
- [ ] **P2-T10** Callout rule and kit (stretch, D-17)
- [ ] **P2-T11** Toggle rule and kit (stretch, D-17)
- [ ] **P2-T12** Image caption rule (stretch)
- [ ] **P2-T13** Asset upload
- [ ] **P2-T14** Edit round-trip e2e
- [ ] **Gate 2** green, `docs/execution/PHASE-2-REPORT.md` written

## Phase 3: Page operations, polish, packaging

- [ ] **P3-T01** Create page flows
- [ ] **P3-T02** Rename, change icon, row menu
- [ ] **P3-T03** Tree drag and drop, keyboard move, Move to
- [ ] **P3-T04** Delete
- [ ] **P3-T05** Folder nodes
- [ ] **P3-T06** Page menu
- [ ] **P3-T07** Block menu and emoji combobox (optional)
- [ ] **P3-T08** Expand/collapse all, palette actions, theme
- [ ] **P3-T09** Capability, strings, events audit
- [ ] **P3-T10** Accessibility pass
- [ ] **P3-T11** Performance pass
- [ ] **P3-T12** Built-package smoke hosts
- [ ] **P3-T13** Docs and versioning
- [ ] **P3-T14** Visual QA and polish
- [ ] **Gate 3** green, `docs/execution/PHASE-3-REPORT.md` written

## Phase 4: Hardening (optional)

- [ ] **P4-T01** Filesystem watch and subscribe
- [ ] **P4-T02** HTTP events
- [ ] **P4-T03** Draft compare dialog
- [ ] **P4-T04** Large page path
- [ ] **P4-T05** Doctor polish and `ids` migration
- [ ] **P4-T07** Local content search (optional)
- [ ] **P4-T08** Scroll restoration (optional)
- [ ] **P4-T09** Final report

## Notes

- Current task: P0-T03
- Last gate passed: (none)
