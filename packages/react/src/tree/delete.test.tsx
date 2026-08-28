import {
  MemoryFileStore,
  createFileStoreProvider,
  type DocumentProvider,
} from '@hmzisb/notion-docs-core';
import { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocsProvider } from '@/data/DocsProvider.js';
import type { DocsNavigation } from '@/data/types.js';
import { ToastSurface } from '@/ui/toast-surface.js';
import { PageTree } from './PageTree.js';

/**
 * docs/09 P3-T04: what the dialog says before the rows go, what goes with them, and where the
 * reader and the keyboard end up afterwards (docs/06 section 8, docs/04 section 4).
 */

const page = (id: string, title: string, order: number): string =>
  `---\nid: ${id}\ntitle: ${title}\norder: ${String(order)}\n---\n\n# ${title}\n`;

const seed = {
  'alpha.md': page('p_alpha', 'Alpha', 10),
  // Its directory holds the children, so `beta/index.md` is the page itself (docs/03 section 4.1).
  'beta/index.md': page('p_beta', 'Beta', 20),
  'beta/child/index.md': page('p_child', 'Child', 10),
  'beta/child/grand.md': page('p_grand', 'Grand', 10),
};

let instance = 0;

function mount(activePageId: string | null = null) {
  const provider: DocumentProvider = createFileStoreProvider(new MemoryFileStore(seed));
  const deletePage = vi.spyOn(provider, 'deletePage');
  const navigate = vi.fn();
  const onEvent = vi.fn();
  const navigation: DocsNavigation = { activePageId, mode: 'read', navigate };
  instance += 1;
  render(
    <DocsProvider
      provider={provider}
      navigation={navigation}
      instanceId={`delete-${String(instance)}`}
      queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      persist={false}
      onEvent={onEvent}
    >
      <PageTree activeId={activePageId} onOpen={() => undefined} onCreate={() => undefined} />
      <ToastSurface />
    </DocsProvider>,
  );
  return { deletePage, navigate, onEvent };
}

const row = (title: string): HTMLElement => screen.getByRole('treeitem', { name: title });
/** The titles the tree is showing, top to bottom. */
const order = (): string[] =>
  screen.getAllByRole('treeitem').map((element) => element.getAttribute('aria-label') ?? '');

const ready = async (): Promise<void> => {
  await waitFor(() => {
    expect(screen.getByRole('treeitem', { name: 'Alpha' })).toBeInTheDocument();
  });
};

/** Opens the dialog the way the keyboard does, on whichever row has the roving tabindex. */
async function press(user: ReturnType<typeof userEvent.setup>, title: string, key: string) {
  row(title).focus();
  await user.keyboard(key);
  return within(await screen.findByRole('alertdialog'));
}

beforeEach(() => {
  localStorage.clear();
});

describe('Tree delete (docs/06 section 8)', () => {
  it('counts the sub-pages that go with the page, and takes the subtree on confirm', async () => {
    const user = userEvent.setup();
    const { deletePage, onEvent } = mount();
    await ready();

    const dialog = await press(user, 'Beta', '{Delete}');
    expect(dialog.getByRole('heading', { name: "Delete 'Beta'?" })).toBeInTheDocument();
    // Both descendants, not just the child row the tree happens to be showing.
    expect(
      dialog.getByText('This deletes the page and 2 sub-pages. This cannot be undone.'),
    ).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Delete' }));

    expect(deletePage).toHaveBeenCalledWith('p_beta');
    await waitFor(() => {
      expect(order()).toEqual(['Alpha']);
    });
    // The row that had the keyboard went with it, so the keyboard lands on what is left.
    await waitFor(() => {
      expect(row('Alpha')).toHaveFocus();
    });
    expect(await screen.findByText("Deleted 'Beta'")).toBeInTheDocument();
    // docs/08 section 3: the host hears about the page, not about the subtree under it.
    expect(onEvent).toHaveBeenCalledWith({ type: 'page:deleted', id: 'p_beta' });
  });

  it('says only that the page goes when nothing is under it', async () => {
    const user = userEvent.setup();
    mount();
    await ready();

    const dialog = await press(user, 'Alpha', '{Backspace}');
    expect(dialog.getByText('This deletes the page. This cannot be undone.')).toBeInTheDocument();
  });

  it('deletes nothing when the dialog is cancelled', async () => {
    const user = userEvent.setup();
    const { deletePage } = mount();
    await ready();

    const dialog = await press(user, 'Alpha', '{Delete}');
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));

    expect(deletePage).not.toHaveBeenCalled();
    expect(order()).toEqual(['Alpha', 'Beta']);
    // The row it was opened from takes the keyboard back (docs/07 section 9).
    await waitFor(() => {
      expect(row('Alpha')).toHaveFocus();
    });
  });

  it('sends the reader home when the page they had open was a root page', async () => {
    const user = userEvent.setup();
    // The page being read is under the one being deleted, so it cannot stay open.
    const { navigate } = mount('p_child');
    await ready();

    const dialog = await press(user, 'Beta', '{Delete}');
    await user.click(dialog.getByRole('button', { name: 'Delete' }));

    // Nothing above Beta, so there is no page left to land on.
    expect(navigate).toHaveBeenCalledWith({ pageId: null }, { replace: true });
    await waitFor(() => {
      expect(order()).toEqual(['Alpha']);
    });
  });

  it('leaves the reader on the parent of the page that went', async () => {
    const user = userEvent.setup();
    const { navigate } = mount('p_grand');
    await ready();
    await user.click(screen.getByRole('button', { name: 'Expand Beta' }));

    const dialog = await press(user, 'Child', '{Delete}');
    await user.click(dialog.getByRole('button', { name: 'Delete' }));

    // The open page is under Child, and Beta is the nearest page still there.
    expect(navigate).toHaveBeenCalledWith({ pageId: 'p_beta' }, { replace: true });
    await waitFor(() => {
      expect(order()).toEqual(['Alpha', 'Beta']);
    });
  });

  it('puts the rows back and says so when the provider refuses', async () => {
    const user = userEvent.setup();
    const { deletePage } = mount();
    await ready();
    deletePage.mockRejectedValueOnce(new Error('nope'));

    const dialog = await press(user, 'Beta', '{Delete}');
    await user.click(dialog.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText("Couldn't delete 'Beta'")).toBeInTheDocument();
    await waitFor(() => {
      expect(order()).toEqual(['Alpha', 'Beta']);
    });
  });

  it('opens the same dialog from the row menu', async () => {
    const user = userEvent.setup();
    const { deletePage } = mount();
    await ready();

    await user.click(screen.getByRole('button', { name: 'More options for Alpha' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const dialog = within(await screen.findByRole('alertdialog'));
    await user.click(dialog.getByRole('button', { name: 'Delete' }));

    expect(deletePage).toHaveBeenCalledWith('p_alpha');
  });
});
