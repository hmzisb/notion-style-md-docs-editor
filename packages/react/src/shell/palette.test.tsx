import {
  MemoryFileStore,
  createFileStoreProvider,
  type DocumentProvider,
  type SearchHit,
} from '@hmzisb/notion-docs-core';
import { QueryClient } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocsProvider } from '@/data/DocsProvider.js';
import type { DocsNavigation } from '@/data/types.js';
import { DocsShell, type DocsShellProps } from './DocsShell.js';

const page = (id: string, title: string): string =>
  `---\nid: ${id}\ntitle: ${title}\n---\n\n# ${title}\n`;

const seed = {
  'home.md': page('p_home', 'Home'),
  'guides/index.md': page('p_guides', 'Guides'),
  'guides/auth.md': page('p_auth', 'Authentication'),
  'notes/2024.md': page('p_notes', 'Notes 2024'),
};

/** A provider whose `search` answers with fixed hits, so a case can pin what comes back. */
function searchable(provider: DocumentProvider, hits: SearchHit[]): DocumentProvider {
  const capabilities = { ...provider.capabilities, search: true };
  return {
    ...provider,
    capabilities,
    getMeta: async () => ({ ...(await provider.getMeta()), capabilities }),
    search: () => Promise.resolve(hits),
  };
}

interface Mounted {
  navigate: ReturnType<typeof vi.fn>;
}

let instance = 0;

function mount(props: Partial<DocsShellProps> = {}, provider?: DocumentProvider): Mounted {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const navigate = vi.fn();
  instance += 1;
  const navigation: DocsNavigation = {
    activePageId: props.pageId ?? null,
    mode: props.mode ?? 'read',
    navigate,
  };

  render(
    <DocsProvider
      provider={provider ?? createFileStoreProvider(new MemoryFileStore(seed))}
      navigation={navigation}
      instanceId={`palette-${String(instance)}`}
      queryClient={client}
      persist={false}
    >
      <DocsShell pageId={props.pageId ?? null} mode={props.mode ?? 'read'} {...props} />
    </DocsProvider>,
  );
  return { navigate };
}

const ready = async (): Promise<void> => {
  await waitFor(() => {
    expect(screen.getByRole('tree')).toBeInTheDocument();
  });
};

const palette = (): Promise<HTMLElement> => screen.findByRole('dialog');
const input = (): Promise<HTMLElement> => screen.findByPlaceholderText('Search pages…');

/** Opens the palette the way the reader does and returns its input, focused. */
async function openPalette(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.keyboard('{Meta>}p{/Meta}');
  await palette();
  return input();
}

beforeEach(() => {
  localStorage.clear();
});

describe('CommandPalette (docs/06 section 8, docs/07 section 4)', () => {
  it('opens from Cmd+P with the actions it can run', async () => {
    const user = userEvent.setup();
    mount();
    await ready();

    const dialog = within(await (await openPalette(user), palette()));
    expect(dialog.getByRole('option', { name: /New page/ })).toBeInTheDocument();
    expect(dialog.getByRole('option', { name: /Toggle sidebar/ })).toBeInTheDocument();
    expect(dialog.getByRole('option', { name: /Expand all/ })).toBeInTheDocument();
    expect(dialog.getByRole('option', { name: /Collapse all/ })).toBeInTheDocument();
    // The host did not offer a theme hook, so the module does not pretend it can switch one.
    expect(dialog.queryByRole('option', { name: /Switch theme/ })).not.toBeInTheDocument();
  });

  it('opens from the sidebar Search row, which shows its own shortcut', async () => {
    const user = userEvent.setup();
    mount();
    await ready();

    const row = screen.getByRole('button', { name: /Search/ });
    expect(row).toHaveTextContent(/⌘P|Ctrl\+P/);
    await user.click(row);

    expect(await palette()).toBeInTheDocument();
  });

  it('filters pages by title and shows where each one lives', async () => {
    const user = userEvent.setup();
    mount();
    await ready();

    await user.type(await openPalette(user), 'auth');

    const dialog = within(await palette());
    const hit = await dialog.findByRole('option', { name: /Authentication/ });
    expect(hit).toHaveTextContent('Guides');
    expect(dialog.queryByRole('option', { name: /Notes 2024/ })).not.toBeInTheDocument();
  });

  it('lists the pages opened last while the input is empty', async () => {
    const user = userEvent.setup();
    mount({ pageId: 'p_auth' });
    await ready();
    await screen.findAllByRole('heading', { name: 'Authentication' });

    const dialog = within(await (await openPalette(user), palette()));
    expect(dialog.getByText('Recent')).toBeInTheDocument();
    expect(dialog.getByRole('option', { name: /Authentication/ })).toBeInTheDocument();
  });

  it('opens the selection with Enter and in edit mode with Cmd+Enter', async () => {
    const user = userEvent.setup();
    const view = mount();
    await ready();

    await user.type(await openPalette(user), 'auth');
    await screen.findByRole('option', { name: /Authentication/ });
    await user.keyboard('{Enter}');
    expect(view.navigate).toHaveBeenCalledWith({ pageId: 'p_auth', mode: 'read' });

    await user.type(await openPalette(user), 'auth');
    await screen.findByRole('option', { name: /Authentication/ });
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    expect(view.navigate).toHaveBeenCalledWith({ pageId: 'p_auth', mode: 'edit' });
  });

  it('creates a page titled with the query on Shift+Enter', async () => {
    const user = userEvent.setup();
    const view = mount();
    await ready();

    await user.type(await openPalette(user), 'Release notes');
    await user.keyboard('{Shift>}{Enter}{/Shift}');

    // docs/01 section 5.3: the page is open, in edit mode, under a temporary id, before the
    // provider has written anything.
    const first = view.navigate.mock.calls[0]?.[0] as { mode: string; pageId: string } | undefined;
    expect(first?.mode).toBe('edit');
    expect(first?.pageId).toMatch(/^tmp_/);
    // Awaited, not held: this row is drawn under the temporary id and drawn again under the
    // provider's, so the node found here is a node React may already have replaced.
    await screen.findByRole('treeitem', { name: 'Release notes' });

    // docs/04 section 4: it carries on under the id the provider gave it, in the same entry of
    // the host's history rather than a second one.
    await waitFor(() => {
      const last = view.navigate.mock.calls.at(-1) as
        [{ mode: string; pageId: string }, { replace?: boolean }?] | undefined;
      expect(last?.[0].pageId).not.toMatch(/^tmp_/);
      expect(last?.[1]).toEqual({ replace: true });
    });
  });

  it('runs a content search when the provider has one', async () => {
    const user = userEvent.setup();
    mount(
      {},
      searchable(createFileStoreProvider(new MemoryFileStore(seed)), [
        { id: 'p_notes', title: 'Notes 2024', snippet: 'the auth rewrite shipped' },
      ]),
    );
    await ready();

    await user.type(await openPalette(user), 'auth');

    const dialog = within(await palette());
    expect(await dialog.findByText('the auth rewrite shipped')).toBeInTheDocument();
    expect(dialog.getByText('Results')).toBeInTheDocument();
  });

  it('leaves a title match to the Pages group', async () => {
    const user = userEvent.setup();
    mount(
      {},
      searchable(createFileStoreProvider(new MemoryFileStore(seed)), [
        // What `search` returns for a page it matched on the title: a hit with no snippet.
        { id: 'p_notes', title: 'Notes 2024' },
        { id: 'p_auth', title: 'Authentication', snippet: 'the notes live here' },
      ]),
    );
    await ready();

    await user.type(await openPalette(user), 'notes');

    const dialog = within(await palette());
    // The content hit proves the search ran; the title hit is still one row, in Pages.
    expect(await dialog.findByText('the notes live here')).toBeInTheDocument();
    expect(dialog.getAllByRole('option', { name: /Notes 2024/ })).toHaveLength(1);
  });

  it('leaves the theme to the host that offered to change it', async () => {
    const user = userEvent.setup();
    const onThemeChange = vi.fn();
    mount({ onThemeChange });
    await ready();

    await openPalette(user);
    await user.click(await screen.findByRole('option', { name: /Switch theme/ }));

    expect(onThemeChange).toHaveBeenCalledWith('dark');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('collapses the sidebar from the palette', async () => {
    const user = userEvent.setup();
    mount();
    await ready();

    await openPalette(user);
    await user.click(await screen.findByRole('option', { name: /Toggle sidebar/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Show sidebar' })).toBeInTheDocument();
    });
  });
});

describe('global shortcuts (docs/07 sections 1-2)', () => {
  const filter = (): HTMLElement => screen.getByRole('textbox', { name: 'Filter' });
  const withInput = { slots: { headerActions: <input aria-label="Filter" /> } };

  it('stays out of the way while a text input has focus', async () => {
    const user = userEvent.setup();
    mount(withInput);
    await ready();

    await user.click(filter());
    await user.keyboard('{Meta>}k{/Meta}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Focus back on the shell itself, and the same keystroke means the palette again.
    await user.click(screen.getByRole('button', { name: 'Home' }));
    await user.keyboard('{Meta>}k{/Meta}');
    expect(await palette()).toBeInTheDocument();
  });

  it('never lets the browser offer to save the page, focus wherever it is', async () => {
    const user = userEvent.setup();
    mount(withInput);
    await ready();

    const seen: KeyboardEvent[] = [];
    const listener = (event: KeyboardEvent): void => {
      seen.push(event);
    };
    // Registered after the shell's own, so `defaultPrevented` already reflects what it did.
    window.addEventListener('keydown', listener);

    await user.keyboard('{Meta>}s{/Meta}');
    await user.click(filter());
    await user.keyboard('{Meta>}s{/Meta}');
    window.removeEventListener('keydown', listener);

    const saves = seen.filter((event) => event.key.toLowerCase() === 's');
    expect(saves).toHaveLength(2);
    expect(saves.every((event) => event.defaultPrevented)).toBe(true);
  });

  it('opens the parent page with Cmd+Shift+U', async () => {
    const user = userEvent.setup();
    const view = mount({ pageId: 'p_auth' });
    await ready();

    await user.keyboard('{Meta>}{Shift>}u{/Shift}{/Meta}');
    expect(view.navigate).toHaveBeenCalledWith({ pageId: 'p_guides', mode: 'read' });
  });

  it('toggles edit mode with Cmd+Shift+E in both directions', async () => {
    const user = userEvent.setup();
    const read = mount({ pageId: 'p_auth' });
    await ready();
    await user.keyboard('{Meta>}{Shift>}e{/Shift}{/Meta}');
    expect(read.navigate).toHaveBeenCalledWith(
      { pageId: 'p_auth', mode: 'edit' },
      { replace: true },
    );

    // Two shells in one test would both answer the keyboard; the first one leaves first.
    cleanup();
    const edit = mount({ pageId: 'p_auth', mode: 'edit' });
    await ready();
    await user.keyboard('{Meta>}{Shift>}e{/Shift}{/Meta}');
    expect(edit.navigate).toHaveBeenCalledWith(
      { pageId: 'p_auth', mode: 'read' },
      { replace: true },
    );
  });
});
