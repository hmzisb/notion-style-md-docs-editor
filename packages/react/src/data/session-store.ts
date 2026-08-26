import type { NodeId } from '@docs/core';
import { create, useStore, type StoreApi, type UseBoundStore } from 'zustand';

/** docs/04 section 3. */
export type SessionStatus =
  'clean' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'offline' | 'error' | 'draft';

export interface SessionState {
  status: SessionStatus;
  /** Epoch ms of the last successful save, for the "Saved {time}" tooltip (docs/06 section 9). */
  lastSavedAt: number | null;
  /** The version that save produced, so the watcher's echo of it is not a change (docs/04 section 5). */
  lastSavedVersion: string | null;
  /** Epoch ms the next offline retry is due, for "Next retry {time}". */
  retryAt: number | null;
  /** The value in the editor came from a draft, so the page opens with the draft banner. */
  draftRestored: boolean;
  /** A draft exists that was written against another version of the file (docs/04 section 3.3). */
  draftMismatch: boolean;
  /** When the draft behind either banner was written, for "Restored unsaved changes from ...". */
  draftAt: number | null;
  /** A save is scheduled. `dirty` without it is the paused state the pill labels (docs/06 section 9). */
  pending: boolean;
  error: unknown;
}

export const cleanSession: SessionState = {
  status: 'clean',
  lastSavedAt: null,
  lastSavedVersion: null,
  retryAt: null,
  draftRestored: false,
  draftMismatch: false,
  draftAt: null,
  pending: false,
  error: null,
};

interface SessionsState {
  sessions: Record<NodeId, SessionState>;
  patch: (id: NodeId, patch: Partial<SessionState>) => void;
  reset: (id: NodeId) => void;
}

/**
 * One store per namespace, in memory: the header, the sidebar and the `beforeunload` guard all
 * read a page's save status, and they outlive the editor that produced it (docs/04 section 3).
 */
const stores = new Map<string, UseBoundStore<StoreApi<SessionsState>>>();

export function sessionStoreFor(ns: string): UseBoundStore<StoreApi<SessionsState>> {
  let store = stores.get(ns);
  if (store === undefined) {
    store = create<SessionsState>()((set) => ({
      sessions: {},
      patch: (id, patch) => {
        set((state) => {
          const current = state.sessions[id] ?? cleanSession;
          // Every keystroke patches `dirty` over `dirty`. Handing back the same state keeps
          // the subscribers of a page that is already saving out of the typing path.
          const changed = (Object.keys(patch) as (keyof SessionState)[]).some(
            (key) => current[key] !== patch[key],
          );
          if (!changed && state.sessions[id] !== undefined) return state;
          return { sessions: { ...state.sessions, [id]: { ...current, ...patch } } };
        });
      },
      reset: (id) => {
        set((state) => {
          const { [id]: _dropped, ...rest } = state.sessions;
          return { sessions: rest };
        });
      },
    }));
    stores.set(ns, store);
  }
  return store;
}

/** Statuses that mean the file on disk is behind what the user typed. */
export const UNSAVED: readonly SessionStatus[] = [
  'dirty',
  'saving',
  'conflict',
  'offline',
  'error',
  'draft',
];

export const isUnsaved = (status: SessionStatus): boolean => UNSAVED.includes(status);

/** What the status pill and the banners render (docs/06 sections 9-10). `null` before first open. */
export function useSessionState(ns: string, id: NodeId | null): SessionState | null {
  return useStore(sessionStoreFor(ns), (state) =>
    id === null ? null : (state.sessions[id] ?? null),
  );
}

/** Whether any page of this instance has changes the store has not taken yet. */
export function hasUnsavedWork(ns: string): boolean {
  return Object.values(sessionStoreFor(ns).getState().sessions).some((session) =>
    isUnsaved(session.status),
  );
}
