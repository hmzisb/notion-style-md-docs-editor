import type { NodeId, PageMode } from '@docs/core';
import { PanelLeftOpen } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useRecents } from '@/data/cache/recents.js';
import { useDocs } from '@/data/context.js';
import { useTreeIndex } from '@/data/queries.js';
import { seedSidebar, useSidebarStore } from '@/data/sidebar-store.js';
import { format } from '@/data/strings.js';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/button';
import { SidebarProvider, useSidebar } from '@/ui/sidebar';
import { DocsSidebar } from './DocsSidebar.js';
import { PageHeader } from './PageHeader.js';
import { ShellContent } from './ShellContent.js';

/** `--docs-sidebar-min` and `--docs-sidebar-max` from docs/06 section 2. */
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export interface DocsShellSlots {
  sidebarHeader?: ReactNode;
  sidebarFooter?: ReactNode;
  headerActions?: ReactNode;
  emptyState?: ReactNode;
  pageMenuItems?: ReactNode;
}

export interface DocsShellSidebarOptions {
  /** Used only the first time this namespace is seen; after that the store remembers. */
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export interface DocsShellProps {
  pageId: NodeId | null;
  mode: PageMode;
  rootId?: NodeId;
  slots?: DocsShellSlots;
  sidebar?: DocsShellSidebarOptions;
  editor?: { toolbar?: 'floating' | 'fixed' | 'none'; preload?: 'idle' | 'hover' | 'never' };
  onThemeChange?: (theme: 'light' | 'dark' | 'system') => void;
  /** Applied to `.docs-root`, which is the grid itself. */
  className?: string;
}

/**
 * docs/06 section 4: two grid columns, the sidebar's animating between its width and zero.
 * The shadcn `SidebarProvider` is kept for what it is good at — the mobile sheet, `Cmd+\` and
 * the media query — while the desktop layout is this grid rather than its fixed overlay.
 */
export function DocsShell({
  pageId,
  rootId,
  slots,
  sidebar,
  className,
}: DocsShellProps): React.JSX.Element {
  const { ns } = useDocs();
  const collapsible = sidebar?.collapsible ?? true;
  const minWidth = sidebar?.minWidth ?? MIN_WIDTH;
  const maxWidth = sidebar?.maxWidth ?? MAX_WIDTH;

  // Before the reads below subscribe, so a host default is never painted over a frame later.
  useOnce(() => {
    seedSidebar(ns, { width: sidebar?.defaultWidth, collapsed: sidebar?.defaultCollapsed });
  });

  const setCollapsed = useSidebarStore((state) => state.setCollapsed);
  const collapsed = useSidebarStore((state) => state.collapsed) && collapsible;
  const storedWidth = useSidebarStore((state) => state.width);
  const width = Math.max(minWidth, Math.min(maxWidth, storedWidth));
  const sidebarId = useId();

  return (
    <SidebarProvider
      open={!collapsed}
      onOpenChange={(open) => {
        if (collapsible) setCollapsed(!open);
      }}
      className={cn(
        'docs-root grid h-full min-h-0 w-full grid-cols-1 overflow-hidden bg-background text-foreground',
        'md:grid-cols-[var(--docs-sidebar-width)_1fr] md:transition-[grid-template-columns] md:duration-200 md:ease-in-out',
        className,
      )}
      style={
        {
          '--docs-sidebar-width': collapsed ? '0px' : `${String(width)}px`,
          // What the sidebar column itself measures, so its content does not squash while it closes.
          '--sidebar-width': `${String(width)}px`,
        } as React.CSSProperties
      }
    >
      <ShellBody
        pageId={pageId}
        rootId={rootId}
        slots={slots}
        collapsible={collapsible}
        minWidth={minWidth}
        maxWidth={maxWidth}
        sidebarId={sidebarId}
      />
    </SidebarProvider>
  );
}

interface ShellBodyProps {
  pageId: NodeId | null;
  rootId?: NodeId;
  slots?: DocsShellSlots;
  collapsible: boolean;
  minWidth: number;
  maxWidth: number;
  sidebarId: string;
}

function ShellBody({
  pageId,
  rootId,
  slots,
  collapsible,
  minWidth,
  maxWidth,
  sidebarId,
}: ShellBodyProps): React.JSX.Element {
  const { navigation, strings } = useDocs();
  const { isMobile, open, toggleSidebar } = useSidebar();
  const [scrolled, setScrolled] = useState(false);

  const openPage = useCallback(
    (id: NodeId, opts?: { mode?: PageMode }) => {
      navigation.navigate({ pageId: id, ...(opts?.mode === undefined ? {} : { mode: opts.mode }) });
    },
    [navigation],
  );
  const goHome = useCallback(() => {
    navigation.navigate({ pageId: null });
  }, [navigation]);

  // Collapsed or on a phone, the only way back to the tree is this button (docs/06 sections 4-5).
  const leading =
    isMobile || !open ? (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-expanded={isMobile ? undefined : false}
        aria-controls={sidebarId}
        aria-label={strings['tree.expandSidebar']}
        onClick={toggleSidebar}
        className="max-md:size-11"
      >
        <PanelLeftOpen aria-hidden="true" />
      </Button>
    ) : null;

  return (
    <>
      <DocsSidebar
        id={sidebarId}
        activeId={pageId}
        onOpen={openPage}
        onHome={goHome}
        rootId={rootId}
        collapsible={collapsible}
        minWidth={minWidth}
        maxWidth={maxWidth}
        slots={{ header: slots?.sidebarHeader, footer: slots?.sidebarFooter }}
      />
      <section
        role="region"
        aria-label={strings['header.document']}
        className="flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain"
        onScroll={(event) => {
          setScrolled(event.currentTarget.scrollTop > 0);
        }}
      >
        <PageHeader
          pageId={pageId}
          onOpen={openPage}
          rootId={rootId}
          leading={leading}
          actions={slots?.headerActions}
          scrolled={scrolled}
        />
        <ShellContent
          pageId={pageId}
          rootId={rootId}
          emptyState={slots?.emptyState}
          onOpen={openPage}
          onHome={goHome}
        />
      </section>
      <OpenedAnnouncer pageId={pageId} rootId={rootId} />
    </>
  );
}

/**
 * docs/07 section 9: the page change itself is silent for a screen reader, because focus stays
 * where it was. The same effect records the page for the palette's Recent group.
 */
function OpenedAnnouncer({
  pageId,
  rootId,
}: {
  pageId: NodeId | null;
  rootId?: NodeId;
}): React.JSX.Element {
  const { strings } = useDocs();
  const { data: index } = useTreeIndex(rootId);
  const record = useRecents((state) => state.record);
  const setLastOpenedPageId = useSidebarStore((state) => state.setLastOpenedPageId);
  const [message, setMessage] = useState('');
  const title = pageId === null ? null : (index?.byId[pageId]?.title ?? null);

  useEffect(() => {
    setLastOpenedPageId(pageId);
    if (pageId === null) {
      setMessage('');
      return;
    }
    record(pageId);
    if (title !== null) setMessage(format(strings['status.opened'], { title }));
  }, [pageId, title, record, setLastOpenedPageId, strings]);

  return (
    <div aria-live="polite" className="sr-only">
      {message}
    </div>
  );
}

/** Runs its effect during the first render, before anything below it reads the store. */
function useOnce(effect: () => void): void {
  const done = useRef(false);
  if (!done.current) {
    done.current = true;
    effect();
  }
}
