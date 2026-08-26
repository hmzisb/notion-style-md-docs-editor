import { MemoryFileStore, createFileStoreProvider, type DocumentProvider } from '@docs/core';
import { QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DocsProvider } from './DocsProvider.js';
import { createKeys, createNamespace } from './keys.js';
import {
  GC,
  STALE,
  metaQuery,
  pageQuery,
  treeQuery,
  useMeta,
  usePage,
  useTreeIndex,
} from './queries.js';
import { useOnline } from './online.js';
import type { DocsNavigation } from './types.js';

const seed = {
  'index.md': '---\nid: p_home\ntitle: Home\n---\n\n# Home\n',
  'guide.md': '---\nid: p_guide\ntitle: Guide\n---\n\n# Guide\n\nBody.\n',
};

const navigation: DocsNavigation = { activePageId: null, mode: 'read', navigate: () => undefined };

function setup(): {
  provider: DocumentProvider;
  client: QueryClient;
  wrapper: ({ children }: { children: ReactNode }) => React.JSX.Element;
} {
  const provider = createFileStoreProvider(new MemoryFileStore(seed));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }): React.JSX.Element => (
    <DocsProvider provider={provider} navigation={navigation} queryClient={client}>
      {children}
    </DocsProvider>
  );
  return { provider, client, wrapper };
}

describe('query options', () => {
  const provider = createFileStoreProvider(new MemoryFileStore(seed));
  const keys = createKeys('docs:default:test');

  it('pins the lifetimes from docs/04 section 1', () => {
    expect(metaQuery(provider, keys)).toMatchObject({
      queryKey: keys.meta,
      staleTime: Infinity,
      gcTime: GC.meta,
    });
    expect(treeQuery(provider, keys)).toMatchObject({
      queryKey: ['docs:default:test', 'tree', '*'],
      staleTime: STALE.tree,
      gcTime: GC.tree,
    });
    expect(treeQuery(provider, keys, 'p_home').queryKey).toEqual([
      'docs:default:test',
      'tree',
      'p_home',
    ]);
    expect(pageQuery(provider, keys, 'p_home')).toMatchObject({
      queryKey: keys.page('p_home'),
      staleTime: STALE.page,
      gcTime: GC.page,
    });
  });

  it('is 30 s for the tree and 5 min for a page', () => {
    expect(STALE.tree).toBe(30_000);
    expect(STALE.page).toBe(300_000);
    expect(GC.page).toBe(1_800_000);
    expect(GC.tree).toBe(86_400_000);
  });
});

describe('useMeta', () => {
  it('reads the backend contract and capabilities', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useMeta(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.capabilities.write).toBe(true);
  });
});

describe('useTreeIndex', () => {
  it('builds an index the tree can look pages up in', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useTreeIndex(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    const index = result.current.data;
    expect(index?.byId.p_guide?.title).toBe('Guide');
    expect(index?.idByPath['guide.md']).toBe('p_guide');
  });

  it('hands back the same index while the version holds, a new one when it moves', async () => {
    const { provider, client, wrapper } = setup();
    const { result, rerender } = renderHook(() => useTreeIndex(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    const first = result.current.data;

    rerender();
    expect(result.current.data).toBe(first);

    // A refetch that finds the same tree must not hand the tree new object identities.
    await act(async () => {
      await client.refetchQueries({ queryKey: [createNamespace('default', provider.key), 'tree'] });
    });
    expect(result.current.data).toBe(first);

    await act(async () => {
      await provider.createPage({ parentId: null, title: 'Fresh' });
      await client.refetchQueries({ queryKey: [createNamespace('default', provider.key), 'tree'] });
    });
    await waitFor(() => {
      expect(result.current.data).not.toBe(first);
    });
    expect(result.current.data?.version).not.toBe(first?.version);
    expect(Object.values(result.current.data?.byId ?? {}).map((node) => node.title)).toContain(
      'Fresh',
    );
  });
});

describe('usePage', () => {
  it('stays idle with no page open', () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => usePage(null), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
  });

  it('loads the document for an id', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => usePage('p_guide'), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.body).toContain('# Guide');
    expect(result.current.data?.id).toBe('p_guide');
    expect(result.current.data?.version).toMatch(/^sha256:/);
  });
});

describe('useOnline', () => {
  it('follows the browser', async () => {
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);

    const offline = { get: () => false, configurable: true };
    Object.defineProperty(window.navigator, 'onLine', offline);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    await waitFor(() => {
      expect(result.current).toBe(false);
    });

    Object.defineProperty(window.navigator, 'onLine', { get: () => true, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });
});

describe('walk warnings (docs/08 section 3)', () => {
  it('tells the host about a duplicate id, once for the whole visit', async () => {
    const onEvent = vi.fn();
    const provider = createFileStoreProvider(
      new MemoryFileStore({
        'one.md': '---\nid: p_same\ntitle: One\n---\n\n# One\n',
        'two.md': '---\nid: p_same\ntitle: Two\n---\n\n# Two\n',
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }): React.JSX.Element => (
      <DocsProvider
        provider={provider}
        navigation={navigation}
        queryClient={client}
        instanceId="warnings"
        onEvent={onEvent}
      >
        {children}
      </DocsProvider>
    );

    const { result } = renderHook(() => useTreeIndex(), { wrapper });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'warning', code: 'duplicate_id' }),
    );

    // The walk repeats its warnings on every rebuild; the host hears each one once.
    onEvent.mockClear();
    await act(async () => {
      await client.refetchQueries();
    });
    expect(onEvent).not.toHaveBeenCalled();
  });
});
