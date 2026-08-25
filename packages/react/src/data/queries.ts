import { buildIndex, type NodeId, type TreeIndex, type TreeSnapshot } from '@docs/core';
import type { BackendMeta, DocumentProvider, PageDocument } from '@docs/core';
import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import { queryPersister } from './cache/persister.js';
import { useDocs } from './context.js';
import type { DocsKeys } from './keys.js';

/** docs/04 section 1. Meta never goes stale on its own; the tree and pages revalidate. */
const MINUTE = 60_000;
export const STALE = { meta: Infinity, tree: 30 * 1000, page: 5 * MINUTE } as const;
export const GC = { meta: 24 * 60 * MINUTE, tree: 24 * 60 * MINUTE, page: 30 * MINUTE } as const;

export const metaQuery = (provider: DocumentProvider, keys: DocsKeys) =>
  queryOptions({
    queryKey: keys.meta,
    queryFn: (): Promise<BackendMeta> => provider.getMeta(),
    staleTime: STALE.meta,
    gcTime: GC.meta,
  });

export const treeQuery = (provider: DocumentProvider, keys: DocsKeys, rootId?: NodeId) =>
  queryOptions({
    queryKey: keys.tree(rootId),
    queryFn: (): Promise<TreeSnapshot> =>
      provider.getTree(rootId === undefined ? undefined : { rootId }),
    staleTime: STALE.tree,
    gcTime: GC.tree,
  });

export const pageQuery = (provider: DocumentProvider, keys: DocsKeys, id: NodeId) =>
  queryOptions({
    queryKey: keys.page(id),
    queryFn: (): Promise<PageDocument> => provider.getPage(id),
    staleTime: STALE.page,
    gcTime: GC.page,
  });

export function useMeta(): UseQueryResult<BackendMeta> {
  const { provider, keys } = useDocs();
  return useQuery(metaQuery(provider, keys));
}

/**
 * The tree as a lookup index. `select` runs on every render and after every refetch, so it
 * memoizes on the snapshot version: a refetch that returns the same tree hands back the same
 * `TreeIndex` object, and the rows that depend on it do not re-render (docs/04 section 1).
 */
export function useTreeIndex(rootId?: NodeId): UseQueryResult<TreeIndex> {
  const { keys, persister, provider } = useDocs();
  const select = useMemo(() => {
    let cached: TreeIndex | undefined;
    return (snapshot: TreeSnapshot): TreeIndex => {
      if (cached?.version !== snapshot.version) cached = buildIndex(snapshot);
      return cached;
    };
  }, []);
  return useQuery({
    ...treeQuery(provider, keys, rootId),
    select,
    persister: queryPersister<TreeSnapshot, ReturnType<DocsKeys['tree']>>(persister),
  });
}

/** `null` while no page is open: the query stays idle rather than fetching a missing id. */
export function usePage(id: NodeId | null): UseQueryResult<PageDocument> {
  const { keys, persister, provider } = useDocs();
  return useQuery({
    ...pageQuery(provider, keys, id ?? ''),
    enabled: id !== null,
    persister: queryPersister<PageDocument, ReturnType<DocsKeys['page']>>(persister),
  });
}
