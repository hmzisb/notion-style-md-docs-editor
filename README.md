# Docs Module Handover Package (v3, execution-ready)

**What this builds:** a backend-agnostic React module that gives any React app a Notion-grade docs experience (explore, read, edit, create, rename, move, delete, search) over plain Markdown files, with a persistent browser cache so pages open instantly and edits survive reloads and dropped connections.

**Who executes it:** Claude Code (Opus), autonomously, end to end. Every document in this package is written for that reader: locked decisions, precise contracts, testable acceptance criteria, gate commands.

**Scope guard:** frontend only. No backend is built. Storage is reached through a `DocumentProvider` interface with three shipped adapters: in-memory, browser filesystem (File System Access API or OPFS), and HTTP (a documented contract any backend can implement later).

---

## Read order

| # | File | Purpose | Read when |
|---|---|---|---|
| 1 | `CLAUDE.md` | Operating protocol for autonomous execution | Every session, first |
| 2 | `docs/00-DECISIONS.md` | Locked decisions and what changed vs architecture v2 | Every session |
| 3 | `docs/01-PRODUCT-SPEC.md` | Scope, users, flows, non-goals | Phase 0 |
| 4 | `docs/02-ARCHITECTURE.md` | Packages, layers, boundaries, runtime | Phase 0 |
| 5 | `docs/03-DATA-MODEL-AND-CONTRACTS.md` | Types, provider contract, FileStore, filesystem semantics, HTTP contract | Phase 0, 1 |
| 6 | `docs/04-CACHE-AND-SYNC.md` | Browser cache, drafts, save session, conflicts, offline | Phase 1, 2 |
| 7 | `docs/05-EDITOR.md` | Plate kits, Markdown codec, fidelity, custom rules | Phase 2 |
| 8 | `docs/06-DESIGN-SPEC.md` | Visual system and per-component look, Notion-grade | Phase 1 onward |
| 9 | `docs/07-INTERACTIONS-AND-SHORTCUTS.md` | Keyboard map, DnD, menus, states, a11y | Phase 1 onward |
| 10 | `docs/08-PUBLIC-API.md` | Exports, props, hooks, events, integration recipes | Phase 1, 3 |
| 11 | `docs/09-IMPLEMENTATION-PLAN.md` | Phases, task DAG, acceptance criteria, gates | Every session |
| 12 | `docs/10-TESTING-AND-QUALITY.md` | Test matrix, e2e list, budgets, CI gates | Phase 0 onward |
| 13 | `docs/11-REPO-AND-TOOLING.md` | Workspace, build, Tailwind, lint, scripts | Phase 0 |
| 14 | `docs/12-REVIEW-LOG.md` | Senior frontend review findings and their resolutions | Reference |
| 15 | `reference/architecture-v2.md` | Prior architecture, background only | Reference |
| 16 | `templates/*` | PROGRESS, DEVIATIONS, ASSUMPTIONS files Claude Code maintains | Phase 0 |

## Precedence when documents disagree

1. `CLAUDE.md`
2. `docs/00-DECISIONS.md`
3. The most specific `docs/NN-*.md` for the topic
4. `reference/architecture-v2.md` (superseded wherever it conflicts with `docs/`)
5. Installed library reality beats any code sketch in these docs for API names and option shapes. Behavior requirements still stand.

## Launching Claude Code

```bash
mkdir docs-module && cd docs-module && git init
cp -R /path/to/docs-module-handover/. .        # CLAUDE.md, docs/, templates/, reference/ at repo root
cp templates/PROGRESS.md PROGRESS.md
cp templates/DEVIATIONS.md DEVIATIONS.md
cp templates/ASSUMPTIONS.md ASSUMPTIONS.md
claude
```

First prompt:

```
Read CLAUDE.md, then docs/00-DECISIONS.md and docs/09-IMPLEMENTATION-PLAN.md.
Execute the plan from P0-T01 in order. Follow the session loop in CLAUDE.md.
Stop only on a blocker as defined in CLAUDE.md section 6.
```

## Deliverable at the end of the plan

- `packages/core` (`@docs/core`) and `packages/react` (`@docs/react`), built, typed, published-shape verified.
- `apps/playground`: a standalone Notion-like app over a local folder (File System Access), browser storage (OPFS), an in-memory demo corpus, or any HTTP backend implementing the contract.
- Green gates: typecheck, lint with boundary rules, unit, provider conformance, e2e, bundle budgets, built-package smoke in a Tailwind host and a non-Tailwind host.
- `PROGRESS.md` fully checked, `DEVIATIONS.md` and `ASSUMPTIONS.md` complete, one `docs/execution/PHASE-N-REPORT.md` per phase.
