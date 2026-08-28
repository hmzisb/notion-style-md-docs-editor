import {
  MemoryFileStore,
  createFileStoreProvider,
  type DocumentProvider,
} from '@hmzisb/notion-docs-core';
import { QueryClient, onlineManager } from '@tanstack/react-query';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryProvider } from '@/adapters/memory.js';
import { DocsProvider } from '@/data/DocsProvider.js';
import type { DocsEvent } from '@/data/events.js';
import type { DocsNavigation } from '@/data/types.js';
import { TooltipProvider } from '@/ui/tooltip';
import { DocsShell } from './DocsShell.js';
import { PageIcon } from './PageIcon.js';
import { PageTitle } from './PageTitle.js';

/**
 * docs/04 section 3.4 and D-05. Offline the module keeps reading - the cache and a local
 * provider both work with the radio off - and stops writing structure: a rename or an icon
 * needs the provider on the other end.
 */

const PAGE_ID = 'p_one';
const seed = { 'one.md': `---\nid: ${PAGE_ID}\ntitle: One\n---\n\nBody text.\n` };

const node = {
  id: PAGE_ID,
  parentId: null,
  kind: 'page' as const,
  title: 'One',
  path: 'one.md',
  slug: 'one',
  order: 0,
  childIds: [],
  updatedAt: '2026-01-01T00:00:00.000Z',
};

let instance = 0;

/**
 * jsdom has no radio: `navigator.onLine` is a getter and the events are ours to fire. Query
 * keeps its own copy of the answer and only listens once a query has mounted, so it is told
 * separately rather than through the event.
 */
function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
  act(() => {
    onlineManager.setOnline(value);
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  });
}

interface MountOptions {
  provider?: DocumentProvider;
  client?: QueryClient;
  pageId?: string | null;
  onEvent?: (event: DocsEvent) => void;
}

function mount(ui: React.ReactNode, options: MountOptions = {}): void {
  const provider = options.provider ?? createFileStoreProvider(new MemoryFileStore(seed));
  const pageId = options.pageId ?? null;
  const navigation: DocsNavigation = { activePageId: pageId, mode: 'read', navigate: vi.fn() };
  instance += 1;

  render(
    <DocsProvider
      provider={provider}
      navigation={navigation}
      instanceId={`offline-${String(instance)}`}
      queryClient={
        options.client ??
        new QueryClient({
          defaultOptions: {
            queries: { retry: false, networkMode: 'offlineFirst' },
            mutations: { retry: false, networkMode: 'offlineFirst' },
          },
        })
      }
      persist={false}
      onEvent={options.onEvent}
    >
      <TooltipProvider>{ui}</TooltipProvider>
    </DocsProvider>,
  );
}

afterEach(() => {
  cleanup();
  setOnline(true);
});

describe('structural actions offline (D-05)', () => {
  it('leaves the title readable and refuses to rename it', async () => {
    setOnline(false);
    const user = userEvent.setup();
    mount(
      <PageTitle
        pageId={PAGE_ID}
        title="One"
        mode="edit"
        editable
        onModeChange={vi.fn()}
        onGoToContent={vi.fn()}
      />,
    );

    const field = screen.getByRole('textbox', { name: 'Page title' });
    expect(field).toHaveAttribute('readonly');
    await user.hover(field);
    expect(await screen.findByText('Reconnect to change pages')).toBeVisible();
  });

  it('turns the icon button off with the same reason', async () => {
    setOnline(false);
    const user = userEvent.setup();
    mount(
      <PageIcon
        pageId={PAGE_ID}
        node={{ ...node, icon: { kind: 'emoji', value: '🚀' } }}
        mode="edit"
        editable
      />,
    );

    const button = screen.getByRole('button', { name: 'Change icon' });
    // Focusable on purpose: `aria-disabled` keeps the reason reachable from the keyboard.
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await user.hover(button);
    expect(await screen.findByText('Reconnect to change pages')).toBeVisible();
    // A disabled trigger opens nothing, so there is no picker behind it.
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('is the ordinary control again once the network is back', () => {
    setOnline(false);
    mount(
      <PageTitle
        pageId={PAGE_ID}
        title="One"
        mode="edit"
        editable
        onModeChange={vi.fn()}
        onGoToContent={vi.fn()}
      />,
    );

    setOnline(true);
    expect(screen.getByRole('textbox', { name: 'Page title' })).not.toHaveAttribute('readonly');
  });
});

describe('reads offline (docs/04 section 3.4)', () => {
  it('serves a page this device has already opened', async () => {
    // One client, two mounts: the second is the same workspace opened with no network, and
    // the cache is what answers it (docs/04 section 2).
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, networkMode: 'offlineFirst' },
        mutations: { retry: false, networkMode: 'offlineFirst' },
      },
    });
    mount(<DocsShell pageId={PAGE_ID} mode="read" />, { client, pageId: PAGE_ID });
    expect(await screen.findByText('Body text.')).toBeVisible();

    cleanup();
    setOnline(false);
    mount(<DocsShell pageId={PAGE_ID} mode="read" />, { client, pageId: PAGE_ID });
    expect(await screen.findByText('Body text.')).toBeVisible();
  });

  it('offers Retry instead of a skeleton for a page it has never seen', async () => {
    setOnline(false);
    const user = userEvent.setup();
    // The tree is the first read the shell makes, so `failNext` is the one it fails.
    mount(<DocsShell pageId={PAGE_ID} mode="read" />, {
      provider: createMemoryProvider({ files: seed }, { failNext: 'network' }),
      pageId: PAGE_ID,
    });

    expect(await screen.findByText('Not available offline')).toBeVisible();
    // The sidebar offers its own Retry for the same read: this is the content region's.
    const content = within(screen.getByRole('region', { name: 'Document' }));
    await user.click(content.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Body text.')).toBeVisible();
  });

  it('shows the same card when the host’s own client pauses the read', async () => {
    setOnline(false);
    // Query's default `networkMode`, which a host client brings with it: the fetch never runs.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mount(<DocsShell pageId={PAGE_ID} mode="read" />, { client, pageId: PAGE_ID });

    expect(await screen.findByText('Not available offline')).toBeVisible();
  });
});
