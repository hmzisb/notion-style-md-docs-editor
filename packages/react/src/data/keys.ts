import { fnv1a64, type NodeId } from '@docs/core';

/**
 * Cache namespace (docs/02 section 6). Everything the module stores - query keys, IndexedDB
 * records, drafts, localStorage - starts with this string, so two instances on one page, or
 * one app switching folders, can never read each other's data.
 */
export const createNamespace = (instanceId: string, providerKey: string): string =>
  `docs:${instanceId}:${fnv1a64(providerKey)}`;

/** docs/04 section 7. */
export const createKeys = (ns: string) => ({
  all: [ns] as const,
  meta: [ns, 'meta'] as const,
  tree: (rootId?: NodeId) => [ns, 'tree', rootId ?? '*'] as const,
  page: (id: NodeId) => [ns, 'page', id] as const,
  search: (q: string) => [ns, 'search', q] as const,
});

export type DocsKeys = ReturnType<typeof createKeys>;
