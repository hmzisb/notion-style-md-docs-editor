# Contributing

Thanks for taking a look. Issues and pull requests are both welcome.

## Setup

You need Node 22 (see [`.nvmrc`](.nvmrc)) and pnpm 10.

```bash
pnpm i
pnpm dev
```

`pnpm dev` starts the playground on <http://localhost:5173>. It runs against the demo corpus in
memory, so nothing is written to disk until you pick a folder.

## Before you push

```bash
pnpm typecheck && pnpm lint && pnpm test
```

CI runs those, plus `pnpm build` (which includes `publint`, `attw` and `size-limit`),
`pnpm format:check`, the end-to-end suite, and a build of the two smoke host apps that consume
the packages the way a stranger does.

Two checks stay on your machine, because they are not portable to a shared runner:

```bash
pnpm gate all        # everything, including the two below
pnpm test:perf       # the speed budgets — a stopwatch, so one machine at a time
pnpm test:e2e        # includes the screenshot baselines, which are rasterised on macOS
```

If you change anything a screenshot covers, re-record on macOS:

```bash
pnpm --filter playground exec playwright test visual --update-snapshots
```

## Layout

| Path              | What lives there                                                                   |
| ----------------- | ---------------------------------------------------------------------------------- |
| `packages/core`   | Markdown codec, tree index, path rules, the provider contract. No DOM, no React.   |
| `packages/react`  | Everything you see: tree, viewer, editor, shell, cache, adapters.                  |
| `apps/playground` | The demo app and the end-to-end suite.                                             |
| `smoke/`          | Two host apps that import the built packages through the exports map.              |
| `docs/`           | The spec the module was built from. `docs/08-PUBLIC-API.md` is the public surface. |

## Rules that are not negotiable

- **No backend.** All I/O goes through `DocumentProvider`. If a feature needs a server, it needs a
  provider capability instead.
- **Markdown is the source of truth.** Editor JSON is transient, and a page the user did not edit
  is never written back.
- **Nothing in `packages/` touches `window.location`, `document.title`, global CSS or a router.**
  `pnpm lint` enforces this; the host owns its URL.
- **Strict TypeScript.** No `any`, no `@ts-ignore` without a comment naming the upstream issue.
- **All user-visible copy goes through `strings`** so a host can translate or reword it.

## Commits and releases

Commit messages are `type(scope): summary`, for example `fix(react): keep the caption under the
image`. Keep commits small and green — never commit a failing suite.

Anything a consumer would notice needs a changeset:

```bash
pnpm changeset
```

Merging to `main` opens a "Version packages" pull request. Merging **that** publishes to npm.

## Reporting a bug

Open an issue with the version, the browser, and the smallest Markdown file that shows the
problem. A failing test is even better.
