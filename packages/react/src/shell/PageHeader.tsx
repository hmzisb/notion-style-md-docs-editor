import type { NodeId, PageMode } from '@docs/core';
import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { useDocs } from '@/data/context.js';
import { useTreeIndex } from '@/data/queries.js';
import { useSessionState } from '@/data/session-store.js';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/button';
import { Skeleton } from '@/ui/skeleton';
import { Breadcrumbs } from './Breadcrumbs.js';
import { ModeToggle } from './ModeToggle.js';
import { SaveStatus } from './SaveStatus.js';

export interface PageHeaderProps {
  pageId: NodeId | null;
  onOpen: (id: NodeId) => void;
  /** Scopes the breadcrumb trail the same way `PageTree` is scoped. */
  rootId?: NodeId;
  /** Left of the breadcrumbs: the shell puts the sidebar open button or sheet trigger here. */
  leading?: ReactNode;
  /** Right of the reserved status area (docs/06 §6: the host `headerActions` slot). */
  actions?: ReactNode;
  /** With `onModeChange`, renders the `ModeToggle` between the status area and the actions. */
  mode?: PageMode;
  onModeChange?: (mode: PageMode) => void;
  /** The editor chunk is still loading, so the toggle spins (docs/05 section 8). */
  editorLoading?: boolean;
  /** Below 768 px the sidebar is a sheet, so the palette needs a way in from here (docs/07 §4). */
  onSearch?: () => void;
  /** The content region has been scrolled past 0, which fades the bottom border in. */
  scrolled?: boolean;
  className?: string;
}

/**
 * docs/06 section 6. Sticky inside the content region, so it needs the scroll state from
 * whoever owns that scroll container rather than reading it itself.
 */
export function PageHeader({
  pageId,
  onOpen,
  rootId,
  leading,
  actions,
  onSearch,
  mode = 'read',
  onModeChange,
  editorLoading = false,
  scrolled = false,
  className,
}: PageHeaderProps): React.JSX.Element {
  const { ns, strings, capabilities } = useDocs();
  const isMobile = useIsMobile();
  const { data: index, isPending } = useTreeIndex(rootId);
  const session = useSessionState(ns, pageId);

  return (
    <header
      className={cn(
        'sticky top-0 z-10 flex h-11 shrink-0 items-center gap-1 border-b border-transparent bg-background/80 px-3 backdrop-blur transition-colors',
        scrolled && 'border-border',
        className,
      )}
    >
      {leading}
      {pageId !== null &&
        (isPending ? (
          <Skeleton className="h-4 w-40" />
        ) : index === undefined ? null : (
          <Breadcrumbs index={index} pageId={pageId} onOpen={onOpen} compact={isMobile} />
        ))}
      <div className="ms-auto flex items-center gap-2">
        {/*
         * Reserved even while empty (docs/06 section 15): the save status appears mid-edit and
         * must not push the actions to the left when it does.
         */}
        {/* `role="status"` is what makes the name legal here: a bare `div` may not carry one. */}
        <div
          role="status"
          aria-live="polite"
          aria-label={strings['status.label']}
          className="hidden min-w-[96px] justify-end text-end md:flex"
        >
          <SaveStatus pageId={pageId} />
        </div>
        {pageId !== null && onModeChange !== undefined && capabilities.write && (
          <ModeToggle
            mode={mode}
            onChange={onModeChange}
            loading={editorLoading}
            savedAt={session?.status === 'clean' ? session.lastSavedAt : null}
          />
        )}
        {isMobile && onSearch !== undefined && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={strings['tree.search']}
            onClick={onSearch}
            className="size-11"
          >
            <Search aria-hidden="true" />
          </Button>
        )}
        {actions !== undefined && actions !== null && (
          <div
            role="toolbar"
            aria-label={strings['header.actions']}
            className="flex items-center gap-1"
          >
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
