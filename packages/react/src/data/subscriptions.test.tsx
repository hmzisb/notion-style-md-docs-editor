import {
  MemoryFileStore,
  createFileStoreProvider,
  type ChangeEvent,
  type DocumentProvider,
} from '@hmzisb/notion-docs-core';
import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocsProvider } from './DocsProvider.js';
import { useDocs } from './context.js';
import { usePage, useTreeIndex } from './queries.js';
import { sessionStoreFor } from './session-store.js';
import type { DocsNavigation } from './types.js';

/**
 * docs/04 section 5: a provider that watches its own storage says what changed, and the module
 * drops what the cache holds for it - except when what changed is the save it just made.
 */

const files = {
  'one.md': '---\nid: p_one\ntitle: One\n---\n\nBody.\n',
};

let ns = '';
let instance = 0;

function Probe(): React.JSX.Element {
  ns = useDocs().ns;
  const tree = useTreeIndex();
  const page = usePage('p_one');
  return (
    <span data-testid="probe">
      {tree.data === undefined ? '' : tree.data.rootIds.length}|{page.data?.body.trim() ?? ''}
    </span>
  );
}

function mount(provider: DocumentProvider): void {
  const navigation: DocsNavigation = { activePageId: 'p_one', mode: 'read', navigate: vi.fn() };
  instance += 1;
  render(
    <DocsProvider
      provider={provider}
      navigation={navigation}
      instanceId={`subs-${String(instance)}`}
      queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      persist={false}
    >
      <Probe />
    </DocsProvider>,
  );
}

const probe = (): HTMLElement => screen.getByTestId('probe');

afterEach(() => {
  cleanup();
});

describe('useProviderEvents', () => {
  it('refetches the tree when the storage says it changed', async () => {
    const store = new MemoryFileStore({ ...files });
    mount(createFileStoreProvider(store));
    await waitFor(() => {
      expect(probe()).toHaveTextContent('1|Body.');
    });

    // A write nobody in the module made: the store's watcher is what reports it.
    await act(async () => {
      await store.writeText('two.md', '---\nid: p_two\ntitle: Two\n---\n\nSecond.\n');
    });

    await waitFor(() => {
      expect(probe()).toHaveTextContent('2|Body.');
    });
  });

  it('ignores the echo of the save the session just made', async () => {
    const base = createFileStoreProvider(new MemoryFileStore({ ...files }));
    const getPage = vi.fn((id: string) => base.getPage(id));
    let emit: (event: ChangeEvent) => void = () => undefined;
    const provider: DocumentProvider = {
      ...base,
      getPage,
      capabilities: { ...base.capabilities, subscribe: true },
      subscribe: (listener) => {
        emit = listener;
        return () => undefined;
      },
    };

    mount(provider);
    await waitFor(() => {
      expect(probe()).toHaveTextContent('1|Body.');
    });
    const reads = getPage.mock.calls.length;

    act(() => {
      sessionStoreFor(ns).getState().patch('p_one', { lastSavedVersion: 'v9' });
      emit({ type: 'page', id: 'p_one', version: 'v9' });
    });
    expect(getPage).toHaveBeenCalledTimes(reads);

    // Any other version is somebody else's write, and the page is read again.
    act(() => {
      emit({ type: 'page', id: 'p_one', version: 'v10' });
    });
    await waitFor(() => {
      expect(getPage.mock.calls.length).toBeGreaterThan(reads);
    });
  });
});
