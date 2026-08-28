/** Root entry (docs/08 section 2). Data layer only; UI lives in the subpath entries. */
export { DocsProvider, useDocs } from './data/DocsProvider.js';
export { preloadEditor } from './editor-chunk.js';
export { createKeys, createNamespace, type DocsKeys } from './data/keys.js';
export {
  GC,
  SEARCH_MIN_QUERY,
  STALE,
  metaQuery,
  pageQuery,
  treeQuery,
  useMeta,
  usePage,
  useSearch,
  useTreeIndex,
  type UseSearchOptions,
} from './data/queries.js';
export {
  useCreatePage,
  useDeletePage,
  useMovePage,
  useSavePage,
  useUpdateMeta,
  type CreatePageVariables,
  type DeletePageVariables,
  type MovePageVariables,
  type SavePageVariables,
  type UpdateMetaVariables,
} from './data/mutations.js';
export { useDocumentSession, type DocumentSession, type SessionEditor } from './data/session.js';
export type { SessionState, SessionStatus } from './data/session-store.js';
export { MAX_RECENTS, useRecents, type Recent, type RecentsState } from './data/cache/recents.js';
export { useOnline } from './data/online.js';
export { DEFAULT_SIDEBAR_WIDTH, useSidebarStore, type SidebarState } from './data/sidebar-store.js';
export { defaultStrings, format, type DocsStrings } from './data/strings.js';
export type { DocsEvent, DocsEventHandler } from './data/events.js';
export type {
  DocsContextValue,
  DocsNavigation,
  DocsOptions,
  DocsProviderProps,
  PersistOptions,
} from './data/types.js';

export type * from '@hmzisb/notion-docs-core';
