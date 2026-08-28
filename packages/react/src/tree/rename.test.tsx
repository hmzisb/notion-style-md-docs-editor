import {
  MemoryFileStore,
  createFileStoreProvider,
  type DocumentProvider,
} from '@hmzisb/notion-docs-core';
import { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocsProvider } from '@/data/DocsProvider.js';
import type { DocsNavigation } from '@/data/types.js';
import { PageTree } from './PageTree.js';

/**
 * docs/09 P3-T02: the rename paths of docs/07 section 5 and the row menu of docs/06 section 5.
 */

const page = (id: string, title: string): string =>
  `---\nid: ${id}\ntitle: ${title}\n---\n\n# ${title}\n`;

const seed = { 'home.md': page('p_home', 'Home'), 'guides.md': page('p_guides', 'Guides') };

const navigation: DocsNavigation = {
  activePageId: null,
  mode: 'read',
  navigate: () => undefined,
  href: ({ pageId }) => `https://docs.test/p/${pageId}`,
};

function mount(instanceId: string, { write = true }: { write?: boolean } = {}) {
  const provider: DocumentProvider = createFileStoreProvider(new MemoryFileStore(seed));
  const updateMeta = vi.spyOn(provider, 'updateMeta');
  const onCreate = vi.fn();
  const onEvent = vi.fn();
  render(
    <DocsProvider
      provider={provider}
      navigation={navigation}
      instanceId={instanceId}
      queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      persist={false}
      onEvent={onEvent}
    >
      <PageTree activeId={null} onOpen={() => undefined} onCreate={write ? onCreate : undefined} />
    </DocsProvider>,
  );
  return { provider, updateMeta, onCreate, onEvent };
}

const row = (title: string): HTMLElement => screen.getByRole('treeitem', { name: title });
const field = (title: string): HTMLElement =>
  screen.getByRole('textbox', { name: `Rename ${title}` });

const ready = async (): Promise<void> => {
  await waitFor(() => {
    expect(screen.getByRole('treeitem', { name: 'Home' })).toBeInTheDocument();
  });
};

/** The row menu, which the pointer reaches by hovering and the test by name. */
async function openMenu(user: ReturnType<typeof userEvent.setup>, title: string): Promise<void> {
  await user.click(screen.getByRole('button', { name: `More options for ${title}` }));
  await screen.findByRole('menu');
}

beforeEach(() => {
  localStorage.clear();
});

describe('Tree rename (docs/07 section 5)', () => {
  it('opens on F2 with the title selected, and Enter writes it', async () => {
    const user = userEvent.setup();
    const { updateMeta, onEvent } = mount('f2');
    await ready();

    row('Home').focus();
    await user.keyboard('{F2}');

    const input = field('Home');
    expect(input).toHaveFocus();
    // Selected, so the first keystroke replaces the title rather than appending to it.
    expect(
      window.getSelection()?.toString() === 'Home' ||
        (input as HTMLInputElement).selectionStart === 0,
    ).toBe(true);

    await user.keyboard('Handbook{Enter}');

    await waitFor(() => {
      expect(updateMeta).toHaveBeenCalledWith('p_home', { title: 'Handbook' }, undefined);
    });
    expect(await screen.findByRole('treeitem', { name: 'Handbook' })).toBeInTheDocument();
    // The row takes the focus back: the keyboard came from there.
    expect(screen.getByRole('treeitem', { name: 'Handbook' })).toHaveFocus();
    expect(onEvent).toHaveBeenCalledWith({ type: 'page:renamed', id: 'p_home' });
  });

  it('opens on a double click and Esc leaves the title alone', async () => {
    const user = userEvent.setup();
    const { updateMeta } = mount('escape');
    await ready();

    await user.dblClick(screen.getByText('Home'));
    await user.keyboard('Something else{Escape}');

    // By name: the tree's own type-ahead input is a textbox too (docs/07 section 2).
    expect(screen.queryByRole('textbox', { name: 'Rename Home' })).not.toBeInTheDocument();
    expect(row('Home')).toBeInTheDocument();
    expect(updateMeta).not.toHaveBeenCalled();
  });

  it('rejects an empty title and stays open', async () => {
    const user = userEvent.setup();
    const { updateMeta } = mount('empty');
    await ready();

    row('Home').focus();
    await user.keyboard('{F2}');
    await user.clear(field('Home'));
    await user.keyboard('{Enter}');

    const input = field('Home');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(updateMeta).not.toHaveBeenCalled();
  });

  it('commits on blur, and a title that did not change writes nothing', async () => {
    const user = userEvent.setup();
    const { updateMeta } = mount('blur');
    await ready();

    row('Home').focus();
    await user.keyboard('{F2}');
    await user.keyboard('Manual');
    await user.click(row('Guides'));

    await waitFor(() => {
      expect(updateMeta).toHaveBeenCalledWith('p_home', { title: 'Manual' }, undefined);
    });

    row('Guides').focus();
    await user.keyboard('{F2}');
    await user.click(screen.getByRole('treeitem', { name: 'Manual' }));
    expect(updateMeta).toHaveBeenCalledTimes(1);
  });
});

describe('Tree row menu (docs/06 sections 5 and 8)', () => {
  it('renames from the menu', async () => {
    const user = userEvent.setup();
    mount('menu-rename');
    await ready();

    await openMenu(user, 'Home');
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));

    await waitFor(() => {
      expect(field('Home')).toHaveFocus();
    });
  });

  it('adds a page inside the row', async () => {
    const user = userEvent.setup();
    const { onCreate } = mount('menu-create');
    await ready();

    await openMenu(user, 'Home');
    await user.click(screen.getByRole('menuitem', { name: 'Add a page inside' }));

    expect(onCreate).toHaveBeenCalledWith('p_home');
  });

  it('copies the host URL for the page', async () => {
    const user = userEvent.setup();
    mount('menu-link');
    await ready();

    await openMenu(user, 'Home');
    await user.click(screen.getByRole('menuitem', { name: 'Copy link' }));

    await waitFor(async () => {
      expect(await navigator.clipboard.readText()).toBe('https://docs.test/p/p_home');
    });
  });

  it('offers a read-only host nothing but the link', async () => {
    const user = userEvent.setup();
    mount('menu-readonly', { write: false });
    await ready();

    await openMenu(user, 'Home');

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Copy link']);
    expect(
      screen.queryByRole('button', { name: 'Add a page inside Home' }),
    ).not.toBeInTheDocument();
  });
});
