# 08. Public API and Integration

## 1. Install (Tailwind v4 host)

```bash
pnpm add @docs/react @docs/core @tanstack/react-query platejs   # plus the @platejs/* peers listed in @docs/react's peerDependencies
```

```css
/* app.css */
@import "tailwindcss";
@source "../node_modules/@docs/react/dist";
@import "@docs/react/styles.css";
/* host without shadcn variables: */
@import "@docs/react/theme.css";
```

Non-Tailwind host: import only `@docs/react/styles.css` (precompiled, scoped, no preflight) and optionally `theme.css`.

## 2. Exports

```ts
// @docs/react
export { DocsProvider, useDocs, preloadEditor } from './data/DocsProvider';
export { createKeys } from './data/keys';
export { metaQuery, treeQuery, pageQuery, useMeta, useTreeIndex, usePage, useSearch } from './data/queries';
export { useSavePage, useUpdateMeta, useCreatePage, useMovePage, useDeletePage } from './data/mutations';
export { useDocumentSession } from './data/session';
export { useSidebarStore } from './data/sidebar-store';
export { useRecents } from './data/cache/recents';
export { useOnline } from './data/online';
export { defaultStrings } from './data/strings';
export type { DocsNavigation, DocsEvent, DocsStrings, DocsProviderProps } from './types';
export type * from '@docs/core';

// subpaths
'@docs/react/tree'               PageTree, PageTreeProps
'@docs/react/editor'             DocumentEditor, DocumentEditorProps, EditorErrorBoundary
'@docs/react/view'               DocumentView, DocumentViewProps
'@docs/react/shell'              DocsShell, Sidebar, PageHeader, Breadcrumbs, PageTitle, PageIcon, IconPicker,
                                 CommandPalette, SaveStatus, ModeToggle, banners, EmptyState
'@docs/react/adapters/http'      createHttpProvider
'@docs/react/adapters/filesystem' createFileSystemProvider, pickDirectory, getOpfsRoot, exportToDirectory, importFromDirectory
'@docs/react/adapters/memory'    createMemoryProvider
'@docs/react/styles.css', '@docs/react/theme.css'

// @docs/core
models, DocumentProvider, FileStore, createFileStoreProvider, MemoryFileStore, buildIndex + apply*, splitFrontmatter,
joinFrontmatter, resolvePageLink, createCodec, markdownToValue, valueToMarkdown, classifyFidelity, errors, schemas,
CONTRACT_VERSION, generateId, pathHashId
'@docs/core/testing'             runProviderConformance, loadCorpus
```

## 3. `DocsProvider`

```ts
interface DocsProviderProps {
  provider: DocumentProvider;
  navigation: DocsNavigation;
  instanceId?: string;                 // default 'default'; part of every namespace
  queryClient?: QueryClient;           // reuse the host's; otherwise internal
  strings?: Partial<DocsStrings>;
  onEvent?: (e: DocsEvent) => void;
  guardUnload?: boolean;               // beforeunload prompt while dirty; default true
  persist?: boolean | { queries?: boolean; drafts?: boolean; maxAgeMs?: number };   // default true
  codec?: CodecOptions;                // remark stringify overrides, math
  openExternalLinksInNewTab?: boolean; // default true
  allowDataImages?: boolean;           // default false
  sanitizeMarkdown?: (body: string) => string;
  children: React.ReactNode;
}

interface DocsNavigation {
  activePageId: NodeId | null;
  mode: PageMode;
  navigate(to: { pageId: NodeId | null; mode?: PageMode }, opts?: { replace?: boolean }): void;
  href?(to: { pageId: NodeId; mode?: PageMode }): string;   // real <a> links in the tree and breadcrumbs when provided
}

type DocsEvent =
  | { type: 'page:open'; id: NodeId }
  | { type: 'page:saved'; id: NodeId; version: string; bytes: number; ms: number }
  | { type: 'page:conflict'; id: NodeId }
  | { type: 'page:created' | 'page:deleted' | 'page:moved' | 'page:renamed'; id: NodeId }
  | { type: 'draft:restored'; id: NodeId }
  | { type: 'tree:renumbered'; count: number }
  | { type: 'warning'; code: 'storage_unavailable' | 'duplicate_id' | 'lossy_document' | 'large_page'; id?: NodeId; details?: unknown }
  | { type: 'error'; code: ProviderErrorCode | 'editor_crash'; id?: NodeId; error: unknown };
```

`DocsProvider` re-keys its subtree on `instanceId` or `provider.key` change. `useDocs()` returns `{ provider, navigation, ns, keys, strings, onEvent, capabilities, meta }`.

## 4. `DocsShell`

```ts
interface DocsShellProps {
  pageId: NodeId | null;
  mode: PageMode;
  rootId?: NodeId;
  slots?: { sidebarHeader?: ReactNode; sidebarFooter?: ReactNode; headerActions?: ReactNode; emptyState?: ReactNode; pageMenuItems?: ReactNode };
  sidebar?: { defaultWidth?: number; minWidth?: number; maxWidth?: number; collapsible?: boolean; defaultCollapsed?: boolean };
  editor?: { toolbar?: 'floating' | 'fixed' | 'none'; preload?: 'idle' | 'hover' | 'never' };
  onThemeChange?: (theme: 'light' | 'dark' | 'system') => void;   // enables the palette action
  className?: string;                  // applied to .docs-root
}
```

Composing without the shell: use `PageTree`, `PageHeader`, `DocumentEditor`/`DocumentView`, and `useDocumentSession` directly. `PageTree` gets `activeId`, `onOpen`, `rootId`; it knows nothing about routes. `DocumentEditor` gets `value`, `readOnly`, `onChange`, `onRequestEdit`; it knows nothing about saving. `useDocumentSession(page)` is the only code that knows both.

## 5. Component props (essentials)

```ts
interface PageTreeProps { activeId: NodeId | null; onOpen: (id: NodeId, opts?: { mode?: PageMode }) => void; rootId?: NodeId; className?: string }
interface DocumentEditorProps { pageId: NodeId; value: Value; readOnly: boolean; onChange: (v: Value) => void; onReady?: (editor: PlateEditor) => void; onRequestEdit?: () => void; page: TreeNode; toolbar?: 'floating' | 'fixed' | 'none'; autoFocus?: boolean | 'title-next' }
// `value` is the initial value only (Plate semantics). External resets (conflict Reload, silent refresh while clean, draft Discard)
// go through the editor instance handed to `onReady`: `editor.tf.setValue(next)` plus `editor.history` reset. The session owns that ref.
interface DocumentViewProps { page: PageDocument; node: TreeNode; rootId?: NodeId; className?: string }
```

## 6. Strings

`DocsStrings` is a flat object of every user-facing string (≈120 keys), each with an English default. Interpolation uses `{name}` placeholders and a tiny `format()` helper; no i18n dependency. Keys are grouped by prefix: `tree.*`, `header.*`, `status.*`, `banner.*`, `empty.*`, `dialog.*`, `menu.*`, `palette.*`, `editor.*`, `error.*`.

## 7. Adapters

```ts
createHttpProvider({ baseUrl, fetch?, headers?, credentials?, rootId?, events?: 'sse' | 'poll' | 'none', pollIntervalMs? }): DocumentProvider
createFileSystemProvider(handle: FileSystemDirectoryHandle, opts?: { key?: string; title?: string; indexCache?: boolean; watch?: boolean; readOnly?: boolean; onProgress?: (p: { done: number; total: number }) => void }): DocumentProvider
// onProgress fires during the first (uncached) index build so the shell can show "Indexing 1,240 / 5,000 pages" under the tree skeleton.
createMemoryProvider(seed: { files: Record<string, string> } | { tree: TreeSnapshot; pages: Record<NodeId, PageDocument> }, opts?: { capabilities?: Partial<ProviderCapabilities>; latencyMs?: number; failNext?: ProviderErrorCode }): DocumentProvider

pickDirectory(opts?: { mode?: 'read' | 'readwrite'; id?: string }): Promise<FileSystemDirectoryHandle | null>   // wraps showDirectoryPicker; persists the handle in IndexedDB under id for reuse after reload (permission re-requested on user gesture)
getOpfsRoot(subdir?: string): Promise<FileSystemDirectoryHandle>
exportToDirectory(from: FileSystemDirectoryHandle, to: FileSystemDirectoryHandle): Promise<void>
importFromDirectory(from: FileSystemDirectoryHandle, to: FileSystemDirectoryHandle, opts?: { clear?: boolean }): Promise<void>
```

Browser support note (documented in the package README): the File System Access picker is Chromium-only; OPFS works in all evergreen browsers. Unsupported → the playground hides "Open folder" and explains why.

## 8. Integration recipes

### 8.1 Vite + TanStack Router (the playground shape)

```tsx
// navigation-adapter.ts
export function useDocsNavigation(): DocsNavigation {
  const navigate = useNavigate();
  const { pageId } = useParams({ strict: false });
  const { mode } = useSearch({ strict: false });
  return useMemo(() => ({
    activePageId: pageId ?? null,
    mode: mode ?? 'read',
    navigate: (to, opts) => to.pageId
      ? navigate({ to: '/p/$pageId', params: { pageId: to.pageId }, search: { mode: to.mode ?? 'read' }, replace: opts?.replace })
      : navigate({ to: '/', replace: opts?.replace }),
    href: to => `/p/${to.pageId}?mode=${to.mode ?? 'read'}`,
  }), [navigate, pageId, mode]);
}

// routes/page.tsx
export function PageRoute() {
  const nav = useDocsNavigation();
  const provider = useProviderFromMode();     // demo | folder | opfs | remote
  return (
    <DocsProvider provider={provider} navigation={nav} queryClient={queryClient}>
      <DocsShell pageId={nav.activePageId} mode={nav.mode} onThemeChange={setTheme} />
    </DocsProvider>
  );
}
```

Route config: `/` and `/p/$pageId` with `validateSearch: z.object({ mode: z.enum(['read', 'edit']).default('read') })`, `loader` calling `ensureQueryData(treeQuery)` and `ensureQueryData(pageQuery)`, `preload: 'intent'`, `pendingComponent` rendering the shell skeleton.

### 8.2 Laravel + Inertia page

```tsx
const provider = createHttpProvider({ baseUrl: '/api/docs', credentials: 'include',
  headers: () => ({ 'X-XSRF-TOKEN': decodeURIComponent(getCookie('XSRF-TOKEN') ?? '') }) });
export default function Show({ pageId, mode }) {
  const navigation: DocsNavigation = { activePageId: pageId, mode,
    navigate: (to, o) => router.visit(route('docs.show', { page: to.pageId, mode: to.mode ?? 'read' }), { replace: o?.replace, preserveState: true }),
    href: to => route('docs.show', { page: to.pageId, mode: to.mode ?? 'read' }) };
  return <DocsProvider provider={provider} navigation={navigation} instanceId="product-docs"><DocsShell pageId={pageId} mode={mode} /></DocsProvider>;
}
```

### 8.3 Read-only help drawer (no editor bundle)

```tsx
import { DocsProvider, usePage, useTreeIndex } from '@docs/react';
import { PageTree } from '@docs/react/tree';
import { DocumentView } from '@docs/react/view';
const provider = createHttpProvider({ baseUrl: '/api/help', rootId: HELP_ROOT });   // backend reports write: false
export function HelpDrawer() {
  const [pageId, setPageId] = useState<string | null>(HELP_HOME);
  const navigation: DocsNavigation = { activePageId: pageId, mode: 'read', navigate: to => setPageId(to.pageId) };
  return (
    <DocsProvider provider={provider} navigation={navigation} instanceId="help" guardUnload={false}>
      <div className="docs-root grid h-full grid-cols-[240px_1fr]">
        <PageTree activeId={pageId} onOpen={setPageId} rootId={HELP_ROOT} />
        {pageId && <HelpPage id={pageId} />}
      </div>
    </DocsProvider>
  );
}
```

### 8.4 Local folder, zero backend

```tsx
const handle = await pickDirectory({ mode: 'readwrite', id: 'my-docs' });
const provider = createFileSystemProvider(handle, { indexCache: true, watch: true });
```

### 8.5 Browser storage (OPFS) with import/export

```tsx
const root = await getOpfsRoot('workspace');
const provider = createFileSystemProvider(root, { key: 'opfs:workspace', title: 'Browser workspace' });
// later: await exportToDirectory(root, await pickDirectory({ mode: 'readwrite' }));
```
