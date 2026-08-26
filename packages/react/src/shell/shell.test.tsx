import { MemoryFileStore, createFileStoreProvider, type DocumentProvider } from '@docs/core';
import { QueryClient } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocsProvider } from '@/data/DocsProvider.js';
import type { DocsNavigation } from '@/data/types.js';
import { DEFAULT_SIDEBAR_WIDTH } from '@/data/sidebar-store.js';
import { DocsShell, type DocsShellProps } from './DocsShell.js';

const page = (id: string, title: string): string =>
  `---\nid: ${id}\ntitle: ${title}\n---\n\n# ${title}\n`;

/** A trail of six pages, so the breadcrumbs have more ancestors than they can show. */
const seed = {
  'home.md': page('p_home', 'Home'),
  'a/index.md': page('p_a', 'Alpha'),
  'a/b/index.md': page('p_b', 'Bravo'),
  'a/b/c/index.md': page('p_c', 'Charlie'),
  'a/b/c/d/index.md': page('p_d', 'Delta'),
  'a/b/c/d/e/index.md': page('p_e', 'Echo'),
  'a/b/c/d/e/leaf.md': page('p_leaf', 'Leaf'),
  'archive/2024.md': page('p_2024', 'Notes 2024'),
};

interface Mounted {
  navigate: ReturnType<typeof vi.fn>;
}

let instance = 0;

function mount(
  props: Partial<DocsShellProps> = {},
  files: Record<string, string> = seed,
  custom?: DocumentProvider,
): Mounted {
  const provider: DocumentProvider = custom ?? createFileStoreProvider(new MemoryFileStore(files));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const navigate = vi.fn();
  instance += 1;
  const navigation: DocsNavigation = {
    activePageId: props.pageId ?? null,
    mode: 'read',
    navigate,
  };

  render(
    <DocsProvider
      provider={provider}
      navigation={navigation}
      instanceId={`shell-${String(instance)}`}
      queryClient={client}
      persist={false}
    >
      <DocsShell pageId={props.pageId ?? null} mode={props.mode ?? 'read'} {...props} />
    </DocsProvider>,
  );
  return { navigate };
}

/** A host whose provider cannot write: no Edit control, no editor chunk (docs/07 section 8). */
function mountReadOnly(): Mounted {
  const base = createFileStoreProvider(new MemoryFileStore(seed));
  const capabilities = { ...base.capabilities, write: false };
  return mount({ pageId: 'p_c' }, seed, {
    ...base,
    capabilities,
    getMeta: async () => ({ ...(await base.getMeta()), capabilities }),
  });
}

/** The shell's own root: `portalRoot()` adds a second `.docs-root` to the body for portals. */
const root = (): HTMLElement =>
  document.querySelector<HTMLElement>('.docs-root:not([data-docs-portal])')!;
const sidebarWidth = (): string => root().style.getPropertyValue('--docs-sidebar-width');

const ready = async (): Promise<void> => {
  await waitFor(() => {
    expect(screen.getByRole('tree')).toBeInTheDocument();
  });
};

beforeEach(() => {
  localStorage.clear();
});

describe('DocsShell', () => {
  it('lays the sidebar and the document region out as the two shell landmarks', async () => {
    mount();
    await ready();

    expect(screen.getByRole('navigation', { name: 'Pages' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Document' })).toBeInTheDocument();
    expect(sidebarWidth()).toBe(`${String(DEFAULT_SIDEBAR_WIDTH)}px`);
  });

  describe('collapse', () => {
    it('closes the column, offers a way back, and remembers the choice', async () => {
      const user = userEvent.setup();
      mount();
      await ready();

      const collapse = screen.getByRole('button', { name: 'Collapse sidebar' });
      expect(collapse).toHaveAttribute('aria-expanded', 'true');
      await user.click(collapse);

      expect(sidebarWidth()).toBe('0px');
      const open = await screen.findByRole('button', { name: 'Show sidebar' });
      expect(open).toHaveAttribute('aria-expanded', 'false');
      expect(open).toHaveAttribute('aria-controls', collapse.getAttribute('aria-controls'));
      expect(JSON.parse(localStorage.getItem(sidebarKey()) ?? '{}')).toMatchObject({
        state: { collapsed: true },
      });

      await user.click(open);
      expect(sidebarWidth()).toBe(`${String(DEFAULT_SIDEBAR_WIDTH)}px`);
    });

    it('toggles from Cmd+backslash', async () => {
      const user = userEvent.setup();
      mount();
      await ready();

      await user.keyboard('{Meta>}\\{/Meta}');
      await waitFor(() => {
        expect(sidebarWidth()).toBe('0px');
      });

      await user.keyboard('{Meta>}\\{/Meta}');
      await waitFor(() => {
        expect(sidebarWidth()).toBe(`${String(DEFAULT_SIDEBAR_WIDTH)}px`);
      });
    });

    it('hides both buttons when the host pins the sidebar open', async () => {
      mount({ sidebar: { collapsible: false } });
      await ready();

      expect(screen.queryByRole('button', { name: 'Collapse sidebar' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Show sidebar' })).not.toBeInTheDocument();
    });
  });

  describe('expand all (docs/09 P3-T08)', () => {
    it('opens every folder from the header, and shuts them all again', async () => {
      const user = userEvent.setup();
      mount();
      await ready();

      // Nothing is open, so the deepest page in the trail has no row yet.
      expect(screen.queryByRole('treeitem', { name: /Echo/ })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Expand all' }));
      expect(await screen.findByRole('treeitem', { name: /Echo/ })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Collapse all' }));
      await waitFor(() => {
        expect(screen.queryByRole('treeitem', { name: /Echo/ })).not.toBeInTheDocument();
      });
      expect(screen.getByRole('treeitem', { name: /Alpha/ })).toBeInTheDocument();
    });

    it('stays out of a workspace with nothing to expand', async () => {
      mount({}, { 'home.md': page('p_home', 'Home') });
      await ready();

      expect(screen.queryByRole('button', { name: 'Expand all' })).not.toBeInTheDocument();
    });
  });

  describe('resize (docs/07 section 9)', () => {
    const handle = (): HTMLElement => screen.getByRole('separator', { name: 'Resize sidebar' });

    it('steps 16 px with an arrow key and 64 px with shift', async () => {
      const user = userEvent.setup();
      mount();
      await ready();

      handle().focus();
      await user.keyboard('{ArrowRight}');
      expect(handle()).toHaveAttribute('aria-valuenow', '256');
      expect(sidebarWidth()).toBe('256px');

      await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
      expect(handle()).toHaveAttribute('aria-valuenow', '320');

      await user.keyboard('{ArrowLeft}');
      expect(handle()).toHaveAttribute('aria-valuenow', '304');
    });

    it('stops at the host bounds', async () => {
      const user = userEvent.setup();
      mount({ sidebar: { minWidth: 220, maxWidth: 260 } });
      await ready();

      handle().focus();
      await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
      expect(handle()).toHaveAttribute('aria-valuenow', '260');

      await user.keyboard('{Shift>}{ArrowLeft}{ArrowLeft}{/Shift}');
      expect(handle()).toHaveAttribute('aria-valuenow', '220');
    });

    it('resets to the default width on a double click', async () => {
      const user = userEvent.setup();
      mount();
      await ready();

      handle().focus();
      await user.keyboard('{ArrowRight}');
      expect(sidebarWidth()).toBe('256px');

      await user.dblClick(handle());
      expect(sidebarWidth()).toBe(`${String(DEFAULT_SIDEBAR_WIDTH)}px`);
    });
  });

  describe('breadcrumbs (docs/06 section 6)', () => {
    it('shows every ancestor while they fit', async () => {
      mount({ pageId: 'p_c' });
      await ready();

      const trail = await screen.findByRole('navigation', { name: 'Breadcrumb' });
      expect(within(trail).getByRole('button', { name: 'Alpha' })).toBeInTheDocument();
      expect(within(trail).getByRole('button', { name: 'Bravo' })).toBeInTheDocument();
      expect(within(trail).queryByRole('button', { name: 'More pages' })).not.toBeInTheDocument();
      expect(trail).toHaveTextContent('Charlie');
    });

    it('moves the middle ancestors into a menu past three of them', async () => {
      const user = userEvent.setup();
      const view = mount({ pageId: 'p_leaf' });
      await ready();

      const trail = await screen.findByRole('navigation', { name: 'Breadcrumb' });
      // First ancestor, the overflow menu, then the last two, then the open page.
      expect(within(trail).getByRole('button', { name: 'Alpha' })).toBeInTheDocument();
      expect(within(trail).getByRole('button', { name: 'Delta' })).toBeInTheDocument();
      expect(within(trail).getByRole('button', { name: 'Echo' })).toBeInTheDocument();
      expect(within(trail).queryByRole('button', { name: 'Bravo' })).not.toBeInTheDocument();
      expect(trail).toHaveTextContent('Leaf');

      await user.click(within(trail).getByRole('button', { name: 'More pages' }));
      const menu = await screen.findByRole('menu');
      expect(within(menu).getByRole('menuitem', { name: 'Bravo' })).toBeInTheDocument();
      // docs/11 section 4: a portal outside `.docs-root` gets none of the module's variables.
      expect(menu.closest('.docs-root')).not.toBeNull();

      await user.click(within(menu).getByRole('menuitem', { name: 'Charlie' }));
      expect(view.navigate).toHaveBeenCalledWith({ pageId: 'p_c', mode: 'read' });
    });
  });

  describe('content region', () => {
    it('asks for a page when none is open', async () => {
      mount();
      await ready();

      expect(await screen.findByText('Select a page')).toBeInTheDocument();
    });

    it('renders the open page and announces it', async () => {
      mount({ pageId: 'p_home' });
      await ready();

      // Two: the title block, and the body's own `# Home`, which docs/03 section 6 keeps.
      expect(await screen.findAllByRole('heading', { name: 'Home' })).toHaveLength(2);
      await waitFor(() => {
        expect(liveRegion()).toHaveTextContent('Opened Home');
      });
    });

    it('offers the way home when the id is gone', async () => {
      const user = userEvent.setup();
      const view = mount({ pageId: 'p_missing' });
      await ready();

      expect(await screen.findByText('This page no longer exists')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Go home' }));
      expect(view.navigate).toHaveBeenCalledWith({ pageId: null });
    });

    it('lists the children of a folder that has no page', async () => {
      const user = userEvent.setup();
      // Ids are derived from the path, so the same seed always produces the same folder id.
      const snapshot = await createFileStoreProvider(new MemoryFileStore(seed)).getTree();
      const folder = snapshot.nodes.find((node) => node.kind === 'folder');
      expect(folder).toBeDefined();

      const view = mount({ pageId: folder?.id ?? '' });
      await ready();

      expect(await screen.findByText('This folder has no page yet')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Notes 2024' }));
      expect(view.navigate).toHaveBeenCalledWith({ pageId: 'p_2024', mode: 'read' });
    });

    it('turns a folder into the page it is missing, and opens it to be written', async () => {
      const user = userEvent.setup();
      const base = createFileStoreProvider(new MemoryFileStore(seed));
      const savePage = vi.spyOn(base, 'savePage');
      const snapshot = await base.getTree();
      const folder = snapshot.nodes.find((node) => node.kind === 'folder');

      const view = mount({ pageId: folder?.id ?? '' }, seed, base);
      await ready();
      // A folder has no page behind it, so the header has nothing to offer to edit.
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
      await user.click(await screen.findByRole('button', { name: 'Create page' }));

      // docs/03 section 4.1: the node keeps its id, and a null base is what writes the file
      // it never had.
      expect(savePage).toHaveBeenCalledWith(folder?.id, { body: '', baseVersion: null });
      await waitFor(() => {
        expect(view.navigate).toHaveBeenCalledWith({ pageId: folder?.id, mode: 'edit' });
      });
    });

    it('offers a read-only host the children rather than the page it cannot write', async () => {
      const base = createFileStoreProvider(new MemoryFileStore(seed));
      const capabilities = { ...base.capabilities, write: false };
      const snapshot = await base.getTree();
      const folder = snapshot.nodes.find((node) => node.kind === 'folder');

      mount({ pageId: folder?.id ?? '' }, seed, {
        ...base,
        capabilities,
        getMeta: async () => ({ ...(await base.getMeta()), capabilities }),
      });
      await ready();

      expect(await screen.findByText('This folder has no page yet')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Create page' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Notes 2024' })).toBeInTheDocument();
    });
  });
});

/** The sidebar store persists under `<ns>:sidebar`; one instance is mounted per test. */
function sidebarKey(): string {
  const key = Object.keys(localStorage).find((name) => name.endsWith(':sidebar'));
  return key ?? ':sidebar';
}

function liveRegion(): HTMLElement {
  return document.querySelector<HTMLElement>('[aria-live="polite"].sr-only')!;
}

describe('mode transitions (docs/07 section 7)', () => {
  /** The canvas renders the page title, and this corpus page repeats it as its first block. */
  const openPage = async (): Promise<HTMLElement> => {
    await ready();
    const headings = await screen.findAllByRole('heading', { level: 1, name: 'Charlie' });
    return headings[1] ?? headings[0]!;
  };

  it('offers Edit to a write host and Done while editing', async () => {
    mount({ pageId: 'p_c' });
    await openPage();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();

    cleanup();
    mount({ pageId: 'p_c', mode: 'edit' });
    await openPage();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('hides the control for a read-only host', async () => {
    mountReadOnly();
    await openPage();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('swaps the read view for the editor when the host is in edit mode', async () => {
    mount({ pageId: 'p_c', mode: 'edit' });
    await openPage();

    await waitFor(() => {
      expect(document.querySelector('[data-slate-editor]')).not.toBeNull();
    });
    expect(document.querySelector('[data-slate-editor]')).toHaveAttribute(
      'contenteditable',
      'true',
    );
  });

  it('keeps the mode out of the history (replace) when the control is used', async () => {
    const user = userEvent.setup();
    const view = mount({ pageId: 'p_c' });
    await openPage();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(view.navigate).toHaveBeenCalledWith({ pageId: 'p_c', mode: 'edit' }, { replace: true });
  });

  it('asks for edit mode when a reader clicks the text', async () => {
    const view = mount({ pageId: 'p_c' });
    const text = await openPage();

    click(text, { x: 40, y: 40 }, { x: 41, y: 40 });
    expect(view.navigate).toHaveBeenCalledWith({ pageId: 'p_c', mode: 'edit' }, { replace: true });
  });

  it('leaves a text selection alone', async () => {
    const view = mount({ pageId: 'p_c' });
    const heading = await openPage();

    // A drag across the words is a copy, not a request to edit (docs/07 section 7).
    click(heading, { x: 40, y: 40 }, { x: 140, y: 40 });
    expect(view.navigate).not.toHaveBeenCalled();
  });

  it('does not start editing from a control inside the page', async () => {
    const view = mount({ pageId: 'p_c' });
    await openPage();
    const button = screen.getByRole('button', { name: 'Edit' });

    click(button, { x: 10, y: 10 }, { x: 10, y: 10 });
    expect(view.navigate).not.toHaveBeenCalledWith(
      { pageId: 'p_c', mode: 'edit' },
      { replace: true },
    );
  });

  it('enters edit mode with E from inside the content region', async () => {
    const view = mount({ pageId: 'p_c' });
    const heading = await openPage();

    fireEvent.keyDown(heading, { key: 'e', code: 'KeyE' });
    expect(view.navigate).toHaveBeenCalledWith({ pageId: 'p_c', mode: 'edit' }, { replace: true });
  });

  it('leaves edit mode with Escape and puts focus back on the region', async () => {
    const view = mount({ pageId: 'p_c', mode: 'edit' });
    await openPage();
    const region = screen.getByRole('region', { name: 'Document' });

    fireEvent.keyDown(region, { key: 'Escape', code: 'Escape' });
    expect(view.navigate).toHaveBeenCalledWith({ pageId: 'p_c', mode: 'read' }, { replace: true });
    expect(region).toHaveFocus();
  });

  it('opens the next page in read mode (docs/07 section 7)', async () => {
    const user = userEvent.setup();
    const view = mount({ pageId: 'p_c', mode: 'edit' });
    await openPage();

    await user.click(screen.getByRole('treeitem', { name: 'Alpha' }));
    expect(view.navigate).toHaveBeenCalledWith({ pageId: 'p_a', mode: 'read' });
  });
});

/** A pointer press and release at explicit coordinates: the 4 px rule reads both. */
function click(
  target: Element,
  from: { x: number; y: number },
  to: { x: number; y: number },
): void {
  fireEvent.pointerDown(target, { clientX: from.x, clientY: from.y });
  fireEvent.pointerUp(target, { clientX: to.x, clientY: to.y });
}
