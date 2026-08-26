import {
  ConflictError,
  MemoryFileStore,
  ProviderError,
  createFileStoreProvider,
  defaultCodec,
  type DocumentProvider,
  type PageDocument,
  type SaveResult,
  type TreeSnapshot,
} from '@docs/core';
import { QueryClient } from '@tanstack/react-query';
import { act, renderHook, type RenderHookResult } from '@testing-library/react';
import type { Value } from 'platejs';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { DocsProvider } from './DocsProvider.js';
import { draftStoreFor, type Draft } from './drafts.js';
import { createKeys, createNamespace, type DocsKeys } from './keys.js';
import {
  cleanSession,
  sessionStoreFor,
  type SessionState,
  type SessionStatus,
} from './session-store.js';
import { valueCache, valueCacheKey } from './cache/value-cache.js';
import type { DocsStorage } from './cache/idb.js';
import { forgetPage, useDocumentSession, type DocumentSession, type SessionEditor } from './session.js';
import type { DocsEvent } from './events.js';
import type { DocsNavigation } from './types.js';

const BODY = '# Guide\n\nBody.\n';
const V1 = 'sha256:v1';
const V2 = 'sha256:v2';

const page: PageDocument = {
  id: 'p_guide',
  meta: { id: 'p_guide', title: 'Guide' },
  body: BODY,
  version: V1,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const tree: TreeSnapshot = {
  version: 'tree-1',
  nodes: [
    { id: 'p_guide', kind: 'page', title: 'Guide', path: 'guide.md', parentId: null, childIds: [] },
  ],
};

const saved: SaveResult = { version: V2, updatedAt: '2026-02-02T00:00:00.000Z' };
const navigation: DocsNavigation = {
  activePageId: 'p_guide',
  mode: 'edit',
  navigate: () => undefined,
};

/** A value that is not the parsed page: what the user typing produces. */
const edited: Value = [{ type: 'p', children: [{ text: 'Edited.' }] }];

interface Harness {
  client: QueryClient;
  events: DocsEvent[];
  editor: SessionEditor & { tf: { setValue: Mock } };
  getPage: Mock<(id: string) => Promise<PageDocument>>;
  keys: DocsKeys;
  ns: string;
  savePage: Mock<
    (id: string, input: { body: string; baseVersion: string | null }) => Promise<SaveResult>
  >;
  view: RenderHookResult<DocumentSession, { page: PageDocument }>;
  renders: () => number;
  session: () => DocumentSession;
  status: () => SessionStatus;
  state: () => SessionState;
  draft: () => Promise<Draft | null>;
}

let instances = 0;

async function setup(
  options: { guardUnload?: boolean; draft?: Partial<Draft>; storage?: DocsStorage } = {},
): Promise<Harness> {
  instances += 1;
  const instanceId = `t${instances}`;
  const base = createFileStoreProvider(new MemoryFileStore({ 'guide.md': BODY }));
  const savePage = vi.fn<
    (id: string, input: { body: string; baseVersion: string | null }) => Promise<SaveResult>
  >(() => Promise.resolve(saved));
  const getPage = vi.fn<(id: string) => Promise<PageDocument>>(() => Promise.resolve(page));
  const provider: DocumentProvider = { ...base, savePage, getPage };

  const ns = createNamespace(instanceId, provider.key);
  const keys = createKeys(ns);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(keys.page(page.id), page);
  client.setQueryData(keys.tree(), tree);

  // The store is memoized per namespace, so the one seeded here is the one the hook opens.
  const drafts = draftStoreFor({ ns, storage: options.storage });
  if (options.draft !== undefined) {
    await drafts.write(page.id, {
      body: '# Draft\n',
      baseVersion: V1,
      updatedAt: 42,
      ...options.draft,
    });
  }

  const events: DocsEvent[] = [];
  const wrapper = ({ children }: { children: ReactNode }): React.JSX.Element => (
    <DocsProvider
      provider={provider}
      navigation={navigation}
      queryClient={client}
      instanceId={instanceId}
      guardUnload={options.guardUnload}
      onEvent={(event) => events.push(event)}
    >
      {children}
    </DocsProvider>
  );

  let renders = 0;
  const view = renderHook(
    ({ page: current }: { page: PageDocument }) => {
      renders += 1;
      return useDocumentSession(current);
    },
    { wrapper, initialProps: { page } },
  );

  // Plate keeps what it was given in `children`, and hands that back on the next change. It
  // is created with the session's value, which is what the canvas does (docs/04 section 3.1).
  const editor: SessionEditor & { tf: { setValue: Mock } } = {
    children: view.result.current.value,
    history: { undos: [{}], redos: [{}] },
    tf: {
      setValue: vi.fn((value?: Value) => {
        editor.children = value ?? [];
      }),
    },
  };
  act(() => {
    view.result.current.bind(editor);
  });

  return {
    client,
    events,
    editor,
    getPage,
    keys,
    ns,
    savePage,
    view,
    renders: () => renders,
    session: () => view.result.current,
    status: () => sessionStoreFor(ns).getState().sessions[page.id]?.status ?? 'clean',
    state: () => sessionStoreFor(ns).getState().sessions[page.id] ?? cleanSession,
    draft: () => drafts.read(page.id),
  };
}

/** Fake timers plus the promise jobs each timer starts (the provider call, the draft write). */
const tick = async (ms: number): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

/** `Cmd+S` from inside the module's subtree, or from the host's own page (docs/07 section 2). */
const save = async (inside: boolean): Promise<void> => {
  const from = document.createElement('div');
  from.className = inside ? 'docs-root' : 'host';
  document.body.append(from);
  act(() => {
    from.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true }));
  });
  from.remove();
  await tick(0);
};

const type = (h: Harness, value: Value = edited): void => {
  act(() => {
    h.session().onChange(value);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  // The draft serializes on an idle callback. jsdom's stand-in is not on the fake clock and
  // takes a number where the DOM takes `{ timeout }`, so the tests drive the `setTimeout`
  // fallback that every browser without `requestIdleCallback` uses.
  vi.stubGlobal('requestIdleCallback', undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A draft store whose read lands only when the test says so. */
function deferred(): { storage: DocsStorage; open: () => void } {
  const map = new Map<string, string>();
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    open: () => {
      release();
    },
    storage: {
      getItem: async (key) => {
        await gate;
        return map.get(key);
      },
      setItem: (key, value) => {
        map.set(key, value);
        return Promise.resolve();
      },
      removeItem: (key) => {
        map.delete(key);
        return Promise.resolve();
      },
      entries: () => Promise.resolve([...map.entries()]),
      clear: () => {
        map.clear();
        return Promise.resolve();
      },
      persistent: false,
    },
  };
}

describe('useDocumentSession: the clean path (docs/04 section 3.2)', () => {
  it('produces zero writes for a page nobody edited', async () => {
    const h = await setup();
    // Plate reports its normalization pass and every selection move as a change.
    type(h, h.session().value);
    type(h, structuredClone(h.session().value));

    await tick(5000);
    expect(h.savePage).not.toHaveBeenCalled();
    expect(await h.draft()).toBeNull();
    expect(h.status()).toBe('clean');
  });

  it('runs dirty -> draft at 500 ms -> saving -> saved -> clean', async () => {
    const h = await setup();
    type(h);
    expect(h.status()).toBe('dirty');
    expect(h.state().pending).toBe(true);

    // The draft is serialized on the idle callback the 500 ms timer schedules (docs/04 3.1).
    await tick(501);
    expect(await h.draft()).toMatchObject({ baseVersion: V1, body: 'Edited.\n' });
    expect(h.savePage).not.toHaveBeenCalled();

    await tick(999);
    expect(h.savePage).toHaveBeenCalledWith(page.id, { body: 'Edited.\n', baseVersion: V1 });
    expect(h.status()).toBe('saved');

    await tick(1500);
    expect(h.status()).toBe('clean');
  });

  it('keeps typing off the render path', async () => {
    const h = await setup();
    type(h);
    const rendered = h.renders();

    for (const word of ['one', 'two', 'three']) {
      type(h, [{ type: 'p', children: [{ text: word }] }]);
    }
    expect(h.renders()).toBe(rendered);
  });

  it('restarts both timers on every change', async () => {
    const h = await setup();
    type(h);
    await tick(400);
    type(h, [{ type: 'p', children: [{ text: 'Edited twice.' }] }]);
    await tick(400);
    expect(await h.draft()).toBeNull();

    await tick(1100);
    expect(h.savePage).toHaveBeenCalledTimes(1);
    expect(h.savePage.mock.calls[0]?.[1].body).toBe('Edited twice.\n');
  });

  it('publishes the save to the caches, the tree and the host', async () => {
    const h = await setup();
    type(h);
    await tick(1500);

    expect(h.client.getQueryData<PageDocument>(h.keys.page(page.id))).toMatchObject({
      body: 'Edited.\n',
      version: V2,
      updatedAt: saved.updatedAt,
    });
    const snapshot = h.client.getQueryData<TreeSnapshot>(h.keys.tree());
    expect(snapshot?.nodes[0]?.updatedAt).toBe(saved.updatedAt);
    expect(snapshot?.version).not.toBe(tree.version);
    expect(await h.draft()).toBeNull();
    expect(h.events).toContainEqual({
      type: 'page:saved',
      id: page.id,
      version: V2,
      bytes: 8,
      ms: 0,
    });
    expect(h.state().lastSavedAt).toBe(Date.parse(saved.updatedAt));
  });

  it('saves what the editor holds now when the page is flushed', async () => {
    const h = await setup();
    type(h);
    await act(async () => {
      await h.session().flush();
    });
    expect(h.savePage).toHaveBeenCalledTimes(1);
    expect(h.status()).toBe('saved');
  });

  it('leaves the browser its own Cmd+S outside the module', async () => {
    const h = await setup();
    type(h);
    await save(false);
    expect(h.savePage).not.toHaveBeenCalled();
  });

  it('flushes on Cmd+S, on pagehide and on unmount', async () => {
    const h = await setup();
    type(h);
    await save(true);
    expect(h.savePage).toHaveBeenCalledTimes(1);

    type(h, [{ type: 'p', children: [{ text: 'Third.' }] }]);
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    await tick(0);
    expect(h.savePage).toHaveBeenCalledTimes(2);

    type(h, [{ type: 'p', children: [{ text: 'Fourth.' }] }]);
    act(() => {
      h.view.unmount();
    });
    await tick(0);
    expect(h.savePage).toHaveBeenCalledTimes(3);
  });

  it('takes the change that lands during a save on the next round', async () => {
    const h = await setup();
    let release = (): void => undefined;
    h.savePage.mockImplementationOnce(
      () =>
        new Promise<SaveResult>((resolve) => {
          release = () => {
            resolve(saved);
          };
        }),
    );

    type(h);
    await tick(1500);
    expect(h.status()).toBe('saving');

    type(h, [{ type: 'p', children: [{ text: 'While saving.' }] }]);
    act(() => {
      release();
    });
    await tick(0);
    expect(h.status()).toBe('dirty');

    await tick(1500);
    expect(h.savePage).toHaveBeenCalledTimes(2);
    expect(h.savePage.mock.calls[1]?.[1]).toEqual({ body: 'While saving.\n', baseVersion: V2 });
  });
});

describe('useDocumentSession: failures (docs/04 sections 3.4 and 3.5)', () => {
  it('retries a network failure on the schedule, with the latest value', async () => {
    const h = await setup();
    h.savePage.mockRejectedValueOnce(new ProviderError('network', 'offline'));
    type(h);
    await tick(1500);

    expect(h.status()).toBe('offline');
    expect(h.state().retryAt).toBe(Date.now() + 1000);

    type(h, [{ type: 'p', children: [{ text: 'Later.' }] }]);
    expect(h.status()).toBe('offline');
    expect(h.savePage).toHaveBeenCalledTimes(1);

    await tick(1000);
    expect(h.savePage).toHaveBeenCalledTimes(2);
    expect(h.savePage.mock.calls[1]?.[1].body).toBe('Later.\n');
    expect(h.status()).toBe('saved');
  });

  it('backs off 1, 2 then 4 seconds and retries at once when the network returns', async () => {
    const h = await setup();
    h.savePage.mockRejectedValue(new ProviderError('network', 'offline'));
    type(h);
    await tick(1500);
    await tick(1000);
    expect(h.savePage).toHaveBeenCalledTimes(2);
    expect(h.state().retryAt).toBe(Date.now() + 2000);

    await tick(2000);
    expect(h.savePage).toHaveBeenCalledTimes(3);
    expect(h.state().retryAt).toBe(Date.now() + 4000);

    h.savePage.mockResolvedValue(saved);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
    });
    expect(h.savePage).toHaveBeenCalledTimes(4);
    expect(h.status()).toBe('saved');
  });

  it('leaves any other failure visible and keeps the work', async () => {
    const h = await setup();
    h.savePage.mockRejectedValueOnce(new ProviderError('forbidden', 'read-only'));
    type(h);
    await tick(1500);

    expect(h.status()).toBe('error');
    expect(h.events.at(-1)).toMatchObject({ type: 'error', code: 'forbidden', id: page.id });
    expect(await h.draft()).not.toBeNull();

    // A further edit is a new attempt.
    type(h, [{ type: 'p', children: [{ text: 'Again.' }] }]);
    expect(h.status()).toBe('dirty');
    await tick(1500);
    expect(h.savePage).toHaveBeenCalledTimes(2);
  });

  it('turns a rejected save into the conflict banner and saves nothing more', async () => {
    const h = await setup();
    h.savePage.mockRejectedValueOnce(new ConflictError(V2));
    type(h);
    await tick(1500);

    expect(h.status()).toBe('conflict');
    expect(h.events).toContainEqual({ type: 'page:conflict', id: page.id });

    type(h, [{ type: 'p', children: [{ text: 'Still typing.' }] }]);
    await tick(5000);
    expect(h.savePage).toHaveBeenCalledTimes(1);
    expect(h.status()).toBe('conflict');
    expect(await h.draft()).toMatchObject({ body: 'Still typing.\n' });
  });

  it('overwrites from the version the backend reported', async () => {
    const h = await setup();
    h.savePage.mockRejectedValueOnce(new ConflictError('sha256:theirs'));
    type(h);
    await tick(1500);

    await act(async () => {
      await h.session().resolveConflict('overwrite');
    });
    expect(h.savePage.mock.calls[1]?.[1]).toEqual({
      body: 'Edited.\n',
      baseVersion: 'sha256:theirs',
    });
    expect(h.status()).toBe('saved');
  });

  it('reloads the file over the local edits, draft and history', async () => {
    const h = await setup();
    h.savePage.mockRejectedValueOnce(new ConflictError(V2));
    type(h);
    await tick(1500);

    const fresh: PageDocument = { ...page, body: '# Theirs\n', version: V2 };
    h.getPage.mockResolvedValueOnce(fresh);
    await act(async () => {
      await h.session().resolveConflict('reload');
    });

    expect(h.client.getQueryData<PageDocument>(h.keys.page(page.id))).toEqual(fresh);
    expect(h.editor.tf.setValue).toHaveBeenCalledWith(defaultCodec.toValue('# Theirs\n'));
    expect(h.editor.history.undos).toEqual([]);
    expect(await h.draft()).toBeNull();
    expect(h.status()).toBe('clean');
  });

  it('swaps a page that changed on disk while clean, and conflicts while dirty', async () => {
    const h = await setup();
    const next: PageDocument = { ...page, body: '# Newer\n', version: V2 };
    act(() => {
      h.view.rerender({ page: next });
    });
    await tick(0);
    expect(h.editor.tf.setValue).toHaveBeenCalledWith(defaultCodec.toValue('# Newer\n'));
    expect(h.status()).toBe('clean');

    type(h);
    h.editor.tf.setValue.mockClear();
    act(() => {
      h.view.rerender({ page: { ...page, body: '# Newest\n', version: 'sha256:v3' } });
    });
    await tick(0);
    expect(h.status()).toBe('conflict');
    expect(h.editor.tf.setValue).not.toHaveBeenCalled();

    await tick(5000);
    expect(h.savePage).not.toHaveBeenCalled();
  });

  it('takes a version whose body did not move, mid-edit, as its own', async () => {
    const h = await setup();
    type(h);
    h.editor.tf.setValue.mockClear();

    // What a rename, a move or an icon leaves behind: the frontmatter is rewritten, so the
    // file hashes differently while the body under it is the one the session started from.
    act(() => {
      h.view.rerender({ page: { ...page, meta: { ...page.meta, title: 'Renamed' }, version: V2 } });
    });
    await tick(0);

    expect(h.status()).toBe('dirty');
    expect(h.editor.tf.setValue).not.toHaveBeenCalled();

    await tick(1500);
    expect(h.savePage).toHaveBeenCalledWith(page.id, {
      body: defaultCodec.toMarkdown(edited),
      baseVersion: V2,
    });
  });
});

describe('useDocumentSession: drafts (docs/04 section 3.3)', () => {
  const DRAFT = defaultCodec.toValue('# Draft\n');

  it('restores a draft written against this version', async () => {
    const h = await setup({ draft: {} });
    await tick(0);

    expect(h.status()).toBe('draft');
    expect(h.state().draftRestored).toBe(true);
    expect(h.state().draftAt).toBe(42);
    expect(h.editor.tf.setValue).toHaveBeenCalledWith(DRAFT);
    expect(h.events).toContainEqual({ type: 'draft:restored', id: page.id });

    // The swap is not an edit: nothing is saved until the reader answers the banner.
    type(h, DRAFT);
    await tick(5000);
    expect(h.savePage).not.toHaveBeenCalled();
  });

  it('leaves the normalization Plate runs on the way in out of it', async () => {
    const gate = deferred();
    const h = await setup({ draft: {}, storage: gate.storage });
    // A real editor does not keep what it was handed: `TrailingBlockPlugin` adds the empty
    // paragraph and `NodeIdPlugin` the ids, inside `setValue`, and hands that back through
    // `onChange`. Read as an edit, it saves the draft the banner is still asking about.
    h.editor.tf.setValue.mockImplementation((value?: Value) => {
      h.editor.children = [...(value ?? []), { children: [{ text: '' }], id: 'n1', type: 'p' }];
    });
    gate.open();
    await tick(0);

    type(h, h.editor.children);

    expect(h.status()).toBe('draft');
    expect(h.state().draftRestored).toBe(true);
    await tick(5000);
    expect(h.savePage).not.toHaveBeenCalled();
  });

  it('keeps a restored draft, which then saves on the usual timer', async () => {
    const h = await setup({ draft: {} });
    await tick(0);

    act(() => {
      h.session().resolveDraft('keep');
    });
    expect(h.status()).toBe('dirty');
    expect(h.state().draftRestored).toBe(false);

    await tick(1500);
    expect(h.savePage).toHaveBeenCalledWith(page.id, { body: '# Draft\n', baseVersion: V1 });
  });

  it('discards a restored draft back to the file', async () => {
    const h = await setup({ draft: {} });
    await tick(0);
    h.editor.tf.setValue.mockClear();

    act(() => {
      h.session().resolveDraft('discard');
    });
    expect(h.editor.tf.setValue).toHaveBeenCalledWith(defaultCodec.toValue(BODY));
    expect(h.status()).toBe('clean');
    expect(await h.draft()).toBeNull();

    await tick(5000);
    expect(h.savePage).not.toHaveBeenCalled();
  });

  it('offers a draft from another version without touching the editor', async () => {
    const h = await setup({ draft: { baseVersion: 'sha256:old' } });
    await tick(0);

    expect(h.state().draftMismatch).toBe(true);
    expect(h.status()).toBe('clean');
    expect(h.editor.tf.setValue).not.toHaveBeenCalled();

    act(() => {
      h.session().resolveDraft('keep');
    });
    expect(h.editor.tf.setValue).toHaveBeenCalledWith(DRAFT);

    await tick(1500);
    // Applying it overwrites: the base is the version on disk now, not the draft's.
    expect(h.savePage).toHaveBeenCalledWith(page.id, { body: '# Draft\n', baseVersion: V1 });
  });

  it('keeps the file when a mismatched draft is refused', async () => {
    const h = await setup({ draft: { baseVersion: 'sha256:old' } });
    await tick(0);

    act(() => {
      h.session().resolveDraft('discard');
    });
    expect(h.state().draftMismatch).toBe(false);
    expect(h.editor.tf.setValue).not.toHaveBeenCalled();
    expect(await h.draft()).toBeNull();
  });

  it('never lets a slow draft read overwrite what the user has typed', async () => {
    const gate = deferred();
    const h = await setup({ draft: {}, storage: gate.storage });
    type(h);

    act(() => {
      gate.open();
    });
    await tick(0);
    expect(h.status()).toBe('dirty');
    expect(h.state().draftRestored).toBe(false);
    expect(h.session().value).not.toEqual(DRAFT);
  });
});

describe('useDocumentSession: the unload guard (docs/04 section 3.2)', () => {
  const unload = (): boolean => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it('holds the tab while a page has changes the store has not taken', async () => {
    const h = await setup();
    expect(unload()).toBe(false);
    type(h);
    expect(unload()).toBe(true);
    await tick(1500);
    expect(unload()).toBe(false);
  });

  it('stays out of the way when the host turned the guard off', async () => {
    const h = await setup({ guardUnload: false });
    type(h);
    expect(unload()).toBe(false);
  });
});

describe('useDocumentSession: discard', () => {
  it('drops the local changes, the draft and the status', async () => {
    const h = await setup();
    type(h);
    await tick(600);
    expect(await h.draft()).not.toBeNull();

    act(() => {
      h.session().discard();
    });
    expect(h.editor.tf.setValue).toHaveBeenCalledWith(h.session().value);
    expect(h.status()).toBe('clean');
    await tick(5000);
    expect(h.savePage).not.toHaveBeenCalled();
    expect(await h.draft()).toBeNull();
  });
});

describe('forgetPage (docs/04 section 4)', () => {
  it('takes the draft, the status and the parsed value of a page that was deleted', async () => {
    const h = await setup();
    type(h);
    await tick(600);
    expect(await h.draft()).not.toBeNull();
    expect(h.status()).not.toBe('clean');
    expect(valueCache.get(valueCacheKey(h.ns, page.id, page.version))).toBeDefined();

    forgetPage(h.ns, page.id, draftStoreFor({ ns: h.ns }));
    await tick(0);

    // Nothing of the page is left to be found by a later page that lands on the same id.
    expect(await h.draft()).toBeNull();
    expect(h.status()).toBe('clean');
    expect(valueCache.get(valueCacheKey(h.ns, page.id, page.version))).toBeUndefined();
  });
});
