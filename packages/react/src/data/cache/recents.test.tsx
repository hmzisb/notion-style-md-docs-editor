import { MemoryFileStore, createFileStoreProvider } from '@docs/core';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DocsProvider } from '../DocsProvider.js';
import { createNamespace } from '../keys.js';
import type { DocsNavigation } from '../types.js';
import { MAX_RECENTS, useRecents, type RecentsState } from './recents.js';

const navigation: DocsNavigation = { activePageId: null, mode: 'read', navigate: () => undefined };
const provider = createFileStoreProvider(new MemoryFileStore({ 'index.md': '# Home\n' }));

const mount = (instanceId: string) =>
  renderHook(() => useRecents(), {
    wrapper: ({ children }: { children: ReactNode }): React.JSX.Element => (
      <DocsProvider provider={provider} navigation={navigation} instanceId={instanceId}>
        {children}
      </DocsProvider>
    ),
  });

describe('recents (L6)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('records newest first with a timestamp', () => {
    const { result } = mount('order');

    act(() => {
      result.current.record('p_a', 1000);
      result.current.record('p_b', 2000);
    });

    expect(result.current.recents).toEqual([
      { id: 'p_b', at: 2000 },
      { id: 'p_a', at: 1000 },
    ]);
  });

  it('stamps the current time when none is given', () => {
    const { result } = mount('now');
    const before = Date.now();

    act(() => {
      result.current.record('p_a');
    });

    expect(result.current.recents[0]?.at).toBeGreaterThanOrEqual(before);
  });

  it('moves a page that is opened again to the front instead of duplicating it', () => {
    const { result } = mount('dedupe');

    act(() => {
      result.current.record('p_a', 1000);
      result.current.record('p_b', 2000);
      result.current.record('p_a', 3000);
    });

    expect(result.current.recents).toEqual([
      { id: 'p_a', at: 3000 },
      { id: 'p_b', at: 2000 },
    ]);
  });

  it('keeps at most twelve and drops the oldest', () => {
    const { result } = mount('cap');

    act(() => {
      for (let index = 0; index < MAX_RECENTS + 3; index += 1) {
        result.current.record(`p_${String(index)}`, index);
      }
    });

    expect(MAX_RECENTS).toBe(12);
    expect(result.current.recents).toHaveLength(MAX_RECENTS);
    expect(result.current.recents.at(0)?.id).toBe('p_14');
    expect(result.current.recents.at(-1)?.id).toBe('p_3');
  });

  it('removes one and clears all', () => {
    const { result } = mount('remove');

    act(() => {
      result.current.record('p_a', 1);
      result.current.record('p_b', 2);
      result.current.remove('p_a');
    });
    expect(result.current.recents.map((recent) => recent.id)).toEqual(['p_b']);

    act(() => {
      result.current.clear();
    });
    expect(result.current.recents).toEqual([]);
  });

  it('persists under the instance namespace', () => {
    const { result } = mount('persisted');
    act(() => {
      result.current.record('p_a', 1);
    });

    const ns = createNamespace('persisted', provider.key);
    const persisted = JSON.parse(localStorage.getItem(`${ns}:recents`) ?? '{}') as {
      state: RecentsState;
    };

    expect(persisted.state.recents).toEqual([{ id: 'p_a', at: 1 }]);
  });
});
