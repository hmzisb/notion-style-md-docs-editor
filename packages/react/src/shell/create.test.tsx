import {
  MemoryFileStore,
  createFileStoreProvider,
  type DocumentProvider,
  type NodeId,
  type PageMode,
} from '@docs/core';
import { QueryClient } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCallback, useMemo, useState } from 'react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { DocsProvider } from '@/data/DocsProvider.js';
import type { DocsEvent } from '@/data/events.js';
import { useTreeIndex } from '@/data/queries.js';
import type { DocsNavigation } from '@/data/types.js';
import { DocsShell } from './DocsShell.js';

/**
 * docs/09 P3-T01, against docs/01 section 5.3 and the createPage row of docs/04 section 4: the
 * row and the page are there before the provider is, the temporary id is replaced by the real
 * one under a page nobody remounted, and the first title takes the file name with it.
 */

const seed = { 'home.md': '---\nid: p_home\ntitle: Home\n---\n\nHome\n' };

interface Mounted {
  createPage: Mock<DocumentProvider['createPage']>;
  updateMeta: Mock<DocumentProvider['updateMeta']>;
  events: DocsEvent[];
  /** Where the host is now: the shell drives it through `navigate` (docs/00 D-06). */
  at: () => { pageId: NodeId | null; mode: PageMode };
  /** The path the tree holds for a node, which only a refetch can produce. */
  pathOf: (id: NodeId) => string | undefined;
}

let instance = 0;
/** Resolves or rejects the held `createPage`. */
let settle: { ok: (node: unknown) => void; fail: (error: Error) => void } = {
  ok: () => undefined,
  fail: () => undefined,
};

function mount(opts: { hang?: boolean } = {}): Mounted {
  const base = createFileStoreProvider(new MemoryFileStore({ ...seed }));
  const events: DocsEvent[] = [];
  const createPage = vi.fn<DocumentProvider['createPage']>((input) =>
    opts.hang !== true
      ? base.createPage(input)
      : new Promise((resolve, reject) => {
          settle = {
            ok: () => {
              void base.createPage(input).then(resolve, reject);
            },
            fail: reject,
          };
        }),
  );
  const updateMeta = vi.fn<DocumentProvider['updateMeta']>((id, patch, options) =>
    base.updateMeta(id, patch, options),
  );
  const provider: DocumentProvider = { ...base, createPage, updateMeta };
  instance += 1;

  const location = { pageId: null as NodeId | null, mode: 'read' as PageMode };
  const paths = new Map<NodeId, string>();
  // Built here, not in `Host`: the shell navigates by changing the host's state, and a client
  // built during that render would throw away the optimistic patch that caused it.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  function Host(): React.JSX.Element {
    const [at, setAt] = useState<{ pageId: NodeId | null; mode: PageMode }>({
      pageId: null,
      mode: 'read',
    });
    location.pageId = at.pageId;
    location.mode = at.mode;
    const navigate = useCallback<DocsNavigation['navigate']>((to) => {
      setAt({ pageId: to.pageId, mode: to.mode ?? 'read' });
    }, []);
    const navigation = useMemo<DocsNavigation>(
      () => ({ activePageId: at.pageId, mode: at.mode, navigate }),
      [at, navigate],
    );

    return (
      <DocsProvider
        provider={provider}
        navigation={navigation}
        instanceId={`create-${String(instance)}`}
        queryClient={queryClient}
        persist={false}
        onEvent={(event) => events.push(event)}
      >
        <Paths paths={paths} />
        <DocsShell pageId={at.pageId} mode={at.mode} />
      </DocsProvider>
    );
  }

  render(<Host />);
  return {
    createPage,
    updateMeta,
    events,
    at: () => ({ ...location }),
    pathOf: (id) => paths.get(id),
  };
}

/** The tree the sidebar reads, so a test can look at what the refetch brought back. */
function Paths({ paths }: { paths: Map<NodeId, string> }): null {
  const { data } = useTreeIndex();
  for (const node of Object.values(data?.byId ?? {})) paths.set(node.id, node.path);
  return null;
}

const ready = async (): Promise<void> => {
  await waitFor(() => {
    expect(screen.getByRole('treeitem', { name: 'Home' })).toBeInTheDocument();
  });
};

/**
 * docs/06 section 5 puts one in the sidebar header and one in its footer, and docs/06 section
 * 11 a third on the "Select a page" card, all under the same name: in DOM order, header first.
 */
const newPageButtons = (): HTMLElement[] => screen.getAllByRole('button', { name: 'New page' });

const titleField = (): HTMLTextAreaElement =>
  screen.getByRole('textbox', { name: 'Page title' });

describe('useCreatePage (docs/01 section 5.3)', () => {
  it('opens the new page before the provider answers, then carries it to the real id', async () => {
    const user = userEvent.setup();
    const view = mount({ hang: true });
    await ready();

    await user.click(newPageButtons()[0]!);

    // The row is in the tree and the page is open in edit mode, on an id no provider gave.
    expect(await screen.findByRole('treeitem', { name: 'Untitled' })).toBeInTheDocument();
    await waitFor(() => {
      expect(view.at().mode).toBe('edit');
    });
    expect(view.at().pageId).toMatch(/^tmp_/);
    // docs/01 section 5.3: with the title focused, so the first keystroke names the page.
    await waitFor(() => {
      expect(titleField()).toHaveFocus();
    });

    const field = titleField();
    await user.type(field, 'Release plan');

    await act(async () => {
      settle.ok(null);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(view.at().pageId).not.toMatch(/^tmp_/);
    });
    // The same element, still holding what was typed into it: nothing was remounted around it.
    expect(titleField()).toBe(field);
    expect(field.value).toBe('Release plan');

    // docs/03 section 4.7: the first title on a fresh page renames `untitled.md` to its slug.
    const id = view.at().pageId;
    await waitFor(() => {
      expect(view.updateMeta).toHaveBeenCalledWith(id, { title: 'Release plan' }, { renameFile: true });
    });
    await waitFor(() => {
      expect(view.pathOf(id ?? '')).toBe('release-plan.md');
    });
    expect(view.events.map((event) => event.type)).toContain('page:created');
  });

  it('adds a page inside the row the + belongs to', async () => {
    const user = userEvent.setup();
    const view = mount();
    await ready();

    await user.click(screen.getByRole('button', { name: 'Add a page inside Home' }));

    await waitFor(() => {
      expect(view.createPage).toHaveBeenCalledWith({ parentId: 'p_home', title: '' });
    });
    await waitFor(() => {
      expect(view.pathOf(view.at().pageId ?? '')).toBe('home/untitled.md');
    });
  });

  it('takes the row back out and returns when the provider refuses', async () => {
    const user = userEvent.setup();
    const view = mount({ hang: true });
    await ready();
    await user.click(screen.getByRole('treeitem', { name: 'Home' }));
    await waitFor(() => {
      expect(view.at().pageId).toBe('p_home');
    });

    // The sidebar footer's row this time, which is the other way to a root page.
    await user.click(newPageButtons()[1]!);
    expect(await screen.findByRole('treeitem', { name: 'Untitled' })).toBeInTheDocument();

    await act(async () => {
      settle.fail(new Error('no writes today'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByRole('treeitem', { name: 'Untitled' })).toBeNull();
    });
    expect(view.at()).toEqual({ pageId: 'p_home', mode: 'read' });
    expect(await screen.findByText("Couldn't create the page")).toBeInTheDocument();
    expect(view.events.map((event) => event.type)).toContain('error');
  });
});
