# @hmzisb/notion-docs-core

The backend-agnostic half of the docs module: the provider contract, the models both sides agree
on, the tree and filesystem semantics, and the Markdown codec. No React, no DOM, no I/O of its own -
it runs in a browser, in Node, and in a test.

Install it directly only if you are writing a provider or doing Markdown work server-side.
[`@hmzisb/notion-docs-react`](https://www.npmjs.com/package/@hmzisb/notion-docs-react) depends on it and re-exports all of its types.

## Install

```bash
pnpm add @hmzisb/notion-docs-core platejs @platejs/markdown @platejs/basic-nodes @platejs/list \
  @platejs/table @platejs/link @platejs/media @platejs/code-block @platejs/caption
```

`@platejs/callout` and `@platejs/toggle` are optional peers: without them those two blocks
round-trip as plain Markdown instead of as their own types.

## What is in it

**The contract.** `DocumentProvider` is the whole I/O surface: `getMeta`, `getTree`, `getPage`,
`savePage`, `updateMeta`, `createPage`, `movePage`, `deletePage`, plus the optional `uploadAsset`,
`search` and `subscribe`. `ProviderCapabilities` says which of those a backend actually has, and
the UI hides what is missing rather than failing at the click. `CONTRACT_VERSION` and
`CONTRACT_SCHEMAS` are the Zod schemas for every payload, and `contract/openapi.json` at the repo
root is generated from them.

```ts
import { runProviderConformance } from '@hmzisb/notion-docs-core/testing';

runProviderConformance(async () => createMyProvider(...), { name: 'my-api' });
```

That suite is the definition of "my backend works": ordering, id stability, conflict detection,
capability honesty, and the error codes each failure has to use.

**A file store instead of a provider.** If your backend is a folder of Markdown - a git repo, an S3
prefix, a local directory - implement `FileStore` (`list`, `readText`, `readBinary`, `writeText`, `writeBinary`, `remove`,
`move`, `exists`) and
`createFileStoreProvider` gives you the whole contract: index building, ordering, id derivation,
frontmatter, conflicts, and content search (titles first, then page bodies, capped at 2,000 files
and 4 MB per query).

```ts
import { createFileStoreProvider, MemoryFileStore } from '@hmzisb/notion-docs-core';

const provider = createFileStoreProvider(new MemoryFileStore({ 'index.md': '# Handbook\n' }));
```

**Tree operations.** `buildIndex` turns a snapshot into a lookup, and `applyInsert`, `applyMove`,
`applyRename`, `applyRemove`, `applyMeta` update it without a refetch, which is what makes an
optimistic move feel instant. Ordering is fractional (`nextOrder`, `midpointOrder`, `renumber`) so
a drop between two siblings rewrites one file, not the folder.

**The Markdown codec.** `markdownToValue` and `valueToMarkdown` (or `createCodec` for your own
stringify options) move between Markdown and Plate's value. Round-trip fidelity is the point: a save
of an untouched page writes the same bytes it read, and `classifyFidelity` reports what a page would
lose before an editor opens it.

## Rules it keeps

- Markdown files are canonical. Plate JSON is transient and never stored.
- `index.md` (or `README.md`) makes a folder a page; both forms of a folder page are understood.
- Ids are derived from paths, so a page keeps its identity across a reload and two clients agree
  without a database.
- Line endings and frontmatter key order survive a save untouched.

The full contract is [docs/03](https://github.com/hmzisb/notion-style-md-docs-editor/blob/main/docs/03-DATA-MODEL-AND-CONTRACTS.md); the round-trip rules are
[docs/05](https://github.com/hmzisb/notion-style-md-docs-editor/blob/main/docs/05-EDITOR.md).

MIT licensed.
