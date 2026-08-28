# CLAUDE.md: Operating Protocol for Autonomous Execution

You are building `@hmzisb/notion-docs-core` and `@hmzisb/notion-docs-react`: a backend-agnostic, Notion-grade Markdown docs module for React, plus a playground app. The full spec lives in `docs/`. This file tells you how to work. It wins over every other document.

## 1. Mission and non-negotiables

- Ship a production-ready module a stranger can install into a Tailwind v4 React app and get a Notion-quality docs experience in under 30 minutes, following `docs/08-PUBLIC-API.md`.
- Frontend only. Never build a backend. All I/O goes through `DocumentProvider` (`docs/03`).
- Markdown files are the canonical format. Plate JSON is transient. Never save a page the user did not edit.
- The browser cache is a feature, not an optimization: cached pages paint instantly, drafts survive reloads, saves survive dropped connections (`docs/04`).
- Quality bar is `docs/06-DESIGN-SPEC.md` and `docs/07-INTERACTIONS-AND-SHORTCUTS.md`. "Works" is not done. "Feels like Notion, looks like shadcn default" is done.
- Locked decisions in `docs/00-DECISIONS.md` are not up for debate. Record disagreement in `DEVIATIONS.md` as a note, then follow the decision.

## 2. Read order per session

1. This file.
2. `PROGRESS.md` (find the next unchecked task).
3. `docs/00-DECISIONS.md`.
4. The spec sections the task cites.
5. `DEVIATIONS.md` and `ASSUMPTIONS.md` (do not repeat resolved questions).

## 3. Session loop

```
pick next unchecked task in PROGRESS.md (respect dependencies listed in the plan)
  → read its spec references
  → verify every library API you will touch against the installed package (section 4)
  → write or extend tests first for core logic; for UI, write the RTL or e2e test alongside
  → implement
  → run the task's verification command(s) from docs/09
  → self-review against section 7
  → update PROGRESS.md (check the box, add one line of what shipped)
  → git commit: "<type>(<scope>): <TASK-ID> <summary>"   e.g. "feat(core): P0-T04 tree index ops"
  → next task
end of phase → run the phase gate → write docs/execution/PHASE-<n>-REPORT.md → continue
```

Never leave a task half-done across a commit boundary. If a task is too large, split it in `PROGRESS.md` (sub-tasks `P1-T03a`, `P1-T03b`) and keep going.

## 4. Library reality beats spec sketches

The spec sketches TypeScript for Plate, headless-tree, TanStack Query, shadcn and others. Package APIs move. Before using any option name, plugin name, registry item name, or hook:

1. Check the installed version: `cat node_modules/<pkg>/package.json | grep version`.
2. Read the shipped types: `node_modules/<pkg>/dist/**/*.d.ts` (grep for the symbol).
3. For Plate: install its docs locally per https://platejs.org/docs/installation/docs and read the relevant page before writing editor code. For registry items use `npx shadcn@latest view @plate/<item>` before adding.
4. For shadcn primitives: this project uses the Radix engine (`-b radix`), see `docs/00-DECISIONS.md` D-07. Never mix Base UI and Radix inside the module.
5. If the spec's API sketch does not match reality, keep the required behavior, adapt the code, and log it in `DEVIATIONS.md` (what the spec said, what the library offers, what you did).

Never invent an API. Never pin a version you have not seen on npm. Pin exact versions in the playground, caret ranges in packages.

## 5. Decision precedence

`CLAUDE.md` > `docs/00-DECISIONS.md` > the most specific `docs/NN-*.md` > `reference/architecture-v2.md` > library docs for behavior. For API names: installed library > everything.

## 6. When to stop (genuine blockers only)

Stop and report only when one of these is true:

- A locked decision cannot be implemented with the pinned major versions (e.g. Plate cannot serialize a required block even with custom rules after a real attempt with golden tests).
- Two locked decisions contradict each other and the precedence rule does not resolve it.
- A dependency needs credentials, a license, or a network resource you do not have.
- A gate fails for a reason outside the repo (toolchain broken, registry down) after two retries.

Everything else: choose the most defensible option, write it in `ASSUMPTIONS.md` with a one-line rationale, and proceed. Do not ask for permission. Do not ask for preferences. The user reviews the assumptions file, not chat messages.

## 7. Self-review checklist (run before every commit)

- **Behavior:** acceptance criteria of the task met; verification command green.
- **States:** loading, empty, error, offline, read-only, conflict, lossy, draft-restored handled where the component can encounter them (`docs/07` state matrix).
- **Design:** sizes, spacing, colors, typography match `docs/06`. Take Playwright screenshots (1440x900 and 390x844, light and dark) for any UI task and look at them. Fix what is off before committing.
- **Keyboard and a11y:** every interactive element reachable and operable by keyboard; ARIA roles per `docs/07`; visible focus; no focus traps except modals.
- **Performance:** no per-keystroke re-render of the tree or shell; no unbounded lists; parse once per version; serialize only on save.
- **Boundaries:** `pnpm lint` boundary rules green; nothing in the package touches `window.location`, global CSS, `document.title`, or a router.
- **Types:** strict TS, no `any`, no `@ts-ignore` without a comment naming the upstream issue.
- **Tests:** core logic has unit tests; provider behavior is covered by the conformance suite; UI behavior has RTL or e2e coverage per `docs/10`.
- **Docs:** public API changes reflected in the package README and `docs/08`.

## 8. Coding rules

- TypeScript strict, ESM only, `moduleResolution: bundler`, React 19 types (support 18.3 at runtime through peer range).
- Files: kebab-case; components PascalCase exports; one component per file; co-located `*.test.ts(x)`.
- No default exports except route files in the playground.
- No global mutable singletons in the package. Everything namespaced by `instanceId` and `provider.key`.
- No `console.*` in package code. Route diagnostics through `onEvent({ type: 'error' })`.
- No new runtime dependency without a `DEVIATIONS.md` entry stating size (gzipped), license, and why an allowed dependency could not do it. Allowed list is in `docs/11`.
- Copy: sentence case, plain verbs, same verb on button and toast, no apologies. All strings through `strings`.
- Tailwind only, shadcn CSS variables only, `.docs-root` scoping, no preflight, no styling of `html`, `body`, or bare tags.
- Commits are small and green. Never commit a red test suite.

## 9. Commands (defined in `docs/11`)

```
pnpm i                      install
pnpm dev                    playground (in-memory demo mode by default)
pnpm typecheck              tsc -b across workspace
pnpm lint                   eslint incl. boundary rules
pnpm test                   vitest (core + react + conformance)
pnpm test:e2e               playwright (playground, demo + OPFS modes)
pnpm build                  tsup builds + publint + attw + size-limit
pnpm gate <phase>           the phase gate script from docs/09
```

## 10. Reporting format at the end of each phase

Write `docs/execution/PHASE-<n>-REPORT.md` with: tasks shipped, measurements (bundle sizes, perf numbers from the budget table), deviations logged this phase, assumptions logged this phase, known gaps carried forward, and the exact gate command output summary (pass counts). Keep it under one page.
