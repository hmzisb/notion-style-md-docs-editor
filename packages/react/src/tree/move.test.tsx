import { MemoryFileStore, createFileStoreProvider, type DocumentProvider } from '@docs/core';
import { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocsProvider } from '@/data/DocsProvider.js';
import type { DocsNavigation } from '@/data/types.js';
import { Toaster } from '@/ui/sonner';
import { PageTree } from './PageTree.js';

/**
 * docs/09 P3-T03: the paths a move takes that a real drag cannot reach in jsdom - the keyboard,
 * the Move to dialog, and what a provider's refusal does to the row (docs/04 section 4).
 */

const page = (id: string, title: string, order: number): string =>
  `---\nid: ${id}\ntitle: ${title}\norder: ${String(order)}\n---\n\n# ${title}\n`;

const seed = {
  'alpha.md': page('p_alpha', 'Alpha', 10),
  // Its directory holds the child, so `beta/index.md` is the page itself (docs/03 section 4.1).
  'beta/index.md': page('p_beta', 'Beta', 20),
  'beta/child.md': page('p_child', 'Child', 10),
};

const navigation: DocsNavigation = { activePageId: null, mode: 'read', navigate: () => undefined };

let instance = 0;

function mount() {
  const provider: DocumentProvider = createFileStoreProvider(new MemoryFileStore(seed));
  const movePage = vi.spyOn(provider, 'movePage');
  instance += 1;
  render(
    <DocsProvider
      provider={provider}
      navigation={navigation}
      instanceId={`move-${String(instance)}`}
      queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      persist={false}
    >
      <PageTree activeId={null} onOpen={() => undefined} onCreate={() => undefined} />
      <Toaster />
    </DocsProvider>,
  );
  return { movePage };
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

beforeEach(() => {
  localStorage.clear();
});

describe('Tree move (docs/07 section 3)', () => {
  it('reorders the focused row among its siblings with Cmd+ArrowDown', async () => {
    const user = userEvent.setup();
    const { movePage } = mount();
    await ready();

    row('Alpha').focus();
    await user.keyboard('{Meta>}{ArrowDown}{/Meta}');

    // `index` counts the siblings with the moved row taken out (docs/03 section 4.4).
    expect(movePage).toHaveBeenCalledWith('p_alpha', { parentId: null, index: 1 });
    await waitFor(() => {
      expect(order()).toEqual(['Beta', 'Alpha']);
    });
    // The row keeps the keyboard, so the next press moves the same page again.
    expect(row('Alpha')).toHaveFocus();
  });

  it('stops at the ends rather than moving the row out of its parent', async () => {
    const user = userEvent.setup();
    const { movePage } = mount();
    await ready();

    row('Alpha').focus();
    await user.keyboard('{Meta>}{ArrowUp}{/Meta}');

    expect(movePage).not.toHaveBeenCalled();
    expect(order()).toEqual(['Alpha', 'Beta']);
  });

  it('puts the row back and says so when the provider refuses', async () => {
    const user = userEvent.setup();
    const { movePage } = mount();
    await ready();
    movePage.mockRejectedValueOnce(new Error('nope'));

    row('Alpha').focus();
    await user.keyboard('{Meta>}{ArrowDown}{/Meta}');

    expect(await screen.findByText("Couldn't move 'Alpha'")).toBeInTheDocument();
    await waitFor(() => {
      expect(order()).toEqual(['Alpha', 'Beta']);
    });
  });

  it('moves a page from the row menu, out of a dialog that cannot offer its own subtree', async () => {
    const user = userEvent.setup();
    const { movePage } = mount();
    await ready();

    await user.click(screen.getByRole('button', { name: 'More options for Beta' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Move to' }));

    const dialog = within(await screen.findByRole('dialog'));
    // Neither the page being moved nor anything under it is somewhere it can go.
    expect(dialog.queryByRole('option', { name: /Beta/ })).not.toBeInTheDocument();
    expect(dialog.queryByRole('option', { name: /Child/ })).not.toBeInTheDocument();
    await user.click(dialog.getByRole('option', { name: /Alpha/ }));

    // Last inside the page it was dropped on (docs/06 section 5), and the parent opens.
    expect(movePage).toHaveBeenCalledWith('p_beta', { parentId: 'p_alpha', index: 0 });
    await waitFor(() => {
      expect(row('Beta')).toHaveAttribute('aria-level', '2');
    });
  });
});
