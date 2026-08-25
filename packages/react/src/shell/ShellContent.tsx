import {
  CONTRACT_VERSION,
  isProviderError,
  type NodeId,
  type PageDocument,
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

export interface ShellContentProps {
  pageId: NodeId | null;
  rootId?: NodeId;
  /** Replaces the "Select a page" card only: every other card reports a real failure. */
  emptyState?: ReactNode;
  onOpen: (id: NodeId) => void;
  onHome: () => void;
}

/**
 * The content region's states, in the order docs/06 section 11 and docs/07 section 8 list them.
 * The document itself is still a title block: `DocumentView` lands under it in P1-T08.
 */
export function ShellContent({
  pageId,
  rootId,
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

  return <PageCanvas page={page.data} node={node} />;
}

/** docs/06 sections 4 and 7. The body arrives in P1-T08; the geometry is already the final one. */
function PageCanvas({ page, node }: { page: PageDocument; node: TreeNode }): React.JSX.Element {
  return (
    <article className="mx-auto w-full max-w-[calc(var(--docs-content-width)+8rem)] px-4 pt-20 pb-[40vh] md:px-16 md:pt-[88px]">
      {node.icon !== undefined && (
        <div className="pb-2">
          <IconGlyph
            icon={node.icon}
            kind={node.kind}
            className="size-9 text-[36px] leading-none"
          />
        </div>
      )}
      <h1 className="text-[32px] leading-tight font-bold md:text-[40px]">
        {page.meta.title ?? node.title}
      </h1>
    </article>
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
