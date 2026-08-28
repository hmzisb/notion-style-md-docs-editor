import type { NodeId } from '@hmzisb/notion-docs-core';
import { DRAFTS_STORE, createDocsStorage, type DocsStorage } from './cache/idb.js';

/**
 * L4 (docs/04 section 1): the unsaved body of one page, written 500 ms after the last
 * keystroke and deleted the moment the save lands. `baseVersion` is the version the edit
 * started from, which is what decides between the two restore paths in docs/04 section 3.3.
 */
export interface Draft {
  body: string;
  baseVersion: string | null;
  updatedAt: number;
}

export interface DraftStore {
  read: (id: NodeId) => Promise<Draft | null>;
  write: (id: NodeId, draft: Draft) => Promise<void>;
  remove: (id: NodeId) => Promise<void>;
}

export interface DraftStoreOptions {
  ns: string;
  /** `persist.drafts === false` turns the store into a no-op rather than a second code path. */
  enabled?: boolean;
  storage?: DocsStorage;
  onUnavailable?: () => void;
}

const noop: DraftStore = {
  read: () => Promise.resolve(null),
  write: () => Promise.resolve(),
  remove: () => Promise.resolve(),
};

function isDraft(value: unknown): value is Draft {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Record<string, unknown>;
  return (
    typeof draft.body === 'string' &&
    (typeof draft.baseVersion === 'string' || draft.baseVersion === null) &&
    typeof draft.updatedAt === 'number'
  );
}

/**
 * One store per namespace. The store owns a handle on an IndexedDB database, so every page of
 * an instance shares one rather than opening a connection per open page.
 */
const stores = new Map<string, DraftStore>();

export function draftStoreFor(options: DraftStoreOptions): DraftStore {
  let store = stores.get(options.ns);
  if (store === undefined) {
    store = createDraftStore(options);
    stores.set(options.ns, store);
  }
  return store;
}

export function createDraftStore({
  ns,
  enabled = true,
  storage,
  onUnavailable,
}: DraftStoreOptions): DraftStore {
  if (!enabled) return noop;
  const store = storage ?? createDocsStorage(DRAFTS_STORE, onUnavailable);
  const keyOf = (id: NodeId): string => `${ns}:d:${id}`;

  return {
    read: async (id) => {
      const raw = await store.getItem(keyOf(id));
      if (raw === undefined) return null;
      // A record written by an older schema, or half-written by a killed tab, is not worth an
      // exception in the open path: the file on disk is the source of truth either way.
      try {
        const parsed: unknown = JSON.parse(raw);
        return isDraft(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    write: (id, draft) => store.setItem(keyOf(id), JSON.stringify(draft)),
    remove: (id) => store.removeItem(keyOf(id)),
  };
}
