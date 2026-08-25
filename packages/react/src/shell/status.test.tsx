import { MemoryFileStore, createFileStoreProvider, type DocumentProvider } from '@docs/core';
import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Value } from 'platejs';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocsProvider } from '@/data/DocsProvider.js';
import { useDocs } from '@/data/context.js';
import { registerSession, type DocumentSession } from '@/data/session.js';
import { sessionStoreFor, type SessionState } from '@/data/session-store.js';
import type { DocsNavigation } from '@/data/types.js';
import { TooltipProvider } from '@/ui/tooltip';
import { PageBanners } from './Banners.js';
import { SaveStatus } from './SaveStatus.js';

const PAGE_ID = 'p_one';
const files = { 'one.md': `---\nid: ${PAGE_ID}\ntitle: One\n---\n\nBody.\n` };

let ns = '';
let instance = 0;

function Probe(): null {
  ns = useDocs().ns;
  return null;
}

function mount(ui: ReactNode, write = true): void {
  const base: DocumentProvider = createFileStoreProvider(new MemoryFileStore(files));
  const capabilities = { ...base.capabilities, write };
  const provider: DocumentProvider = {
    ...base,
    capabilities,
    getMeta: async () => ({ ...(await base.getMeta()), capabilities }),
  };
  const navigation: DocsNavigation = { activePageId: PAGE_ID, mode: 'read', navigate: vi.fn() };
  instance += 1;

  render(
    <DocsProvider
      provider={provider}
      navigation={navigation}
      instanceId={`status-${String(instance)}`}
      queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      persist={false}
    >
      <Probe />
      <TooltipProvider>
        <div className="docs-root">{ui}</div>
      </TooltipProvider>
    </DocsProvider>,
  );
}

/** The session store is what both components read; the write path has its own suite. */
function setState(patch: Partial<SessionState>): void {
  act(() => {
    sessionStoreFor(ns).getState().patch(PAGE_ID, patch);
  });
}

function stubSession(overrides: Partial<DocumentSession> = {}): DocumentSession {
  return {
    value: [] as Value,
    fidelity: { level: 'exact', reasons: [] },
    status: 'clean',
    draftRestored: false,
    bind: vi.fn(),
    onChange: vi.fn(),
    flush: vi.fn(() => Promise.resolve()),
    discard: vi.fn(),
    resolveConflict: vi.fn(() => Promise.resolve()),
    resolveDraft: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SaveStatus (docs/06 section 9)', () => {
  it('says nothing while the page is clean', () => {
    mount(<SaveStatus pageId={PAGE_ID} />);
    setState({ status: 'clean' });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('stays quiet while a save is already scheduled, and speaks when it is not', async () => {
    mount(<SaveStatus pageId={PAGE_ID} />);
    setState({ status: 'dirty', pending: true });
    expect(screen.queryByText('Unsaved changes')).toBeNull();

    setState({ status: 'dirty', pending: false });
    expect(await screen.findByText('Unsaved changes')).toBeVisible();
  });

  it('holds the spinner back for 800 ms', () => {
    vi.useFakeTimers();
    mount(<SaveStatus pageId={PAGE_ID} />);
    setState({ status: 'saving' });
    expect(screen.queryByText('Saving…')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(screen.getByText('Saving…')).toBeVisible();

    setState({ status: 'saved' });
    expect(screen.queryByText('Saving…')).toBeNull();
  });

  it.each([
    ['offline', 'Offline, retrying'],
    ['conflict', 'Changed on disk'],
    ['draft', 'Restored draft'],
    ['error', "Couldn't save"],
  ] as const)('labels %s', async (status, label) => {
    mount(<SaveStatus pageId={PAGE_ID} />);
    setState({ status });
    expect(await screen.findByText(label)).toBeVisible();
  });

  it.each(['dirty', 'error', 'offline'] as const)('saves now from %s', async (status) => {
    const flush = vi.fn(() => Promise.resolve());
    mount(<SaveStatus pageId={PAGE_ID} />);
    const off = registerSession(ns, PAGE_ID, flush);
    setState({ status, pending: false });

    await userEvent.click(await screen.findByRole('button'));
    expect(flush).toHaveBeenCalledTimes(1);
    off();
  });

  it('scrolls to the banner from the conflict and draft pills', async () => {
    const scrollIntoView = vi.fn();
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(scrollIntoView);
    mount(
      <>
        <SaveStatus pageId={PAGE_ID} />
        <div data-docs-banner="conflict" />
      </>,
    );
    setState({ status: 'conflict' });

    await userEvent.click(await screen.findByRole('button'));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });

  it('tells the reader when the next retry is due', async () => {
    mount(<SaveStatus pageId={PAGE_ID} />);
    setState({ status: 'offline', retryAt: Date.now() + 30_000 });

    await userEvent.hover(await screen.findByRole('button'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Next retry');
  });

  it('offers the last save time on everything else', async () => {
    mount(<SaveStatus pageId={PAGE_ID} />);
    setState({ status: 'error', lastSavedAt: Date.now() - 120_000 });

    await userEvent.hover(await screen.findByRole('button'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Saved 2m ago');
  });
});

describe('PageBanners (docs/06 section 10)', () => {
  const banners = (session: DocumentSession, props: { largePage?: boolean } = {}): void => {
    mount(
      <PageBanners pageId={PAGE_ID} session={session} mode="read" onEdit={vi.fn()} {...props} />,
    );
  };

  it('interrupts for a conflict and offers both ways out', async () => {
    const session = stubSession();
    banners(session);
    setState({ status: 'conflict' });

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('Changed on disk since you opened it.');

    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(session.resolveConflict).toHaveBeenCalledWith('reload');
    await userEvent.click(screen.getByRole('button', { name: 'Overwrite' }));
    expect(session.resolveConflict).toHaveBeenCalledWith('overwrite');
  });

  it('says when a restored draft was written, and waits for an answer', async () => {
    const session = stubSession();
    banners(session);
    setState({ status: 'draft', draftRestored: true, draftAt: Date.now() - 3_600_000 });

    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent('Restored unsaved changes from 1h ago.');

    await userEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(session.resolveDraft).toHaveBeenCalledWith('keep');
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(session.resolveDraft).toHaveBeenCalledWith('discard');
  });

  it('offers the file or the draft when they started from different versions', async () => {
    const session = stubSession();
    banners(session);
    setState({ draftMismatch: true, draftAt: Date.now() });

    expect(await screen.findByText('This page changed since your unsaved edits.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Apply draft' }));
    expect(session.resolveDraft).toHaveBeenCalledWith('keep');
    await userEvent.click(screen.getByRole('button', { name: 'Keep file' }));
    expect(session.resolveDraft).toHaveBeenCalledWith('discard');
  });

  it('names what editing would drop, and lists it on request', async () => {
    const session = stubSession({
      fidelity: { level: 'lossy', reasons: ['footnoteDefinition', 'html', 'unknown_node:mdxFlow'] },
    });
    banners(session);

    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent(
      "Some content here can't be edited without changes: footnotes, raw HTML, mdxFlow blocks. Editing will drop it.",
    );
    expect(screen.queryByRole('list')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Learn more' }));
    expect(screen.getByRole('list')).toHaveTextContent('raw HTML');
    expect(screen.getByRole('button', { name: 'Learn more' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('keeps quiet about fidelity when the host cannot write', async () => {
    const session = stubSession({ fidelity: { level: 'lossy', reasons: ['html'] } });
    mount(<PageBanners pageId={PAGE_ID} session={session} mode="read" onEdit={vi.fn()} />, false);
    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull();
    });
  });

  it('explains a page that opened read-only, and hands it over on request', async () => {
    const onEdit = vi.fn();
    mount(
      <PageBanners
        pageId={PAGE_ID}
        session={stubSession()}
        mode="read"
        largePage
        onEdit={onEdit}
      />,
    );

    expect(
      await screen.findByText('Large page: opened in read mode for performance.'),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Edit anyway' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('renders nothing at all on a page with nothing to say', async () => {
    banners(stubSession());
    await waitFor(() => {
      expect(document.body.querySelector('[data-docs-banner]')).toBeNull();
    });
  });
});
