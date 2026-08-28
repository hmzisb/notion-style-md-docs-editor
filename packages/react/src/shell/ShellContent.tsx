import {
  CONTRACT_VERSION,
  isProviderError,
  type NodeId,
  type PageMode,
  type TreeIndex,
  type TreeNode,
} from '@hmzisb/notion-docs-core';
import { FilePlus, FileText, FileX, Folder, TriangleAlert, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { toast } from '@/lib/toast.js';
import { useDocs } from '@/data/context.js';
import { canvasKey, freshTwin } from '@/data/fresh.js';
import { useSavePage } from '@/data/mutations.js';
import { useStructuralGate } from '@/data/online.js';
import { usePage, useTreeIndex } from '@/data/queries.js';
import { format } from '@/data/strings.js';
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
  /** The mode matters here: a folder that has just become a page opens on its empty body. */
  onOpen: (id: NodeId, opts?: { mode?: PageMode }) => void;
  onHome: () => void;
  /** Absent on a read-only provider, and then so is the card's action (docs/06 section 11). */
  onCreate?: () => void;
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
  onCreate,
}: ShellContentProps): React.JSX.Element {
  const { meta, ns, strings } = useDocs();
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

  if (tree.isPending)
    return tree.fetchStatus === 'paused' ? (
      <OfflineCard
        onRetry={() => {
          void tree.refetch();
        }}
      />
    ) : (
      <CanvasSkeleton />
    );
  const index = tree.data;

  if (pageId === null) {
    if (index.rootIds.length === 0) {
      return (
        <EmptyState
          icon={FilePlus}
          title={strings['empty.noPages.title']}
          body={strings['empty.noPages.body']}
          action={
            onCreate === undefined
              ? undefined
              : { label: strings['empty.noPages.action'], onClick: onCreate }
          }
        />
      );
    }
    if (emptyState !== undefined && emptyState !== null) return <>{emptyState}</>;
    return (
      <EmptyState
        icon={FileText}
        title={strings['empty.noSelection.title']}
        body={strings['empty.noSelection.body']}
        action={
          onCreate === undefined
            ? undefined
            : { label: strings['empty.noSelection.action'], onClick: onCreate }
        }
      />
    );
  }

  // A page created here answers to both of its ids for as long as the swap takes (docs/04
  // section 4): the row going over to the provider's id is not the page having been deleted.
  const twin = freshTwin(ns, pageId);
  const node = index.byId[pageId] ?? (twin === null ? null : (index.byId[twin] ?? null));
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
    return <FolderCard index={index} node={node} rootId={rootId} onOpen={onOpen} />;
  }

  if (page.isPending)
    return page.fetchStatus === 'paused' ? (
      <OfflineCard
        onRetry={() => {
          void page.refetch();
        }}
      />
    ) : (
      <CanvasSkeleton />
    );
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
    // The page id is the session (docs/05 section 8): a new page opens in read mode again. A
    // page created in this session keeps the id it was created under, so the provider's id
    // landing a moment later does not remount the canvas around it (docs/04 section 4).
    <PageCanvas
      key={canvasKey(ns, node.id)}
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
  if (offline) return <OfflineCard onRetry={onRetry} />;

  return (
    <EmptyState
      icon={TriangleAlert}
      title={strings['empty.unreachable.title']}
      body={error.message}
      action={{ label: strings['empty.unreachable.action'], onClick: onRetry }}
    />
  );
}

/**
 * docs/04 section 3.4: what is in the cache is served offline and this is what is left over -
 * a page this device has never opened. A host whose own `QueryClient` keeps Query's default
 * `networkMode` gets here too, with the fetch paused rather than failed, and the card is the
 * honest answer either way: there is nothing to show until the network is back.
 */
function OfflineCard({ onRetry }: { onRetry: () => void }): React.JSX.Element {
  const { strings } = useDocs();
  return (
    <EmptyState
      icon={WifiOff}
      title={strings['empty.offline.title']}
      body={strings['empty.offline.body']}
      action={{ label: strings['empty.offline.action'], onClick: onRetry }}
    />
  );
}

/**
 * docs/06 section 11: a directory with no `index.md` behind it. A host that can write is
 * offered the page that would fill it - the same node, the same id, a file where there was
 * none (docs/03 section 4.1). Either way the card lists what is under the folder, which is all
 * a host that cannot write has to offer.
 */
function FolderCard({
  index,
  node,
  rootId,
  onOpen,
}: {
  index: TreeIndex;
  node: TreeNode;
  rootId?: NodeId;
  onOpen: (id: NodeId, opts?: { mode?: PageMode }) => void;
}): React.JSX.Element {
  const { capabilities, strings } = useDocs();
  // D-05: the conversion is a write, and offline there is nothing to write to.
  const { offline } = useStructuralGate();
  const save = useSavePage(rootId);
  const convertible = capabilities.write && !offline;

  return (
    <EmptyState
      icon={Folder}
      title={strings['empty.folder.title']}
      body={strings['empty.folder.body']}
      action={
        convertible
          ? {
              label: strings['empty.folder.action'],
              onClick: () => {
                save.mutate(
                  { id: node.id, body: '', baseVersion: null },
                  {
                    // The row is a page now, so the page is what opens: empty, in edit mode,
                    // the way a page created from anywhere else does (docs/01 section 5.3).
                    onSuccess: () => {
                      onOpen(node.id, { mode: 'edit' });
                    },
                    onError: () => {
                      toast(format(strings['error.save'], { title: node.title }));
                    },
                  },
                );
              },
            }
          : undefined
      }
    >
      {/* Kept for a host that can write too: the card is the page's own place in the tree. */}
      <ChildList index={index} node={node} onOpen={onOpen} />
    </EmptyState>
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
