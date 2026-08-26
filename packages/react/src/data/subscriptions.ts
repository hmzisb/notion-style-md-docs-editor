import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { sessionStoreFor } from './session-store.js';
import type { DocsContextValue } from './types.js';

/**
 * docs/04 section 5. A provider that watches its own storage tells the module when something
 * changed underneath it, and the answer is always the same: drop what the cache holds and let
 * the queries that are mounted fetch it again. What the open editor does about a page that
 * moved under it is the session's decision, not this one (docs/04 section 3.5).
 */
export function useProviderEvents({ capabilities, keys, ns, provider }: DocsContextValue): void {
  const client = useQueryClient();
  const watches = capabilities.subscribe && provider.subscribe !== undefined;

  useEffect(() => {
    if (!watches) return;
    return provider.subscribe?.((event) => {
      if (event.type === 'tree') {
        void client.invalidateQueries({ queryKey: [ns, 'tree'] });
        return;
      }
      // The watcher reporting our own save back to us: the cache already has that version,
      // and refetching it would start the loop again on the next save.
      const session = sessionStoreFor(ns).getState().sessions[event.id];
      if (session?.lastSavedVersion === event.version) return;
      void client.invalidateQueries({ queryKey: keys.page(event.id) });
    });
  }, [client, keys, ns, provider, watches]);
}
