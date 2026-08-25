import { MemoryFileStore, createFileStoreProvider, type DocumentProvider } from '@docs/core';
import { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocsProvider } from '@/data/DocsProvider.js';
import type { DocsNavigation } from '@/data/types.js';
import { PageTree, type PageTreeProps } from './PageTree.js';

const page = (id: string, title: string): string => `---\nid: ${id}\ntitle: ${title}\n---\n\n# ${title}\n`;

/**
 * Roots that cover every row shape: a page with children, two leaves, and a folder
 * without an index page. No root `index.md`, which would nest all of them under it.
 */
const seed = {
  'home.md': page('p_home', 'Home'),
  'guides/index.md': page('p_guides', 'Guides'),
  'guides/auth.md': page('p_auth', 'Auth'),
  'guides/billing.md': page('p_billing', 'Billing'),
  'specs/index.md': page('p_specs', 'Specs'),
  'archive/2024.md': page('p_2024', 'Notes 2024'),
};

const navigation: DocsNavigation = { activePageId: null, mode: 'read', navigate: () => undefined };

interface Mounted {
  onOpen: ReturnType<typeof vi.fn>;
  rerender: () => void;
  unmount: () => void;
}

function mount(
  instanceId: string,
  props: Partial<PageTreeProps> = {},
  files: Record<string, string> = seed,
  nav: DocsNavigation = navigation,
): Mounted {
  const provider: DocumentProvider = createFileStoreProvider(new MemoryFileStore(files));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpen = vi.fn();
  const tree = (
    <DocsProvider
      provider={provider}
      navigation={nav}
      instanceId={instanceId}
      queryClient={client}
      persist={false}
    >
      <PageTree activeId={props.activeId ?? null} onOpen={onOpen} rootId={props.rootId} />
    </DocsProvider>
  );
  const view = render(tree);
  return {
    onOpen,
    rerender: () => {
      view.unmount();
      render(tree);
    },
    unmount: view.unmount,
  };
}

const rows = (): HTMLElement[] => screen.getAllByRole('treeitem');
const titles = (): (string | null)[] => rows().map((row) => row.getAttribute('aria-label'));
const rowFor = (title: string): HTMLElement => screen.getByRole('treeitem', { name: title });

const ready = async (): Promise<void> => {
  await waitFor(() => {
    expect(screen.getByRole('tree')).toBeInTheDocument();
  });
};

/**
 * jsdom has no layout, so `offsetHeight` is 0 and the virtualizer would measure a viewport
 * that holds no rows. 800 px is a sidebar's worth: 29 rows plus overscan.
 */
const VIEWPORT = 800;

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    value: VIEWPORT,
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 240 });
});

afterAll(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'offsetHeight');
  Reflect.deleteProperty(HTMLElement.prototype, 'offsetWidth');
});

beforeEach(() => {
  localStorage.clear();
});

describe('PageTree', () => {
  it('renders the roots as a tree and leaves children collapsed', async () => {
    mount('roots');
    await ready();

    expect(titles()).toEqual(['Guides', 'Home', 'Specs', 'Archive']);
    const guides = rowFor('Guides');
    expect(guides).toHaveAttribute('aria-expanded', 'false');
    expect(guides).toHaveAttribute('aria-level', '1');
    // A leaf never advertises expandability.
    expect(rowFor('Home')).not.toHaveAttribute('aria-expanded');
  });

  it('expands a page from its chevron and indents the children', async () => {
    const user = userEvent.setup();
    mount('expand');
    await ready();

    await user.click(screen.getByRole('button', { name: 'Expand Guides' }));

    expect(titles()).toEqual(['Guides', 'Auth', 'Billing', 'Home', 'Specs', 'Archive']);
    expect(rowFor('Auth')).toHaveAttribute('aria-level', '2');
    expect(rowFor('Guides')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Collapse Guides' })).toBeInTheDocument();
  });

  it('keeps the expanded folders across a remount', async () => {
    const user = userEvent.setup();
    const view = mount('persist');
    await ready();
    await user.click(screen.getByRole('button', { name: 'Expand Guides' }));
    expect(titles()).toContain('Auth');

    view.rerender();
    await ready();

    await waitFor(() => {
      expect(titles()).toContain('Auth');
    });
    expect(JSON.parse(localStorage.getItem(sidebarKey()) ?? '{}')).toMatchObject({
      state: { expanded: { p_guides: true } },
    });
  });

  it('opens a page on click and expands a folder instead of opening it', async () => {
    const user = userEvent.setup();
    const view = mount('click');
    await ready();

    await user.click(rowFor('Home'));
    expect(view.onOpen).toHaveBeenCalledWith('p_home');

    view.onOpen.mockClear();
    await user.click(rowFor('Archive'));
    expect(view.onOpen).not.toHaveBeenCalled();
    expect(titles()).toContain('Notes 2024');
  });

  it('marks the active row and only that row', async () => {
    mount('active', { activeId: 'p_specs' });
    await ready();

    expect(rowFor('Specs')).toHaveAttribute('aria-selected', 'true');
    expect(rowFor('Home')).toHaveAttribute('aria-selected', 'false');
  });

  it('renders titles as links when navigation supplies href', async () => {
    mount('href', {}, seed, { ...navigation, href: ({ pageId }) => `/p/${pageId}` });
    await ready();

    expect(rowFor('Home').querySelector('a')).toHaveAttribute('href', '/p/p_home');
    // A folder has no page behind it, so it never gets a link.
    expect(rowFor('Archive').querySelector('a')).toBeNull();
  });

  describe('keyboard (docs/07 section 2)', () => {
    it('moves the focus with the arrow keys and jumps with Home and End', async () => {
      const user = userEvent.setup();
      mount('arrows');
      await ready();

      rowFor('Guides').focus();
      await user.keyboard('{ArrowDown}');
      await waitFor(() => {
        expect(document.activeElement).toBe(rowFor('Home'));
      });

      await user.keyboard('{ArrowUp}');
      await waitFor(() => {
        expect(document.activeElement).toBe(rowFor('Guides'));
      });

      await user.keyboard('{End}');
      await waitFor(() => {
        expect(document.activeElement).toBe(rowFor('Archive'));
      });

      await user.keyboard('{Home}');
      await waitFor(() => {
        expect(document.activeElement).toBe(rowFor('Guides'));
      });
    });

    it('expands with ArrowRight and collapses with ArrowLeft', async () => {
      const user = userEvent.setup();
      mount('arrow-expand');
      await ready();

      rowFor('Guides').focus();
      await user.keyboard('{ArrowRight}');
      await waitFor(() => {
        expect(titles()).toContain('Auth');
      });

      await user.keyboard('{ArrowLeft}');
      await waitFor(() => {
        expect(titles()).not.toContain('Auth');
      });
    });

    it('opens the focused page with Enter and with Space', async () => {
      const user = userEvent.setup();
      const view = mount('enter');
      await ready();

      rowFor('Home').focus();
      await user.keyboard('{Enter}');
      expect(view.onOpen).toHaveBeenCalledWith('p_home');

      view.onOpen.mockClear();
      await user.keyboard(' ');
      expect(view.onOpen).toHaveBeenCalledWith('p_home');
    });

    it('jumps to a row by typing its title prefix', async () => {
      const user = userEvent.setup();
      mount('type-ahead');
      await ready();

      rowFor('Guides').focus();
      await user.keyboard('sp');

      await waitFor(() => {
        expect(rowFor('Specs')).toHaveAttribute('tabindex', '0');
      });

      // Escape ends the search and hands the keyboard back to the row it found.
      await user.keyboard('{Escape}');
      await waitFor(() => {
        expect(document.activeElement?.getAttribute('aria-label')).toBe('Specs');
      });
    });

    it('gives the focused row the only tab stop', async () => {
      const user = userEvent.setup();
      mount('roving');
      await ready();

      expect(rowFor('Guides')).toHaveAttribute('tabindex', '0');
      expect(rowFor('Home')).toHaveAttribute('tabindex', '-1');

      rowFor('Guides').focus();
      await user.keyboard('{ArrowDown}');

      await waitFor(() => {
        expect(rowFor('Home')).toHaveAttribute('tabindex', '0');
      });
      expect(rowFor('Guides')).toHaveAttribute('tabindex', '-1');
    });
  });

  it('renders about a screenful of rows for a 5,000 page tree', async () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 5000; i++) {
      many[`page-${String(i).padStart(4, '0')}.md`] = page(`p_${String(i)}`, `Page ${String(i)}`);
    }
    mount('big', {}, many);
    await ready();

    const rendered = rows();
    expect(rendered[0]).toHaveAttribute('aria-setsize', '5000');
    expect(rendered.length).toBeGreaterThan(20);
    expect(rendered.length).toBeLessThan(60);
  });
});

/** The sidebar store persists under `<ns>:sidebar`; there is one instance in these tests. */
function sidebarKey(): string {
  const key = Object.keys(localStorage).find((name) => name.endsWith(':sidebar'));
  return key ?? ':sidebar';
}
