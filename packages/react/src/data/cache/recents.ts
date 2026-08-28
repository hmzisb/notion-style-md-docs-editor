import type { NodeId } from '@hmzisb/notion-docs-core';
import { useStore, type StoreApi } from 'zustand';
import { useDocs } from '../context.js';
import { perNamespace } from '../local-store.js';

/** docs/04 section 1, L6. The palette shows the first five (docs/06 section 12). */
export const MAX_RECENTS = 12;

export interface Recent {
  id: NodeId;
  /** Epoch milliseconds of the last open, so the palette can show a relative time. */
  at: number;
}

export interface RecentsState {
  recents: Recent[];
  /** Newest first, one entry per page: opening a page again moves it up and restamps it. */
  record: (id: NodeId, at?: number) => void;
  remove: (id: NodeId) => void;
  clear: () => void;
}

export const recentsStoreFor = perNamespace<RecentsState>('recents', (set) => ({
  recents: [],
  record: (id, at = Date.now()) => {
    set((state) => ({
      recents: [{ id, at }, ...state.recents.filter((recent) => recent.id !== id)].slice(
        0,
        MAX_RECENTS,
      ),
    }));
  },
  remove: (id) => {
    set((state) => ({ recents: state.recents.filter((recent) => recent.id !== id) }));
  },
  clear: () => {
    set({ recents: [] });
  },
}));

/** Recent pages for the current instance (L6). Without a selector the whole store comes back;
 *  its identity is stable, so that does not re-render on every change of an unrelated field. */
export function useRecents(): RecentsState;
export function useRecents<T>(selector: (state: RecentsState) => T): T;
export function useRecents<T>(selector?: (state: RecentsState) => T): T | RecentsState {
  const { ns } = useDocs();
  return useStore<StoreApi<RecentsState>, T | RecentsState>(
    recentsStoreFor(ns),
    selector ?? ((state) => state),
  );
}
