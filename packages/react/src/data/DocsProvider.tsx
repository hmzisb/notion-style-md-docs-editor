import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { isProviderError } from '@hmzisb/notion-docs-core';
import { createDocsPersister, resolvePersist, scheduleGc } from './cache/persister.js';
import { DocsContext, useDocs } from './context.js';
import { createEmitter, type DocsEventHandler } from './events.js';
import { createKeys, createNamespace } from './keys.js';
import { metaQuery } from './queries.js';
import { defaultStrings } from './strings.js';
import { useProviderEvents } from './subscriptions.js';
import type { DocsContextValue, DocsOptions, DocsProviderProps } from './types.js';

export { useDocs };

/**
 * docs/04 section 8: reads retry once, mutations never - the document session owns save
 * retries and needs to see the first failure to decide what to do with the draft.
 *
 * `offlineFirst` because the provider is the only thing that knows whether it is reachable:
 * an OPFS or memory workspace works perfectly well with the radio off, and Query's default
 * would pause every read of it and leave the shell on a skeleton (docs/04 section 3.4).
 */
const createInternalClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: 1, networkMode: 'offlineFirst' },
      mutations: { retry: false, networkMode: 'offlineFirst' },
    },
  });

export function DocsProvider(props: DocsProviderProps): React.JSX.Element {
  const { instanceId = 'default', provider, queryClient } = props;

  // Only built when the host does not bring its own client, and only once.
  const internal = useRef<QueryClient | null>(null);
  const client = queryClient ?? (internal.current ??= createInternalClient());

  const ns = useMemo(() => createNamespace(instanceId, provider.key), [instanceId, provider.key]);

  return (
    <QueryClientProvider client={client}>
      {/* A new namespace is a different workspace: remount rather than reconcile, so no
          component can hold state that belonged to the previous provider (docs/04 section 7). */}
      <DocsRoot key={ns} ns={ns} {...props} />
    </QueryClientProvider>
  );
}

function DocsRoot({ ns, ...props }: DocsProviderProps & { ns: string }): React.JSX.Element {
  const { children, navigation, provider } = props;

  // The emitter identity never changes, so consumers do not re-render when the host passes a
  // fresh closure; the call still reaches the latest one.
  const latest = useRef<DocsEventHandler | undefined>(props.onEvent);
  useEffect(() => {
    latest.current = props.onEvent;
  });
  const onEvent = useMemo(() => createEmitter((event) => latest.current?.(event)), []);

  const keys = useMemo(() => createKeys(ns), [ns]);
  const strings = useMemo(() => ({ ...defaultStrings, ...props.strings }), [props.strings]);

  const options = useMemo<DocsOptions>(
    () => ({
      guardUnload: props.guardUnload ?? true,
      persist: props.persist ?? true,
      codec: props.codec,
      openExternalLinksInNewTab: props.openExternalLinksInNewTab ?? true,
      allowDataImages: props.allowDataImages ?? false,
      sanitizeMarkdown: props.sanitizeMarkdown,
    }),
    [
      props.guardUnload,
      props.persist,
      props.codec,
      props.openExternalLinksInNewTab,
      props.allowDataImages,
      props.sanitizeMarkdown,
    ],
  );

  // One persister per namespace, set per query rather than on the client (docs/04 section 8),
  // so a host client shared with the rest of the app never persists anything of its own.
  const persist = resolvePersist(options.persist);
  const persister = useMemo(
    () =>
      persist.queries
        ? createDocsPersister({
            ns,
            maxAgeMs: persist.maxAgeMs,
            onUnavailable: () => {
              onEvent({ type: 'warning', code: 'storage_unavailable' });
            },
          })
        : null,
    [ns, persist.queries, persist.maxAgeMs, onEvent],
  );

  // After first paint, in idle time: drop records from another schema or past their max age.
  useEffect(() => (persister === null ? undefined : scheduleGc(persister)), [persister]);

  const meta = useQuery(metaQuery(provider, keys));

  // A backend the module cannot reach is the host's problem too: it may want to log it or
  // show its own chrome, and the UI card alone is not reachable from outside the module.
  const error: unknown = meta.error;
  useEffect(() => {
    if (error === undefined || error === null) return;
    onEvent({ type: 'error', code: isProviderError(error) ? error.code : 'internal', error });
  }, [error, onEvent]);

  const value = useMemo<DocsContextValue>(
    () => ({
      provider,
      navigation,
      ns,
      keys,
      strings,
      onEvent,
      capabilities: meta.data?.capabilities ?? provider.capabilities,
      meta: meta.data ?? null,
      options,
      persister,
    }),
    [provider, navigation, ns, keys, strings, onEvent, meta.data, options, persister],
  );

  useProviderEvents(value);

  return <DocsContext.Provider value={value}>{children}</DocsContext.Provider>;
}
