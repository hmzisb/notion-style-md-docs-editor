import { MemoryFileStore, createFileStoreProvider, type DocumentProvider } from '@docs/core';
import { QueryClient } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { DocsProvider } from '@/data/DocsProvider.js';
import { usePage, useTreeIndex } from '@/data/queries.js';
import type { DocsEvent } from '@/data/events.js';
import type { DocsNavigation } from '@/data/types.js';
import { IconPickerGrid } from '@/tree/icon-picker-grid.js';
import { PageTitle } from './PageTitle.js';

/**
 * docs/06 section 7 and docs/07 sections 5-6. The paths a title takes out of the textarea -
 * the debounce, the blur, a provider that says no - and the picker's keyboard, which is the
 * only way through a grid nobody can tab into.
 */

const seed = { 'title.md': '---\nid: p_title\ntitle: Title page\n---\n\nBody\n' };

const navigation: DocsNavigation = { activePageId: 'p_title', mode: 'edit', navigate: vi.fn() };

let instance = 0;

interface Mounted {
  getPage: Mock<DocumentProvider['getPage']>;
  updateMeta: Mock<DocumentProvider['updateMeta']>;
  events: DocsEvent[];
}

/** `hang` holds the provider call open, so the optimistic patch can be looked at mid-flight. */
function mount(node: ReactNode, opts: { hang?: boolean } = {}): Mounted {
  const base = createFileStoreProvider(new MemoryFileStore({ ...seed }));
  const events: DocsEvent[] = [];
  const impl: DocumentProvider['updateMeta'] =
    opts.hang === true
      ? () =>
          new Promise((_resolve, reject) => {
            reject_ = reject;
          })
      : (id, patch, options) => base.updateMeta(id, patch, options);
  const updateMeta = vi.fn(impl);
  const getPage = vi.fn(base.getPage.bind(base));
  const provider: DocumentProvider = { ...base, getPage, updateMeta };
  instance += 1;

  render(
    <DocsProvider
      provider={provider}
      navigation={navigation}
      instanceId={`title-${String(instance)}`}
      queryClient={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
      persist={false}
      onEvent={(event) => events.push(event)}
    >
      <TreeRow />
      <OpenPage />
      {node}
    </DocsProvider>,
  );
  return { getPage, updateMeta, events };
}

/** Rejects the held provider call. */
let reject_: (error: Error) => void = () => undefined;

/** A reader on the page itself, so an invalidation of it is a read the provider answers. */
function OpenPage(): React.JSX.Element {
  const page = usePage('p_title');
  return <span data-testid="page">{page.data?.version ?? ''}</span>;
}

/** The tree row's title, which is what the sidebar draws (docs/07 section 5). */
function TreeRow(): React.JSX.Element {
  const tree = useTreeIndex();
  return <span data-testid="row">{tree.data?.byId.p_title?.title ?? ''}</span>;
}

const row = (): HTMLElement => screen.getByTestId('row');

const title = (props: Partial<React.ComponentProps<typeof PageTitle>> = {}): React.JSX.Element => (
  <PageTitle
    pageId="p_title"
    title="Title page"
    mode="edit"
    editable
    onModeChange={vi.fn()}
    onGoToContent={vi.fn()}
    {...props}
  />
);

beforeEach(() => {
  // frimousse fetches its emoji data on mount; a test has no business on the network.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => undefined)),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PageTitle (docs/07 section 5)', () => {
  it('commits once the typing stops and moves the tree row with it', async () => {
    const user = userEvent.setup();
    const { updateMeta } = mount(title());
    await waitFor(() => {
      expect(row()).toHaveTextContent('Title page');
    });

    await user.clear(screen.getByRole('textbox', { name: 'Page title' }));
    await user.type(screen.getByRole('textbox', { name: 'Page title' }), 'Renamed');
    // Still inside the 600 ms window: a write per keystroke is what the debounce is for.
    expect(updateMeta).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(updateMeta).toHaveBeenCalledWith('p_title', { title: 'Renamed' }, undefined);
    });
    await waitFor(() => {
      expect(row()).toHaveTextContent('Renamed');
    });
  });

  it('re-reads the page whose file the rename just rewrote', async () => {
    const user = userEvent.setup();
    const view = mount(title());
    await waitFor(() => {
      expect(view.getPage).toHaveBeenCalledTimes(1);
    });

    await user.type(screen.getByRole('textbox', { name: 'Page title' }), '!');
    await waitFor(() => {
      expect(view.updateMeta).toHaveBeenCalled();
    });

    // docs/04 section 3.2: the title lives in the frontmatter, so the file this page is open
    // on has a new version. A session left on the old one saves against a stale base.
    await waitFor(() => {
      expect(view.getPage).toHaveBeenCalledTimes(2);
    });
  });

  it('commits on blur without waiting for the debounce', async () => {
    const user = userEvent.setup();
    const { updateMeta } = mount(title());
    await waitFor(() => {
      expect(row()).toHaveTextContent('Title page');
    });

    await user.type(screen.getByRole('textbox', { name: 'Page title' }), ' v2');
    await user.tab();
    expect(updateMeta).toHaveBeenCalledWith('p_title', { title: 'Title page v2' }, undefined);
  });

  it('puts the row back when the provider refuses the write', async () => {
    const user = userEvent.setup();
    const { events } = mount(title(), { hang: true });
    await waitFor(() => {
      expect(row()).toHaveTextContent('Title page');
    });

    await user.type(screen.getByRole('textbox', { name: 'Page title' }), '!');
    await user.tab();
    // docs/04 section 4: the row moves first and the provider catches up.
    await waitFor(() => {
      expect(row()).toHaveTextContent('Title page!');
    });

    await act(async () => {
      reject_(new Error('no writes today'));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(row()).toHaveTextContent('Title page');
    });
    expect(events.map((event) => event.type)).toContain('error');
  });

  it('is plain text in read mode, and a click on it asks for the editor', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    mount(title({ mode: 'read', onModeChange }));

    expect(screen.queryByRole('textbox', { name: 'Page title' })).toBeNull();
    await user.click(screen.getByRole('heading', { name: 'Title page' }));
    expect(onModeChange).toHaveBeenCalledWith('edit');
  });
});

describe('IconPicker (docs/07 section 6)', () => {
  it('moves the highlight with the arrows and takes the icon with Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    mount(<IconPickerGrid onChange={onChange} />);

    await user.click(screen.getByRole('tab', { name: 'Icons' }));
    await user.type(screen.getByPlaceholderText('Search…'), 'star');

    const names = screen
      .getAllByRole('gridcell')
      .map((cell) => cell.getAttribute('aria-label') ?? '');
    expect(names.length).toBeGreaterThan(1);
    expect(screen.getAllByRole('gridcell')[0]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowRight}{Enter}');
    expect(onChange).toHaveBeenCalledWith(`lucide:${names[1] ?? ''}`);
  });

  it('offers Remove only when there is an icon to remove', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    mount(<IconPickerGrid value={{ kind: 'emoji', value: '🚀' }} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onChange).toHaveBeenCalledWith('');

    onChange.mockClear();
    mount(<IconPickerGrid onChange={onChange} />);
    expect(screen.queryAllByRole('button', { name: 'Remove' })).toHaveLength(1);
  });
});
