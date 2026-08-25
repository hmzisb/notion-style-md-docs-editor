import {
  CONTRACT_VERSION,
  isProviderError,
  type NodeId,
  type PageMode,
  type TreeIndex,
  type TreeNode,
} from '@docs/core';
import { FilePlus, FileText, FileX, Folder, TriangleAlert, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { useDocs } from '@/data/context.js';
import { usePage, useTreeIndex } from '@/data/queries.js';
import { IconGlyph } from '@/tree/IconGlyph.js';
import { Button } from '@/ui/button';
import { Skeleton } from '@/ui/skeleton';
import { EmptyState } from './EmptyState.js';
import { PageCanvas } from './PageCanvas.js';

export interface ShellContentProps {
  pageId: NodeId | null;
  rootId?: NodeId;
  mode: PageMode;
  /** The content region: the canvas restores its scroll offset on the mode swap. */
  regionRef: React.RefObject<HTMLElement | null>;
  toolbar?: 'floating' | 'fixed' | 'none';
  onModeChange: (mode: PageMode) => void;
  /** Replaces the "Select a page" card only: every other card reports a real failure. */
  emptyState?: ReactNode;
  onOpen: (id: NodeId) => void;
  onHome: () => void;
}

/**
 * The content region's states, in the order docs/06 section 11 and docs/07 section 8 list them.
 * The page itself is `PageCanvas`, which owns the read/edit swap (docs/05 section 8).
 */
export function ShellContent({
  pageId,
  rootId,
  mode,
  regionRef,
  toolbar,
  onModeChange,
  emptyState,
  onOpen,
  onHome,
}: ShellContentProps): React.JSX.Element {
  const { meta, strings } = useDocs();
  const tree = useTreeIndex(rootId);
  const found = pageId === null ? null : (tree.data?.byId[pageId] ?? null);
  // A folder has no page behind it (docs/03 section 4.1), so there is nothing to fetch.
  const page = usePage(found?.kind === 'folder' ? null : pageId);

  if (meta !== null && meta.contractVersion > CONTRACT_VERSION) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title={strings['empty.contractTooNew.title']}
        body={strings['empty.contractTooNew.body']}
      />
    );
  }

  if (tree.error !== null) {
    return (
      <FailureCard
        error={tree.error}
        onRetry={() => {
          void tree.refetch();
        }}
        onHome={onHome}
      />
    );
  }

  if (tree.isPending) return <CanvasSkeleton />;
  const index = tree.data;

  if (pageId === null) {
    if (index.rootIds.length === 0) {
      return (
        <EmptyState
          icon={FilePlus}
          title={strings['empty.noPages.title']}
          body={strings['empty.noPages.body']}
        />
      );
    }
    if (emptyState !== undefined && emptyState !== null) return <>{emptyState}</>;
    return (
      <EmptyState
        icon={FileText}
        title={strings['empty.noSelection.title']}
        body={strings['empty.noSelection.body']}
      />
    );
  }

  const node = index.byId[pageId] ?? null;
  if (node === null) {
    return (
      <EmptyState
        icon={FileX}
        title={strings['empty.notFound.title']}
        body={strings['empty.notFound.body']}
        action={{ label: strings['empty.notFound.action'], onClick: onHome }}
      />
    );
  }

  if (node.kind === 'folder') {
    return (
      <EmptyState
        icon={Folder}
        title={strings['empty.folder.title']}
        body={strings['empty.folder.body']}
      >
        <ChildList index={index} node={node} onOpen={onOpen} />
      </EmptyState>
    );
  }

  if (page.isPending) return <CanvasSkeleton />;
  if (page.error !== null) {
    return (
      <FailureCard
        error={page.error}
        onRetry={() => {
          void page.refetch();
        }}
        onHome={onHome}
      />
    );
  }

  return (
    // The page id is the session (docs/05 section 8): a new page opens in read mode again.
    <PageCanvas
      key={node.id}
      page={page.data}
      node={node}
      rootId={rootId}
      mode={mode}
      regionRef={regionRef}
      toolbar={toolbar}
      onModeChange={onModeChange}
    />
  );
}

/** docs/07 section 8: title plus six lines, and only when nothing was cached. */
function CanvasSkeleton(): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="mx-auto w-full max-w-[calc(var(--docs-content-width)+8rem)] px-4 pt-20 md:px-16 md:pt-[88px]"
    >
      <Skeleton className="h-9 w-1/2" />
      <div className="space-y-3 pt-8">
        {['92%', '86%', '95%', '70%', '90%', '60%'].map((width) => (
          <Skeleton key={width} className="h-4" style={{ width }} />
        ))}
      </div>
    </div>
  );
}

/**
 * Provider failures share one card. `not_found` is the page-level version of the missing-node
 * card; everything else is "unavailable, try again", with the offline variant when the browser
 * already knows there is no network (docs/06 section 11).
 */
function FailureCard({
  error,
  onRetry,
  onHome,
}: {
  error: Error;
  onRetry: () => void;
  onHome: () => void;
}): React.JSX.Element {
  const { strings } = useDocs();
  const code = isProviderError(error) ? error.code : null;

  if (code === 'not_found') {
    return (
      <EmptyState
        icon={FileX}
        title={strings['empty.notFound.title']}
        body={strings['empty.notFound.body']}
        action={{ label: strings['empty.notFound.action'], onClick: onHome }}
      />
    );
  }

  const offline = code === 'network' && typeof navigator !== 'undefined' && !navigator.onLine;
  if (offline) {
    return (
      <EmptyState
        icon={WifiOff}
        title={strings['empty.offline.title']}
        body={strings['empty.offline.body']}
        action={{ label: strings['empty.offline.action'], onClick: onRetry }}
      />
    );
  }

  return (
    <EmptyState
      icon={TriangleAlert}
      title={strings['empty.unreachable.title']}
      body={error.message}
      action={{ label: strings['empty.unreachable.action'], onClick: onRetry }}
    />
  );
}

/** Read hosts cannot create the missing index page, so the folder card offers its children. */
function ChildList({
  index,
  node,
  onOpen,
}: {
  index: TreeIndex;
  node: TreeNode;
  onOpen: (id: NodeId) => void;
}): React.JSX.Element | null {
  const children = node.childIds
    .map((id) => index.byId[id])
    .filter((child): child is TreeNode => child !== undefined);
  if (children.length === 0) return null;

  return (
    <ul className="mt-4 space-y-0.5 text-start">
      {children.map((child) => (
        <li key={child.id}>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-full justify-start gap-1.5 px-1.5 font-normal"
            onClick={() => {
              onOpen(child.id);
            }}
          >
            <IconGlyph icon={child.icon} kind={child.kind} />
            <span className="truncate">{child.title}</span>
          </Button>
        </li>
      ))}
    </ul>
  );
}
