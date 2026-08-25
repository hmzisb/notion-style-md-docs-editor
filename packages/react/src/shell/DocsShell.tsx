import type { NodeId, PageMode } from '@docs/core';
import { PanelLeftOpen } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useRecents } from '@/data/cache/recents.js';
import { useDocs } from '@/data/context.js';
import { useTreeIndex } from '@/data/queries.js';
import { preloadEditor, useEditorChunk } from '@/editor-chunk.js';
import { seedSidebar, useSidebarStore } from '@/data/sidebar-store.js';
import { format } from '@/data/strings.js';
import { ALL_SCOPES, useHotkeys, type Hotkey } from '@/lib/hotkeys';
import { cancelIdle, requestIdle } from '@/lib/idle';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/button';
import { SidebarProvider, useSidebar } from '@/ui/sidebar';
import { Toaster } from '@/ui/sonner';
import { CommandPalette } from './CommandPalette.js';
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
  mode,
  rootId,
  slots,
  sidebar,
  editor,
  onThemeChange,
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
  // `.docs-root` itself: what the shortcuts measure "inside the module" against (docs/07 §1).
  const rootRef = useRef<HTMLDivElement>(null);

  return (
    <SidebarProvider
      ref={rootRef}
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
        mode={mode}
        rootId={rootId}
        slots={slots}
        editor={editor}
        collapsible={collapsible}
        minWidth={minWidth}
        maxWidth={maxWidth}
        sidebarId={sidebarId}
        rootRef={rootRef}
        onThemeChange={onThemeChange}
      />
    </SidebarProvider>
  );
}

interface ShellBodyProps {
  pageId: NodeId | null;
  mode: PageMode;
  rootId?: NodeId;
  slots?: DocsShellSlots;
  editor?: DocsShellProps['editor'];
  collapsible: boolean;
  minWidth: number;
  maxWidth: number;
  sidebarId: string;
  rootRef: React.RefObject<HTMLDivElement | null>;
  onThemeChange?: (theme: 'light' | 'dark' | 'system') => void;
}

/** P2 flushes the open draft here; in P1 the point is that the browser offers nothing. */
const swallow = (): void => undefined;

function ShellBody({
  pageId,
  mode,
  rootId,
  slots,
  editor,
  collapsible,
  minWidth,
  maxWidth,
  sidebarId,
  rootRef,
  onThemeChange,
}: ShellBodyProps): React.JSX.Element {
  const { navigation, strings, capabilities } = useDocs();
  const { isMobile, open, openMobile, toggleSidebar } = useSidebar();
  const { data: index } = useTreeIndex(rootId);
  const [scrolled, setScrolled] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // The scroll container, the `E`/`Enter` scope, and where focus lands on the way out of edit.
  const regionRef = useRef<HTMLElement>(null);
  const chunk = useEditorChunk();

  const openPage = useCallback(
    (id: NodeId, opts?: { mode?: PageMode }) => {
      // docs/07 section 7: navigating away from an edit opens the next page in read mode.
      navigation.navigate({ pageId: id, mode: opts?.mode ?? 'read' });
    },
    [navigation],
  );

  /** docs/07 section 7: the mode is part of the URL, but not part of its history. */
  const setMode = useCallback(
    (next: PageMode) => {
      if (pageId === null) return;
      navigation.navigate({ pageId, mode: next }, { replace: true });
      if (next === 'read') regionRef.current?.focus();
    },
    [navigation, pageId],
  );

  // docs/05 section 8: idle after first paint, so the first Edit click has nothing to wait for.
  const preload = editor?.preload ?? 'idle';
  useEffect(() => {
    if (!capabilities.write || preload !== 'idle') return;
    const idle = requestIdle(() => {
      void preloadEditor();
    });
    return () => {
      cancelIdle(idle);
    };
  }, [capabilities.write, preload]);

  const warm = useCallback(() => {
    if (capabilities.write && preload !== 'never') void preloadEditor();
  }, [capabilities.write, preload]);
  const goHome = useCallback(() => {
    navigation.navigate({ pageId: null });
  }, [navigation]);
  const openPalette = useCallback(() => {
    setPaletteOpen(true);
  }, []);
  // Creation is wired in P3-T01 (docs/09); until then the palette says so instead of lying.
  const createPage = useCallback(() => {
    toast(strings['palette.createUnavailable']);
  }, [strings]);

  useHotkeys(
    [
      // docs/07 section 2. `Cmd+K` is the editor's Link, so only `Cmd+P` reaches in there.
      { keys: 'Mod+P', scopes: ['global', 'tree', 'content', 'editor'], run: openPalette },
      { keys: 'Mod+K', run: openPalette },
      { keys: 'Mod+S', scopes: ALL_SCOPES, run: swallow },
      {
        keys: 'Mod+Shift+U',
        run: () => {
          const parentId = pageId === null ? null : (index?.byId[pageId]?.parentId ?? null);
          if (parentId !== null) openPage(parentId);
        },
      },
      ...(capabilities.write
        ? ([
            { keys: 'Mod+Alt+N', run: createPage },
            {
              keys: 'Mod+Shift+E',
              scopes: ALL_SCOPES,
              run: () => {
                setMode(mode === 'edit' ? 'read' : 'edit');
              },
            },
          ] satisfies Hotkey[])
        : []),
      // Read mode leaves `Esc` to the tree and to whatever dialog is open.
      ...(mode === 'edit'
        ? ([
            {
              keys: 'Escape',
              scopes: ALL_SCOPES,
              run: () => {
                setMode('read');
              },
            },
          ] satisfies Hotkey[])
        : []),
    ],
    rootRef,
  );

  // Collapsed or on a phone, the only way back to the tree is this button (docs/06 sections 4-5).
  const leading =
    isMobile || !open ? (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-expanded={isMobile ? undefined : false}
        // On a phone the sidebar is a sheet, so while it is closed there is no element with
        // this id and a dangling `aria-controls` is an invalid value, not a hint.
        aria-controls={isMobile && !openMobile ? undefined : sidebarId}
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
        onSearch={openPalette}
        rootId={rootId}
        collapsible={collapsible}
        minWidth={minWidth}
        maxWidth={maxWidth}
        slots={{ header: slots?.sidebarHeader, footer: slots?.sidebarFooter }}
      />
      <section
        ref={regionRef}
        role="region"
        aria-label={strings['header.document']}
        data-docs-content=""
        // Focusable only as a target: `Esc` and Done put focus back here (docs/07 section 7).
        tabIndex={-1}
        className="flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain outline-none"
        onScroll={(event) => {
          setScrolled(event.currentTarget.scrollTop > 0);
        }}
        onPointerEnter={warm}
        onFocus={warm}
      >
        <PageHeader
          pageId={pageId}
          onOpen={openPage}
          rootId={rootId}
          leading={leading}
          actions={slots?.headerActions}
          onSearch={openPalette}
          mode={mode}
          onModeChange={setMode}
          editorLoading={mode === 'edit' && chunk === null}
          scrolled={scrolled}
        />
        <ShellContent
          pageId={pageId}
          rootId={rootId}
          mode={mode}
          regionRef={regionRef}
          toolbar={editor?.toolbar}
          onModeChange={setMode}
          emptyState={slots?.emptyState}
          onOpen={openPage}
          onHome={goHome}
        />
      </section>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        rootId={rootId}
        onOpenPage={openPage}
        onCreatePage={createPage}
        onThemeChange={onThemeChange}
      />
      {/*
        docs/07 section 10: one toaster, mounted by the shell, inside `.docs-root` so it inherits
        the module's variables. Sonner wraps its list in a plain static `<section>`, which the
        grid would otherwise place in a second row and halve the two columns; `fixed` keeps it
        out of the flow, and the list inside it is fixed to the viewport anyway.
      */}
      <div className="fixed">
        <Toaster position="bottom-right" duration={4000} />
      </div>
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
