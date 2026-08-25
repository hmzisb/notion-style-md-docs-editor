import type { NodeId, PageMode } from '@docs/core';
import { House, PanelLeftClose } from 'lucide-react';
import type { ReactNode } from 'react';
import { useDocs } from '@/data/context.js';
import { DEFAULT_SIDEBAR_WIDTH, useSidebarStore } from '@/data/sidebar-store.js';
import { cn } from '@/lib/utils';
import { PageTree } from '@/tree/PageTree.js';
import { Button } from '@/ui/button';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, useSidebar } from '@/ui/sidebar';
import { ResizeHandle } from './ResizeHandle.js';

export interface DocsSidebarProps {
  id: string;
  activeId: NodeId | null;
  onOpen: (id: NodeId, opts?: { mode?: PageMode }) => void;
  onHome: () => void;
  rootId?: NodeId;
  collapsible: boolean;
  minWidth: number;
  maxWidth: number;
  slots?: { header?: ReactNode; footer?: ReactNode };
}

/**
 * docs/06 section 5. On desktop this is a plain column inside the shell's grid cell, which is
 * what animates to zero on collapse; below 768 px the same content is a left sheet, which is
 * the one case where shadcn's `Sidebar` does the work itself.
 */
export function DocsSidebar({
  id,
  activeId,
  onOpen,
  onHome,
  rootId,
  collapsible,
  minWidth,
  maxWidth,
  slots,
}: DocsSidebarProps): React.JSX.Element {
  const { meta, strings } = useDocs();
  const { isMobile, open, toggleSidebar } = useSidebar();
  const width = useSidebarStore((state) => state.width);
  const setWidth = useSidebarStore((state) => state.setWidth);

  const body = (
    <Sidebar
      collapsible={isMobile ? 'offcanvas' : 'none'}
      className="h-full min-h-0 border-e border-sidebar-border"
    >
      <SidebarHeader className="gap-0 p-0">
        <div className="flex h-11 items-center justify-between gap-1 px-2">
          <span className="truncate text-sm font-medium">
            {meta?.title ?? strings['tree.workspace']}
          </span>
          {collapsible && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-expanded={isMobile ? undefined : open}
              aria-controls={id}
              aria-label={strings['tree.collapseSidebar']}
              onClick={toggleSidebar}
              // Pointer-only affordance on desktop; touch has no hover, so it stays visible.
              className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover/docs-sidebar:opacity-100 max-md:size-11 max-md:opacity-100"
            >
              <PanelLeftClose aria-hidden="true" />
            </Button>
          )}
        </div>
        {slots?.header}
      </SidebarHeader>

      {/* docs/07 section 9: the sidebar is the `Pages` landmark; the tree inside it is a `tree`. */}
      <nav id={id} aria-label={strings['tree.label']} className="flex min-h-0 flex-1 flex-col">
        <div className="space-y-0.5 px-2 pt-1 pb-2">
          <NavRow
            icon={<House aria-hidden="true" className="size-4 text-muted-foreground/70" />}
            onClick={onHome}
          >
            {strings['tree.home']}
          </NavRow>
        </div>
        <SidebarContent className="min-h-0 flex-1 overflow-hidden px-0">
          <PageTree activeId={activeId} onOpen={onOpen} rootId={rootId} />
        </SidebarContent>
      </nav>

      {slots?.footer !== undefined && slots.footer !== null && (
        <SidebarFooter className="border-t border-sidebar-border p-2">{slots.footer}</SidebarFooter>
      )}
    </Sidebar>
  );

  if (isMobile) return body;

  return (
    <div className="group/docs-sidebar relative h-full min-h-0 overflow-hidden bg-sidebar">
      {body}
      <ResizeHandle
        width={width}
        min={minWidth}
        max={maxWidth}
        onWidth={setWidth}
        onReset={() => {
          setWidth(DEFAULT_SIDEBAR_WIDTH);
        }}
      />
    </div>
  );
}

/** docs/06 section 5: the nav rows share the tree row's geometry so the column reads as one list. */
function NavRow({
  icon,
  onClick,
  children,
}: {
  icon: ReactNode;
  onClick: () => void;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-7 w-full items-center gap-1 rounded-md px-1 text-sm text-sidebar-foreground/85 max-md:h-11',
        'hover:bg-sidebar-accent/70 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset focus-visible:outline-none',
      )}
    >
      <span className="flex size-5 items-center justify-center">{icon}</span>
      <span className="truncate">{children}</span>
    </button>
  );
}
