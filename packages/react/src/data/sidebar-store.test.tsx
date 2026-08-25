import { MemoryFileStore, createFileStoreProvider } from '@docs/core';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocsProvider } from './DocsProvider.js';
import { createNamespace } from './keys.js';
import { localStorageOrMemory } from './local-store.js';
import {
  DEFAULT_SIDEBAR_WIDTH,
  sidebarStoreFor,
  useSidebarStore,
  type SidebarState,
} from './sidebar-store.js';
import type { DocsNavigation } from './types.js';

const navigation: DocsNavigation = { activePageId: null, mode: 'read', navigate: () => undefined };
const provider = createFileStoreProvider(new MemoryFileStore({ 'index.md': '# Home\n' }));

const wrapperFor =
  (instanceId: string) =>
  ({ children }: { children: ReactNode }): React.JSX.Element => (
    <DocsProvider provider={provider} navigation={navigation} instanceId={instanceId}>
      {children}
    </DocsProvider>
  );

const nsFor = (instanceId: string): string => createNamespace(instanceId, provider.key);

const stored = (instanceId: string): SidebarState =>
  (
    JSON.parse(localStorage.getItem(`${nsFor(instanceId)}:sidebar`) ?? '{}') as {
      state: SidebarState;
    }
  ).state;

const mount = (instanceId: string) =>
  renderHook(() => useSidebarStore(), { wrapper: wrapperFor(instanceId) });

describe('sidebar store (L5)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts at the docs/06 defaults', () => {
    const { result } = mount('defaults');

    expect(result.current.collapsed).toBe(false);
    expect(result.current.width).toBe(DEFAULT_SIDEBAR_WIDTH);
    expect(result.current.expanded).toEqual({});
    expect(result.current.lastOpenedPageId).toBeNull();
  });

  it('expands and collapses folders one at a time and in bulk', () => {
    const { result } = mount('expand');

    act(() => {
      result.current.setExpanded('f_a', true);
      result.current.setExpanded('f_b', true);
    });
    expect(result.current.expanded).toEqual({ f_a: true, f_b: true });

    act(() => {
      result.current.setExpanded('f_a', false);
    });
    expect(result.current.expanded).toEqual({ f_b: true });

    act(() => {
      result.current.expandAll(['f_a', 'f_c']);
    });
    expect(Object.keys(result.current.expanded).sort()).toEqual(['f_a', 'f_b', 'f_c']);

    act(() => {
      result.current.collapseAll();
    });
    expect(result.current.expanded).toEqual({});
  });

  it('writes preferences to localStorage under the instance namespace', () => {
    const { result } = mount('persisted');

    act(() => {
      result.current.setWidth(320);
      result.current.toggleCollapsed();
      result.current.setExpanded('f_a', true);
      result.current.setLastOpenedPageId('p_home');
    });

    expect(stored('persisted')).toMatchObject({
      width: 320,
      collapsed: true,
      expanded: { f_a: true },
      lastOpenedPageId: 'p_home',
    });
  });

  it('keeps its state across a remount', () => {
    const first = mount('remount');
    act(() => {
      first.result.current.setWidth(300);
    });
    first.unmount();

    expect(mount('remount').result.current.width).toBe(300);
  });

  it('gives two instances separate preferences', () => {
    const a = mount('one');
    const b = mount('two');

    act(() => {
      a.result.current.setWidth(300);
    });

    expect(b.result.current.width).toBe(DEFAULT_SIDEBAR_WIDTH);
    expect(stored('one').width).toBe(300);
    // The untouched instance has nothing to persist yet, so it cannot have picked up the 300.
    expect(localStorage.getItem(`${nsFor('two')}:sidebar`)).toBeNull();
  });

  it('a selector keeps unrelated changes from re-rendering', () => {
    const renders = vi.fn();
    const { result } = renderHook(
      () => {
        renders();
        return useSidebarStore((state) => state.collapsed);
      },
      { wrapper: wrapperFor('selector') },
    );
    const before = renders.mock.calls.length;

    const store = sidebarStoreFor(nsFor('selector'));
    act(() => {
      store.getState().setExpanded('f_a', true);
    });
    expect(renders.mock.calls.length).toBe(before);

    act(() => {
      store.getState().setCollapsed(true);
    });
    expect(renders.mock.calls.length).toBeGreaterThan(before);
    expect(result.current).toBe(true);
  });
});

describe('SSR-safe storage', () => {
  it('falls back to memory when localStorage throws', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const storage = localStorageOrMemory();

    storage.setItem('a', '1');
    expect(storage.getItem('a')).toBe('1');
    storage.removeItem('a');
    expect(storage.getItem('a')).toBeNull();

    write.mockRestore();
    read.mockRestore();
  });
});
