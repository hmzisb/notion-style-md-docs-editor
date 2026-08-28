# @hmzisb/notion-docs-react

## 0.1.1

### Patch Changes

- 3b2dbab: `getOpfsRoot` answers `unsupported` on every browser that has no origin private file system.
  It checked that `navigator.storage` existed and then called `getDirectory` on it regardless,
  so a `StorageManager` older than OPFS threw a `TypeError` where the API promises a
  `ProviderError`.
- 92bce86: The command palette's Results group lists content matches only. A page the provider matched on
  its title is already a row under Pages, so it no longer appears twice, and the group stays hidden
  when a query has no content matches to show.
- 1d33424: The floating toolbar no longer draws over the page title. A selection in the first block put it
  above the editor, where the page header was, because `flip` measured against the scrolling
  ancestor rather than the editor's own box.

  A picture is now centred in its column, so the centred caption below it lines up with the
  picture. Left-aligned, a picture narrower than the column sat against the edge while its caption
  floated mid-page.

  The breadcrumb overflow menu is a chunk of its own. A trail deeper than three ancestors fetches
  it on the press; everything shallower never loads it, and the `./shell` entry drops from 96.9 kB
  to 88.3 kB gzipped.

## 0.1.0

### Minor Changes

- First release.

  `@hmzisb/notion-docs-core` ships the provider contract and its Zod schemas, the file-store semantics that turn a
  folder of Markdown into a document tree, fractional ordering, path-derived ids, frontmatter that
  survives a save, and a Plate codec whose round trip is byte-stable on an untouched page. A
  conformance suite under `@hmzisb/notion-docs-core/testing` is what a new backend is measured against.

  `@hmzisb/notion-docs-react` ships the UI over it: a virtualised page tree with drag, keyboard move and rename, a
  reader, a Plate editor behind a dynamic import, and a shell with breadcrumbs, command palette, icon
  picker, save status and the banners for conflict, offline, read-only and lossy pages. Drafts,
  queued saves and the query cache live in IndexedDB, so a reload paints from cache and an interrupted
  save finishes later. Adapters for memory, HTTP and the File System Access API are included.

### Patch Changes

- Updated dependencies
  - @hmzisb/notion-docs-core@0.1.0
