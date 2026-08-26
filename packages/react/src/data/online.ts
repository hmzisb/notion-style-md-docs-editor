import { useSyncExternalStore } from 'react';
import { useDocs } from './context.js';

const subscribe = (onChange: () => void): (() => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};

/** `navigator.onLine` as state. Server snapshot is `true`: an SSR pass renders the online UI. */
export const useOnline = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

export interface StructuralGate {
  /** Disable the control, and say why on hover and on focus. */
  offline: boolean;
  reason: string;
}

/**
 * D-05: create, move, delete, rename and icon all need the provider on the other end, so they
 * are turned off while the browser knows there is no network. Content edits are not gated -
 * the draft store keeps them and the save retries on its own (docs/04 section 3.4).
 */
export function useStructuralGate(): StructuralGate {
  const online = useOnline();
  const { strings } = useDocs();
  return { offline: !online, reason: strings['status.offlineActions'] };
}
