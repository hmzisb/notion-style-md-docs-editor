/** Root entry (docs/08 section 2). Data layer only; UI lives in the subpath entries. */
export { DocsProvider, useDocs } from './data/DocsProvider.js';
export { preloadEditor } from './editor-chunk.js';
export { createKeys, createNamespace, type DocsKeys } from './data/keys.js';
export {
  GC,
  STALE,
  metaQuery,
  pageQuery,
  treeQuery,
  useMeta,
  usePage,
  useTreeIndex,
} from './data/queries.js';
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

export type * from '@docs/core';
