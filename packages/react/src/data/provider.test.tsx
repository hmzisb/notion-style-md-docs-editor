import {
  MemoryFileStore,
  createFileStoreProvider,
  fnv1a64,
  type DocumentProvider,
} from '@hmzisb/notion-docs-core';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DocsProvider, useDocs } from './DocsProvider.js';
import { createKeys, createNamespace } from './keys.js';
import { defaultStrings } from './strings.js';
import type { DocsEvent } from './events.js';
import type { DocsNavigation, DocsProviderProps } from './types.js';

const seed = {
  'index.md': '---\nid: p_home\ntitle: Home\n---\n\n# Home\n',
  'guide.md': '---\nid: p_guide\ntitle: Guide\n---\n\n# Guide\n',
};

const makeProvider = (key?: string): DocumentProvider =>
  createFileStoreProvider(new MemoryFileStore(seed, key === undefined ? {} : { key }));

const navigation: DocsNavigation = {
  activePageId: null,
  mode: 'read',
  navigate: () => undefined,
};

const wrapperFor =
  (props: Partial<DocsProviderProps> & { provider: DocumentProvider }) =>
  ({ children }: { children: ReactNode }) => (
    <DocsProvider navigation={navigation} {...props}>
      {children}
    </DocsProvider>
  );

describe('namespace', () => {
  it('is instance id plus a hash of the provider key', () => {
    const provider = makeProvider();
    const { result } = renderHook(() => useDocs(), { wrapper: wrapperFor({ provider }) });

    expect(result.current.ns).toBe(`docs:default:${fnv1a64(provider.key)}`);
    expect(result.current.keys.page('p_home')).toEqual([result.current.ns, 'page', 'p_home']);
  });

  it('separates two instances over the same provider', () => {
    const provider = makeProvider();
    const one = renderHook(() => useDocs(), { wrapper: wrapperFor({ provider }) });
    const two = renderHook(() => useDocs(), {
      wrapper: wrapperFor({ provider, instanceId: 'second' }),
    });

    expect(one.result.current.ns).not.toBe(two.result.current.ns);
    expect(createNamespace('second', provider.key)).toBe(two.result.current.ns);
  });

  it('remounts the subtree when the provider identity changes', async () => {
    function Counter(): React.JSX.Element {
      const [n] = useState(() => Math.random());
      return <span data-testid="instance">{String(n)}</span>;
    }
    function Host({ provider }: { provider: DocumentProvider }): React.JSX.Element {
      return (
        <DocsProvider provider={provider} navigation={navigation}>
          <Counter />
        </DocsProvider>
      );
    }

    const { rerender } = render(<Host provider={makeProvider('memory:a')} />);
    const first = screen.getByTestId('instance').textContent;

    rerender(<Host provider={makeProvider('memory:a')} />);
    expect(screen.getByTestId('instance').textContent).toBe(first);

    rerender(<Host provider={makeProvider('memory:b')} />);
    await waitFor(() => {
      expect(screen.getByTestId('instance').textContent).not.toBe(first);
    });
  });
});

describe('strings', () => {
  it('merges an override over the defaults', () => {
    const { result } = renderHook(() => useDocs(), {
      wrapper: wrapperFor({ provider: makeProvider(), strings: { 'tree.label': 'Docs' } }),
    });

    expect(result.current.strings['tree.label']).toBe('Docs');
    expect(result.current.strings['tree.empty']).toBe(defaultStrings['tree.empty']);
    // The default object itself is never mutated.
    expect(defaultStrings['tree.label']).toBe('Pages');
  });
});

describe('onEvent', () => {
  it('keeps one emitter identity while calling the latest handler', () => {
    const first = vi.fn();
    const second = vi.fn();
    function Host({ onEvent }: { onEvent: (e: DocsEvent) => void }): React.JSX.Element {
      return (
        <DocsProvider provider={provider} navigation={navigation} onEvent={onEvent}>
          <Probe />
        </DocsProvider>
      );
    }
    let emit: ((e: DocsEvent) => void) | undefined;
    function Probe(): null {
      emit = useDocs().onEvent;
      return null;
    }
    const provider = makeProvider();

    const { rerender } = render(<Host onEvent={first} />);
    const identity = emit;
    rerender(<Host onEvent={second} />);

    expect(emit).toBe(identity);
    emit?.({ type: 'page:open', id: 'p_home' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ type: 'page:open', id: 'p_home' });
  });

  it('rethrows a throwing host handler on its own task instead of breaking render', () => {
    const boom = new Error('host blew up');
    const queued: (() => void)[] = [];
    vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((fn: () => void) => {
      queued.push(fn);
    });

    const { result } = renderHook(() => useDocs(), {
      wrapper: wrapperFor({
        provider: makeProvider(),
        onEvent: () => {
          throw boom;
        },
      }),
    });

    expect(() => {
      result.current.onEvent({ type: 'page:open', id: 'p_home' });
    }).not.toThrow();
    expect(queued).toHaveLength(1);
    expect(() => {
      queued[0]?.();
    }).toThrow(boom);
    vi.restoreAllMocks();
  });

  it('reports a failing getMeta to the host', async () => {
    const provider = makeProvider();
    const failing: DocumentProvider = {
      ...provider,
      getMeta: () => Promise.reject(new Error('offline')),
    };
    const onEvent = vi.fn();
    // No retry: this test is about the event, not about how long a read waits for one.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderHook(() => useDocs(), {
      wrapper: wrapperFor({ provider: failing, onEvent, queryClient }),
    });

    await waitFor(() => {
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', code: 'internal' }),
      );
    });
  });
});

describe('query client', () => {
  it('uses the host client when given one', async () => {
    const provider = makeProvider();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderHook(() => useDocs(), { wrapper: wrapperFor({ provider, queryClient: client }) });

    const keys = createKeys(createNamespace('default', provider.key));
    await waitFor(() => {
      expect(client.getQueryData(keys.meta)).toBeDefined();
    });
  });

  it('creates one otherwise, retrying reads once and mutations never', () => {
    const { result } = renderHook(() => useQueryClient(), {
      wrapper: wrapperFor({ provider: makeProvider() }),
    });

    const defaults = result.current.getDefaultOptions();
    expect(defaults.queries?.retry).toBe(1);
    expect(defaults.mutations?.retry).toBe(false);
  });
});

describe('context', () => {
  it('falls back to the provider capabilities until getMeta resolves, then uses meta', async () => {
    const provider = makeProvider();
    const { result } = renderHook(() => useDocs(), { wrapper: wrapperFor({ provider }) });

    expect(result.current.meta).toBeNull();
    expect(result.current.capabilities).toBe(provider.capabilities);

    await waitFor(() => {
      expect(result.current.meta).not.toBeNull();
    });
    expect(result.current.capabilities).toEqual(result.current.meta?.capabilities);
  });

  it('resolves the behavior options with their documented defaults', () => {
    const { result } = renderHook(() => useDocs(), {
      wrapper: wrapperFor({ provider: makeProvider(), allowDataImages: true }),
    });

    expect(result.current.options).toEqual({
      guardUnload: true,
      persist: true,
      codec: undefined,
      openExternalLinksInNewTab: true,
      allowDataImages: true,
      sanitizeMarkdown: undefined,
    });
  });

  it('throws a useful error outside the provider', () => {
    expect(() => renderHook(() => useDocs())).toThrow(/useDocs must be used inside/);
  });
});

describe('storage (docs/04 section 8)', () => {
  it('tells the host when the browser will not give it a database', async () => {
    // Every route into IndexedDB goes through `open`: private mode, a full quota, a policy.
    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new DOMException('SecurityError', 'SecurityError');
      },
    });
    const events: DocsEvent[] = [];
    renderHook(() => useDocs(), {
      wrapper: wrapperFor({
        provider: makeProvider(),
        persist: true,
        onEvent: (event) => events.push(event),
      }),
    });

    // The first thing to touch the database is the idle sweep the provider schedules.
    await waitFor(
      () => {
        expect(events).toContainEqual({ type: 'warning', code: 'storage_unavailable' });
      },
      { timeout: 3000 },
    );
    vi.unstubAllGlobals();
  });
});
