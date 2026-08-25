import { useSyncExternalStore } from 'react';
import type * as EditorEntry from './editor/index.js';

type EditorModule = typeof EditorEntry;

let loaded: EditorModule | null = null;
let inflight: Promise<EditorModule> | null = null;
const listeners = new Set<() => void>();

/**
 * Loads `@docs/react/editor` (docs/05 section 8). Idempotent and safe to call from a hover
 * handler on every pointer move: the first call owns the import, the rest await the same
 * promise. Hosts that compose their own layout call it whenever they like.
 */
export function preloadEditor(): Promise<EditorModule> {
  inflight ??= import('./editor/index.js').then((module) => {
    loaded = module;
    for (const listener of listeners) listener();
    return module;
  });
  return inflight;
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = (): EditorModule | null => loaded;
// The chunk cannot be loaded during SSR, so the server always renders the read view.
const serverSnapshot = (): null => null;

/** The editor chunk once it is in, `null` until then. Re-renders the caller when it lands. */
export function useEditorChunk(): EditorModule | null {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
