import {
  MemoryFileStore,
  createFileStoreProvider,
  type DocumentProvider,
  type NodeId,
  type PageMode,
  type ProviderCapabilities,
} from '@docs/core';
import { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCallback, useMemo, useState } from 'react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { DocsProvider } from '@/data/DocsProvider.js';
import type { DocsNavigation } from '@/data/types.js';
import { DocsShell } from './DocsShell.js';

/**
 * docs/09 P3-T06, against docs/06 section 8: the header's `⋯` and the eight things it does to
 * the page that is open.
 */

const seed = {
  'home.md': '---\nid: p_home\ntitle: Home\n---\n\nHome page body\n',
  'guides/index.md': '---\nid: p_guides\ntitle: Guides\n---\n\nGuides\n',
  'guides/setup.md': '---\nid: p_setup\ntitle: Setup\n---\n\nSetup\n',
};

interface Mounted {
  deletePage: Mock<DocumentProvider['deletePage']>;
  movePage: Mock<DocumentProvider['movePage']>;
  at: () => { pageId: NodeId | null; mode: PageMode };
}

let instance = 0;

function mount(capabilities?: Partial<ProviderCapabilities>): Mounted {
  const base = createFileStoreProvider(new MemoryFileStore({ ...seed }));
  const deletePage = vi.fn<DocumentProvider['deletePage']>((id) => base.deletePage(id));
  const movePage = vi.fn<DocumentProvider['movePage']>((id, to) => base.movePage(id, to));
  const merged = { ...base.capabilities, ...capabilities };
  const provider: DocumentProvider = {
    ...base,
    capabilities: merged,
    getMeta: async () => ({ ...(await base.getMeta()), capabilities: merged }),
    deletePage,
    movePage,
  };
  instance += 1;

  const location = { pageId: 'p_home' as NodeId | null, mode: 'read' as PageMode };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  function Host(): React.JSX.Element {
    const [at, setAt] = useState<{ pageId: NodeId | null; mode: PageMode }>({
      pageId: 'p_home',
      mode: 'read',
    });
    location.pageId = at.pageId;
    location.mode = at.mode;
    const navigate = useCallback<DocsNavigation['navigate']>((to) => {
      setAt({ pageId: to.pageId, mode: to.mode ?? 'read' });
    }, []);
    const navigation = useMemo<DocsNavigation>(
      () => ({
        activePageId: at.pageId,
        mode: at.mode,
        navigate,
        href: ({ pageId }) => `https://docs.test/p/${pageId}`,
      }),
      [at, navigate],
    );

    return (
      <DocsProvider
        provider={provider}
        navigation={navigation}
        instanceId={`menu-${String(instance)}`}
        queryClient={queryClient}
        persist={false}
      >
        <DocsShell pageId={at.pageId} mode={at.mode} />
      </DocsProvider>
    );
  }

  render(<Host />);
  return { deletePage, movePage, at: () => ({ ...location }) };
}

/** The `⋯`, which mounts the menu it opens (docs/02 section 7). */
async function openMenu(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
  });
  await user.click(screen.getByRole('button', { name: 'More options' }));
  await screen.findByRole('menu');
}

const item = (name: string): HTMLElement => screen.getByRole('menuitem', { name });

beforeEach(() => {
  localStorage.clear();
});

describe('Page menu (docs/06 section 8)', () => {
  it('copies the host URL for the page', async () => {
    const user = userEvent.setup();
    mount();
    await openMenu(user);

    await user.click(item('Copy link'));

    await waitFor(async () => {
      expect(await navigator.clipboard.readText()).toBe('https://docs.test/p/p_home');
    });
    expect(await screen.findByText('Copied link')).toBeInTheDocument();
  });

  it('copies the page as the file it is', async () => {
    const user = userEvent.setup();
    mount();
    await openMenu(user);

    await user.click(item('Copy as Markdown'));

    await waitFor(async () => {
      expect(await navigator.clipboard.readText()).toBe(seed['home.md']);
    });
    expect(await screen.findByText('Copied as Markdown')).toBeInTheDocument();
  });

  it('downloads the page under its title', async () => {
    const user = userEvent.setup();
    const url = vi.fn(() => 'blob:docs');
    const revoke = vi.fn();
    // jsdom has neither, and both are what a download is made of.
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: url, revokeObjectURL: revoke }));
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    mount();
    await openMenu(user);

    await user.click(item('Download .md'));

    expect(click).toHaveBeenCalled();
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('Home.md');
    expect(revoke).toHaveBeenCalledWith('blob:docs');
    expect(await screen.findByText("Downloaded 'Home'")).toBeInTheDocument();
    click.mockRestore();
  });

  it('counts the words of the page it is open on', async () => {
    const user = userEvent.setup();
    mount();
    await openMenu(user);

    expect(item('3 words')).toHaveAttribute('aria-disabled', 'true');
  });

  it('renames by putting the caret in the title', async () => {
    const user = userEvent.setup();
    const view = mount();
    await openMenu(user);

    await user.click(item('Rename'));

    // docs/06 section 8: the title is the rename, so the mode swaps to the one that has a
    // field in it and the caret lands there.
    await waitFor(() => {
      expect(view.at().mode).toBe('edit');
    });
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Page title' })).toHaveFocus();
    });
  });

  it('deletes the page behind a confirmation', async () => {
    const user = userEvent.setup();
    const view = mount();
    await openMenu(user);

    await user.click(item('Delete'));
    const dialog = within(await screen.findByRole('alertdialog'));
    await user.click(dialog.getByRole('button', { name: 'Delete' }));

    expect(view.deletePage).toHaveBeenCalledWith('p_home');
    expect(await screen.findByText("Deleted 'Home'")).toBeInTheDocument();
  });

  it('moves the page under the page the dialog picks', async () => {
    const user = userEvent.setup();
    const view = mount();
    await openMenu(user);

    await user.click(item('Move to'));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('option', { name: 'Guides' }));

    // Last among its new siblings: Guides already has Setup (docs/06 section 8).
    await waitFor(() => {
      expect(view.movePage).toHaveBeenCalledWith('p_home', { parentId: 'p_guides', index: 1 });
    });
  });

  it('offers a read-only host what it can do and nothing else', async () => {
    const user = userEvent.setup();
    mount({ write: false, move: false, delete: false });
    await openMenu(user);

    expect(screen.getAllByRole('menuitem').map((entry) => entry.textContent)).toEqual([
      'Copy link',
      'Copy as Markdown',
      'Download .md',
      '3 words',
    ]);
  });

  it('opens and closes on the keyboard, and hands the focus back', async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
    });

    // The trigger the press replaces is a button too, so `Enter` is all it takes (docs/07 s9).
    screen.getByRole('button', { name: 'More options' }).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');

    await user.keyboard('{ArrowDown}');
    expect(item('Copy link')).toHaveFocus();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'More options' })).toHaveFocus();
  });
});
