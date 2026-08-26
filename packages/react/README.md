# @docs/react

A Notion-grade Markdown docs UI for React: page tree, reader, editor, shell, and the adapters that
put them over a backend you already have. Markdown files stay the source of truth - the module
never invents a storage format, and never saves a page the reader did not edit.

Frontend only. Every read and write goes through a `DocumentProvider` you pass in.

## Install

```bash
pnpm add @docs/react @docs/core @tanstack/react-query platejs
pnpm add @platejs/basic-nodes @platejs/callout @platejs/caption @platejs/code-block \
  @platejs/combobox @platejs/dnd @platejs/floating @platejs/indent @platejs/link \
  @platejs/list @platejs/media @platejs/resizable @platejs/selection \
  @platejs/slash-command @platejs/table @platejs/toggle
```

React 18.3 or 19. The `@platejs/*` packages are peers so that one copy of Plate is shared with
whatever else your app does with it.

Tailwind v4 host - point Tailwind at the package so its classes are compiled, then import the
stylesheet:

```css
/* app.css */
@import "tailwindcss";
@source "../node_modules/@docs/react/dist";
@import "@docs/react/styles.css";
@import "@docs/react/theme.css";   /* only if your app has no shadcn variables */
```

Host without Tailwind: import `@docs/react/styles.css` alone. It is precompiled, scoped to
`.docs-root`, and carries no preflight, so nothing outside the module changes.

## Quick start

```tsx
import { DocsProvider, type DocsNavigation } from '@docs/react';
import { DocsShell } from '@docs/react/shell';
import { createMemoryProvider } from '@docs/react/adapters/memory';
import { useMemo, useState } from 'react';

const provider = createMemoryProvider({
  files: { 'index.md': '# Handbook\n\nEverything a new joiner needs.\n' },
});

export function Docs() {
  const [at, setAt] = useState({ pageId: null, mode: 'read' as const });
  const navigation = useMemo<DocsNavigation>(
    () => ({
      activePageId: at.pageId,
      mode: at.mode,
      navigate: (to) => setAt({ pageId: to.pageId, mode: to.mode ?? 'read' }),
    }),
    [at],
  );

  return (
    <DocsProvider provider={provider} navigation={navigation}>
      <DocsShell pageId={at.pageId} mode={at.mode} className="h-dvh" />
    </DocsProvider>
  );
}
```

`navigation` is the only place the module talks to your router: it never touches `window.location`,
`document.title`, or a router of its own. Wire `navigate` to your links and the URL stays yours.

Composing instead of using the shell - the sidebar, the reader and the editor are separate entries,
and each is a plain component:

```tsx
import { PageTree } from '@docs/react/tree';
import { DocumentView } from '@docs/react/view';
import { usePage, useTreeIndex } from '@docs/react';
```

The full export list is in [docs/08](../../docs/08-PUBLIC-API.md), which a test keeps honest.

## Adapters

```ts
import { createMemoryProvider } from '@docs/react/adapters/memory';
import { createHttpProvider } from '@docs/react/adapters/http';
import { createFileSystemProvider, getOpfsRoot, pickDirectory } from '@docs/react/adapters/filesystem';
```

- **memory** - files in a JS object. Demos, tests, and the states that are hard to reproduce on a
  real backend: `latencyMs` makes skeletons visible, `failNext` makes an error path happen.
- **http** - your API, over the contract in [docs/03](../../docs/03-DATA-MODEL-AND-CONTRACTS.md). Give it a
  `baseUrl`, and `headers()` if requests need a token.
- **filesystem** - a local folder through the File System Access API, or the browser's own storage
  through OPFS. No server at all.

Any object that satisfies `DocumentProvider` from `@docs/core` works; the conformance suite in
`@docs/core/testing` tells you whether yours does.

## Theming

The module reads shadcn's CSS variables - `--background`, `--foreground`, `--primary`, `--border`,
`--sidebar*` and the rest. If your app defines them, the docs match your app on both themes with no
extra work. If it does not, `@docs/react/theme.css` supplies a neutral set.

Its own knobs are set on `.docs-root` and can be overridden there:

| Variable | Default | What it sizes |
| --- | --- | --- |
| `--docs-sidebar-width` | `240px` | the sidebar, between `--docs-sidebar-min` and `--docs-sidebar-max` |
| `--docs-header-height` | `44px` | the page header |
| `--docs-content-width` | `700px` | the reading column |
| `--docs-row-height` | `28px` | a tree row |
| `--docs-indent` | `12px` | one level of tree indent |
| `--docs-motion` | `150ms` | every transition; `0ms` under `prefers-reduced-motion` |

Dark mode follows whatever your app already does: the variables are read from the nearest ancestor
that sets them, so a `.dark` class or a `data-theme` attribute both work.

## Bundle

Gzipped, with React, Plate and TanStack Query treated as shared: `.` 14.5 kB, `./tree` + `./view`
38.9 kB, `./shell` 96.5 kB, `./editor` 213.9 kB. The editor is a dynamic import - a reader who never
presses **Edit** never downloads it - and the palette, icon picker, row menus and toasts split out
of the shell the same way.

## Browser support

Evergreen Chromium, Firefox and Safari. Two capabilities degrade rather than break:

- **File System Access** (the "open a folder" picker) is Chromium-only. Elsewhere the host should
  hide the entry point; `pickDirectory` returns `null` when the API is missing.
- **OPFS** (browser-owned storage) works in all three, and is the fallback for local editing.

Drafts, the offline cache and the save queue use IndexedDB. In a private window that refuses it, the
module keeps working in memory and says so through `onEvent`.

MIT licensed.
