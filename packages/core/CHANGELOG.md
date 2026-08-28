# @hmzisb/notion-docs-core

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
