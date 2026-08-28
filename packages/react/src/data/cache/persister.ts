import { CONTRACT_VERSION } from '@hmzisb/notion-docs-core';
import { experimental_createQueryPersister } from '@tanstack/query-persist-client-core';
import type { Query, QueryKey, QueryPersister } from '@tanstack/react-query';
import type { PersistOptions } from '../types.js';
import { QUERIES_STORE, createDocsStorage, type DocsStorage } from './idb.js';

/**
 * Bumped whenever what the module writes into IndexedDB changes shape. Together with the
 * contract version it is the `buster`: records written by another schema are ignored on read
 * and collected by `persisterGc` (docs/04 sections 1 and 6).
 */
export const CACHE_SCHEMA_VERSION = 1;

/** docs/04 section 1: seven days. */
export const PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export const cacheBuster = `${String(CACHE_SCHEMA_VERSION)}:${String(CONTRACT_VERSION)}`;

export type DocsPersister = ReturnType<typeof experimental_createQueryPersister<string>>;

export interface DocsPersisterOptions {
  ns: string;
  maxAgeMs?: number;
  /** Defaults to the module's own IndexedDB store; tests and hosts can pass their own. */
  storage?: DocsStorage;
  /** Called once when storage turns out to be unavailable (docs/04 section 6). */
  onUnavailable?: () => void;
}

/**
 * One persister per instance (docs/04 section 8: per query, never on the client). Only `tree`
 * and `page` queries are written: `meta` is cheap and must never be restored stale, and search
 * results go out of date the moment a page is saved.
 */
export function createDocsPersister({
  ns,
  maxAgeMs = PERSIST_MAX_AGE,
  storage,
  onUnavailable,
}: DocsPersisterOptions): DocsPersister {
  return experimental_createQueryPersister({
    storage: storage ?? createDocsStorage(QUERIES_STORE, onUnavailable),
    prefix: `${ns}:q`,
    buster: cacheBuster,
    maxAge: maxAgeMs,
    filters: { predicate: (query: Query) => isPersistable(query.queryKey) },
  });
}

/**
 * `persisterFn` is generic, and a generic in an object literal drives `useQuery`'s inference to
 * `unknown` for the whole query. Naming the data and key types here keeps the query typed.
 */
export function queryPersister<T, K extends QueryKey>(
  persister: DocsPersister | null,
): QueryPersister<T, K> | undefined {
  return persister?.persisterFn;
}

export const isPersistable = (queryKey: readonly unknown[]): boolean =>
  queryKey[1] === 'tree' || queryKey[1] === 'page';

/**
 * docs/04 section 6: collect other-schema and expired records after first paint, in idle time.
 * Returns a cancel function so a provider that unmounts first does not leave work queued.
 */
export function scheduleGc(persister: DocsPersister): () => void {
  const run = (): void => {
    void persister.persisterGc();
  };

  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(run, { timeout: 5000 });
    return () => {
      cancelIdleCallback(handle);
    };
  }
  const handle = setTimeout(run, 1000);
  return () => {
    clearTimeout(handle);
  };
}

/** `persist` is `true`, `false` or a per-layer object; this is the resolved form. */
export function resolvePersist(persist: PersistOptions): {
  queries: boolean;
  drafts: boolean;
  maxAgeMs: number;
} {
  if (typeof persist === 'boolean') {
    return { queries: persist, drafts: persist, maxAgeMs: PERSIST_MAX_AGE };
  }
  return {
    queries: persist.queries ?? true,
    drafts: persist.drafts ?? true,
    maxAgeMs: persist.maxAgeMs ?? PERSIST_MAX_AGE,
  };
}
