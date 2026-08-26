import {
  isDescendant,
  type NodeId,
  type PageMode,
  type TreeIndex,
  type TreeNode,
} from '@docs/core';
import {
  dragAndDropFeature,
  hotkeysCoreFeature,
  searchFeature,
  syncDataLoaderFeature,
  type DragTarget,
} from '@headless-tree/core';
import { AssistiveTreeDescription, useTree } from '@headless-tree/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useDocs } from '@/data/context.js';
import { useDeletePage, useMovePage, useUpdateMeta } from '@/data/mutations.js';
import { useStructuralGate } from '@/data/online.js';
import { useTreeIndex } from '@/data/queries.js';
import { useSidebarStore } from '@/data/sidebar-store.js';
import { format } from '@/data/strings.js';
import { useIsMobile } from '@/hooks/use-mobile';
import { copyText } from '@/lib/clipboard.js';
import { useHotkeys, type Hotkey } from '@/lib/hotkeys';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/button';
import { Skeleton } from '@/ui/skeleton';
import { PageTreeRow, type TreeRowDrag } from './PageTreeRow.js';

/** Visually hidden but focusable. Inline: a host without Tailwind has no `sr-only`. */
const OFFSCREEN: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  border: 0,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

/** What `getDragLineStyle` itself returns while nothing is being dragged. */
const HIDDEN: React.CSSProperties = { display: 'none' };

/** docs/06 section 4: `--docs-row-height`. Rows never measure: 5k of them stay cheap. */
const ROW_HEIGHT = 28;
/** docs/06 section 15: a row is a touch target below 768 px. */
const ROW_HEIGHT_TOUCH = 44;
const OVERSCAN = 8;
/** docs/07 section 3: the top and bottom quarter of a row reorder, the middle half goes inside. */
const REORDER_AREA = 0.25;
/** docs/07 section 3: how close to an edge the pointer has to be before the tree scrolls itself. */
const EDGE = 32;
const EDGE_STEP = 6;
/** docs/07 section 3, and `--docs-indent` in `styles.css`: the drag line is drawn per level. */
const INDENT = 12;
/**
 * headless-tree needs one item above the visible roots; it is never rendered. Node ids are
 * `p_`/`f_` hashes or ULIDs, so this cannot collide with a real one.
 */
const ROOT = 'docs-root';

const MoveTo = lazy(async () => {
  const { MoveToDialog } = await import('./move-to-dialog.js');
  return { default: MoveToDialog };
});

const Delete = lazy(async () => {
  const { DeleteDialog } = await import('./delete-dialog.js');
  return { default: DeleteDialog };
});

export interface PageTreeProps {
  activeId: NodeId | null;
  onOpen: (id: NodeId, opts?: { mode?: PageMode }) => void;
  /** Scopes the tree to one subtree; the scope node itself is the single root row. */
  rootId?: NodeId;
  /** Absent on a read-only provider, and then so is every `+` on a row (docs/01 section 6). */
  onCreate?: (parentId: NodeId) => void;
  className?: string;
}

export function PageTree({
  activeId,
  onOpen,
  rootId,
  onCreate,
  className,
}: PageTreeProps): React.JSX.Element {
  const { strings } = useDocs();
  const { data: index, error, isPending, refetch } = useTreeIndex(rootId);

  if (isPending) return <TreeSkeleton className={className} />;
  if (error !== null) {
    return (
      <div className={cn('flex flex-col items-start gap-2 p-3', className)}>
        <p className="text-sm text-muted-foreground">{strings['tree.error']}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void refetch();
          }}
        >
          {strings['tree.retry']}
        </Button>
      </div>
    );
  }
  if (index.rootIds.length === 0) {
    return (
      <p className={cn('p-3 text-sm text-muted-foreground', className)}>{strings['tree.empty']}</p>
    );
  }

  return (
    <TreeBody
      index={index}
      activeId={activeId}
      onOpen={onOpen}
      onCreate={onCreate}
      rootId={rootId}
      className={className}
    />
  );
}

function TreeBody({
  index,
  activeId,
  onOpen,
  onCreate,
  rootId,
  className,
}: PageTreeProps & { index: TreeIndex }): React.JSX.Element {
  const { capabilities, navigation, strings } = useDocs();
  const update = useUpdateMeta(rootId);
  const move = useMovePage(rootId);
  const del = useDeletePage(rootId);
  // D-05: a rename, an icon and a new page all need the provider, and offline they are the
  // same controls with the reason on them.
  const { offline, reason } = useStructuralGate();
  const [renaming, setRenaming] = useState<NodeId | null>(null);
  const [moving, setMoving] = useState<NodeId | null>(null);
  const [deleting, setDeleting] = useState<NodeId | null>(null);
  const isMobile = useIsMobile();
  // docs/07 section 3: a drag is a pointer gesture, and below 768 px the pointer is a finger.
  const movable = capabilities.move && !offline;
  const deletable = capabilities.delete && !offline;
  const draggable = movable && !isMobile;
  const expanded = useSidebarStore((state) => state.expanded);
  const setExpandedIds = useSidebarStore((state) => state.setExpandedIds);
  const setExpanded = useSidebarStore((state) => state.setExpanded);
  /**
   * Identity matters: headless-tree rebuilds its row list whenever this array is a new object,
   * and rebuilding sets React state, so a fresh array per render would loop.
   */
  const expandedItems = useMemo(() => Object.keys(expanded), [expanded]);

  // Read by callbacks that headless-tree keeps from an earlier render.
  const latest = useRef({ index, expandedItems, draggable });
  latest.current = { index, expandedItems, draggable };
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollToIndex = useRef<((rowIndex: number) => void) | null>(null);
  /** Where the keyboard goes once the delete dialog is off the screen, one way or the other. */
  const refocus = useRef<NodeId | null>(null);
  const edge = useEdgeScroll(scrollRef);
  /**
   * docs/07 section 3: over a target it cannot take, the tree draws nothing. headless-tree
   * leaves the last valid target in its state, so without this the line and the ring stay
   * where the pointer no longer is.
   */
  const [blocked, setBlocked] = useState(false);

  const tree = useTree<TreeNode>({
    rootItemId: ROOT,
    state: { expandedItems },
    setExpandedItems: (updater) => {
      setExpandedIds(
        typeof updater === 'function' ? updater(latest.current.expandedItems) : updater,
      );
    },
    getItemName: (item) => item.getItemData().title,
    isItemFolder: (item) => {
      const node = item.getItemData();
      return node.kind === 'folder' || node.childIds.length > 0;
    },
    onPrimaryAction: (item) => {
      activate(item.getId());
    },
    /**
     * docs/07 section 2: type-ahead jumps by title prefix, not by substring. The length
     * guard matters: closing the search matches against `''`, and a prefix of `''` is every
     * row, which would drag the focus back to the first one.
     */
    isSearchMatchingItem: (search, item) =>
      search.length > 0 && item.getItemName().toLowerCase().startsWith(search.toLowerCase()),
    scrollToItem: (item) => {
      scrollToIndex.current?.(item.getItemMeta().index);
    },
    dataLoader: {
      getItem: (id) => nodeFor(latest.current.index, id),
      getChildren: (id) => childIdsFor(latest.current.index, id),
    },
    canDrag: () => latest.current.draggable,
    // docs/07 section 3: a page takes children as readily as a folder does.
    canDrop: (items, target) => {
      if (!latest.current.draggable) return false;
      const parentId = parentOf(target);
      const ok = items.every((item) => {
        const id = item.getId();
        // The descendant guard: a subtree cannot be moved inside itself (docs/03 section 4.6).
        return (
          parentId !== id &&
          (parentId === null || !isDescendant(latest.current.index, parentId, id))
        );
      });
      setBlocked(!ok);
      return ok;
    },
    canReorder: true,
    reorderAreaPercentage: REORDER_AREA,
    openOnDropDelay: 600,
    indent: INDENT,
    onDrop: (items, target) => {
      const item = items[0];
      if (item === undefined) return;
      const parentId = parentOf(target);
      const at =
        'insertionIndex' in target
          ? target.insertionIndex
          : // Dropped on a row rather than between two: docs/06 section 5 puts it last inside.
            childIdsFor(latest.current.index, parentId ?? ROOT).filter((id) => id !== item.getId())
              .length;
      moveTo(item.getId(), parentId, at);
    },
    features: [syncDataLoaderFeature, hotkeysCoreFeature, searchFeature, dragAndDropFeature],
  });

  const create = offline ? undefined : onCreate;

  const toggle = useCallback(
    (id: NodeId) => {
      const item = tree.getItemInstance(id);
      if (item.isExpanded()) item.collapse();
      else item.expand();
    },
    [tree],
  );

  /** A folder node has no page behind it (docs/03 section 4.1), so it expands instead. */
  const activate = useCallback(
    (id: NodeId) => {
      const node = latest.current.index.byId[id];
      if (node === undefined) return;
      if (node.kind === 'folder') toggle(id);
      else onOpen(id);
    },
    [onOpen, toggle],
  );

  const focusItem = useCallback(
    (id: NodeId) => {
      tree.getItemInstance(id).setFocused();
    },
    [tree],
  );

  /** `setFocused` moves the roving tabindex; the DOM focus has to be asked for separately. */
  const focusRow = useCallback(
    (id: NodeId) => {
      const item = tree.getItemInstance(id);
      item.setFocused();
      item.getElement()?.focus();
    },
    [tree],
  );

  /**
   * docs/07 section 5: the field closes on `Enter`, `Esc` or blur, and the row it was over
   * takes the focus back - the keyboard came from there and has nowhere else to be.
   */
  const endRename = useCallback(
    (id: NodeId, title: string | null) => {
      setRenaming(null);
      focusRow(id);
      if (title === null) return;
      const before = latest.current.index.byId[id]?.title ?? '';
      update.mutate(
        { id, patch: { title } },
        {
          onError: () => {
            toast(format(strings['error.rename'], { title: before }));
          },
        },
      );
    },
    [focusRow, strings, update],
  );

  const changeIcon = useCallback(
    (id: NodeId, icon: string) => {
      update.mutate(
        { id, patch: { icon } },
        {
          onError: () => {
            toast(strings['error.generic']);
          },
        },
      );
    },
    [strings, update],
  );

  /**
   * docs/04 section 4: the row is already where it was dropped; the provider is told after, and
   * a refusal puts it back and says so rather than leaving the tree lying about where the page is.
   */
  const moveTo = useCallback(
    (id: NodeId, parentId: NodeId | null, at: number) => {
      const title = latest.current.index.byId[id]?.title ?? '';
      // A row dropped into a collapsed parent would land somewhere nothing can see. The store
      // rather than `item.expand()`: a page with no children yet is not a folder, and
      // headless-tree refuses to expand one - which is exactly the page being dropped into.
      if (parentId !== null) setExpanded(parentId, true);
      move.mutate(
        { id, parentId, index: at },
        {
          onError: () => {
            toast(format(strings['error.move'], { title }));
          },
        },
      );
    },
    [move, setExpanded, strings],
  );

  /** docs/07 section 3: the keyboard's reorder, one place at a time among the row's siblings. */
  const reorder = useCallback(
    (delta: -1 | 1) => {
      const id = tree.getFocusedItem().getId();
      const node = latest.current.index.byId[id];
      if (node === undefined) return;
      const siblings = childIdsFor(latest.current.index, node.parentId ?? ROOT);
      const at = siblings.indexOf(id) + delta;
      // `movePage` counts the destination with the moved row taken out, which is what makes
      // `at` the index the row ends up at rather than the one it passes through.
      if (at < 0 || at >= siblings.length) return;
      moveTo(id, node.parentId, at);
    },
    [moveTo, tree],
  );

  /**
   * docs/04 section 4: the subtree goes from the tree on confirm, and the page queries, drafts
   * and parsed values it left behind go once the provider agrees. Where the keyboard lands is
   * this side's business: the row it was on is one of the rows that just went.
   */
  const remove = useCallback(
    (id: NodeId) => {
      const node = latest.current.index.byId[id];
      if (node === undefined) return;
      const siblings = childIdsFor(latest.current.index, node.parentId ?? ROOT);
      const at = siblings.indexOf(id);
      refocus.current = siblings[at + 1] ?? siblings[at - 1] ?? node.parentId;
      del.mutate(
        { id },
        {
          onSuccess: () => {
            toast(format(strings['menu.deleted'], { title: node.title }));
          },
          onError: () => {
            toast(format(strings['error.delete'], { title: node.title }));
          },
        },
      );
    },
    [del, strings],
  );

  /** docs/06 section 8: the host's own URL when it has one, and the id it would be built from. */
  const copyLink = useCallback(
    (id: NodeId) => {
      const href = navigation.href?.({ pageId: id });
      void copyText(href ?? id).then((ok) => {
        toast(ok ? strings['menu.copiedLink'] : strings['error.generic']);
      });
    },
    [navigation, strings],
  );

  /** Every row's menu is the same object, so a row still re-renders only when its data does. */
  const menu = useMemo(
    () => ({
      labels: {
        addInside: strings['menu.addInside'],
        rename: strings['menu.rename'],
        changeIcon: strings['menu.changeIcon'],
        copyLink: strings['menu.copyLink'],
        moveTo: strings['menu.moveTo'],
        delete: strings['menu.delete'],
      },
      offline: offline ? reason : null,
      onCreate,
      onRename: onCreate === undefined ? undefined : setRenaming,
      onIcon: onCreate === undefined ? undefined : changeIcon,
      onCopyLink: copyLink,
      // Both: a provider that cannot move has nowhere to put the page, and a host that gave
      // the tree no way to add one did not ask for a way to rearrange it either.
      onMoveTo: onCreate === undefined || !capabilities.move ? undefined : setMoving,
      onDelete: onCreate === undefined || !capabilities.delete ? undefined : setDeleting,
    }),
    [
      capabilities.delete,
      capabilities.move,
      changeIcon,
      copyLink,
      offline,
      onCreate,
      reason,
      strings,
    ],
  );

  /**
   * headless-tree hands out fresh handlers on every render, and a row that takes new props on
   * every render is a row that re-renders on every scroll. These forward to whichever handlers
   * the item has now, so what the row holds is the same object from one render to the next.
   */
  const dnds = useRef(new Map<NodeId, TreeRowDrag>());
  const dndFor = useCallback(
    (id: NodeId): TreeRowDrag => {
      let props = dnds.current.get(id);
      if (props === undefined) {
        const forward = (name: keyof DragHandlers) => (event: React.DragEvent<HTMLDivElement>) => {
          (tree.getItemInstance(id).getProps() as DragHandlers)[name]?.(event);
        };
        props = {
          draggable: true,
          onDragStart: forward('onDragStart'),
          onDragEnter: forward('onDragEnter'),
          onDragOver: forward('onDragOver'),
          onDragLeave: forward('onDragLeave'),
          onDrop: forward('onDrop'),
        };
        dnds.current.set(id, props);
      }
      return props;
    },
    [tree],
  );

  /** One stable ref callback per id, or every row would re-render on every scroll. */
  const registrars = useRef(new Map<NodeId, (element: HTMLDivElement | null) => void>());
  const registerFor = useCallback(
    (id: NodeId) => {
      let register = registrars.current.get(id);
      if (register === undefined) {
        register = (element) => {
          tree.getItemInstance(id).registerElement(element);
        };
        registrars.current.set(id, register);
      }
      return register;
    },
    [tree],
  );

  useEffect(() => {
    tree.rebuildTree();
  }, [tree, index.version]);

  /**
   * The delete dialog is gone by the time this runs, and Radix's own restore aims at whatever
   * had the focus when it opened - which after a delete is a row that went with the page. So
   * the keyboard is placed from here: back on the row when nothing happened, and on whatever
   * took its place when something did.
   */
  useEffect(() => {
    if (deleting !== null) return;
    const next = refocus.current;
    if (next === null) return;
    refocus.current = null;
    focusRow(next);
  }, [deleting, focusRow]);

  // docs/07 section 2: the pointer has the `+` on the row; this is the same thing from the
  // keyboard, on whichever row the roving tabindex is on.
  useHotkeys(
    (create === undefined
      ? []
      : [
          {
            keys: 'Mod+Shift+ArrowRight',
            scopes: ['tree'],
            run: () => {
              const id = tree.getFocusedItem().getId();
              if (latest.current.index.byId[id] !== undefined) create(id);
            },
          },
          {
            // docs/07 section 5: the keyboard's way into the rename the pointer double-clicks.
            keys: 'F2',
            scopes: ['tree'],
            run: () => {
              const id = tree.getFocusedItem().getId();
              if (latest.current.index.byId[id] !== undefined) setRenaming(id);
            },
          },
        ]) satisfies Hotkey[],
    scrollRef,
  );

  // docs/07 section 3: reordering without a pointer. Reparenting is the Move to dialog's.
  useHotkeys(
    (movable
      ? [
          {
            keys: 'Mod+ArrowUp',
            scopes: ['tree'],
            run: () => {
              reorder(-1);
            },
          },
          {
            keys: 'Mod+ArrowDown',
            scopes: ['tree'],
            run: () => {
              reorder(1);
            },
          },
        ]
      : []) satisfies Hotkey[],
    scrollRef,
  );

  // docs/07 section 3: both keys, and neither of them deletes anything on its own - what they
  // open is the dialog the menu's own Delete opens.
  useHotkeys(
    (deletable
      ? (['Delete', 'Backspace'] as const).map((keys) => ({
          keys,
          scopes: ['tree'] as const,
          run: () => {
            const id = tree.getFocusedItem().getId();
            if (latest.current.index.byId[id] !== undefined) setDeleting(id);
          },
        }))
      : []) satisfies Hotkey[],
    scrollRef,
  );

  const items = tree.getItems();
  const rowHeight = isMobile ? ROW_HEIGHT_TOUCH : ROW_HEIGHT;
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: OVERSCAN,
    getItemKey: (rowIndex) => items[rowIndex]?.getId() ?? rowIndex,
  });
  scrollToIndex.current = (rowIndex) => {
    virtualizer.scrollToIndex(rowIndex);
  };
  // Sizes are cached per row, so crossing the touch breakpoint has to drop the cache.
  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, rowHeight]);

  /** docs/06 section 5: the row being dragged is dimmed where it still is. */
  const dragging = new Set(
    (tree.getState().dnd?.draggedItems ?? []).map((item) => item.getId()),
  );

  const endDrag = useCallback(() => {
    edge.stop();
    setBlocked(false);
  }, [edge]);

  const containerProps = tree.getContainerProps(
    strings['tree.label'],
  ) as React.ComponentProps<'div'>;
  // Type-ahead is headless-tree's: it focuses the input it owns, so the input has to exist.
  const searchProps = tree.getSearchInputElementProps() as React.ComponentProps<'input'>;

  return (
    <div
      ref={scrollRef}
      className={cn('h-full overflow-y-auto overscroll-contain', className)}
      /* Capture: the rows stop `dragover` from bubbling, and the edges are the tree's business. */
      onDragOverCapture={edge.onDragOver}
      onDragLeave={endDrag}
      onDropCapture={endDrag}
      onDragEndCapture={endDrag}
    >
      {/* Outside the container: `role="tree"` may only hold rows, and this is a live region. */}
      <AssistiveTreeDescription tree={tree} />
      <div
        {...containerProps}
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {/* docs/07 section 3: where the row would land, between the two rows it would land between. */}
        <div
          aria-hidden="true"
          data-slot="tree-drag-line"
          // `0` for the left: the style's own default pulls the line 8 px further left than
          // the indent headless-tree already worked out from the level it would land at.
          style={blocked ? HIDDEN : tree.getDragLineStyle(-1, 0)}
          className="pointer-events-none z-10 h-0.5 rounded-full bg-primary"
        >
          <span className="absolute -top-[2px] left-0 size-1.5 rounded-full bg-primary" />
        </div>
        {virtualizer.getVirtualItems().map((row) => {
          const item = items[row.index];
          if (item === undefined) return null;
          const node = item.getItemData();
          const meta = item.getItemMeta();
          const expandable = item.isFolder();
          const isExpanded = expandable && item.isExpanded();
          return (
            <PageTreeRow
              key={item.getId()}
              id={node.id}
              title={node.title}
              kind={node.kind}
              icon={node.icon}
              depth={meta.level}
              expandable={expandable}
              expanded={isExpanded}
              active={node.id === activeId}
              focused={item.isFocused()}
              setSize={meta.setSize}
              posInSet={meta.posInSet}
              href={node.kind === 'folder' ? undefined : navigation.href?.({ pageId: node.id })}
              top={row.start}
              height={row.size}
              expandLabel={format(strings[isExpanded ? 'tree.collapseRow' : 'tree.expandRow'], {
                title: node.title,
              })}
              addLabel={format(strings['tree.addInside'], { title: node.title })}
              renameLabel={format(strings['tree.renameLabel'], { title: node.title })}
              menu={{ ...menu, label: format(strings['tree.rowMenu'], { title: node.title }) }}
              renaming={node.id === renaming}
              register={registerFor(node.id)}
              onActivate={activate}
              onToggle={toggle}
              onFocus={focusItem}
              onCreate={create}
              onRenameStart={menu.onRename}
              onRenameEnd={endRename}
              dnd={draggable ? dndFor(node.id) : undefined}
              dropInto={!blocked && item.isUnorderedDragTarget()}
              dragged={dragging.has(node.id)}
            />
          );
        })}
      </div>
      {/*
       * After the container: headless-tree only wires its keydown handler onto the search
       * input if the container registered first, and without it Escape cannot close search.
       */}
      <input {...searchProps} aria-label={strings['tree.typeAhead']} style={OFFSCREEN} />
      {moving === null ? null : (
        <Suspense fallback={null}>
          <MoveTo
            index={index}
            id={moving}
            onPick={(parentId) => {
              setMoving(null);
              // docs/06 section 8: the dialog reparents; where among the new siblings is the
              // drag's business, so it lands last.
              moveTo(moving, parentId, childIdsFor(index, parentId ?? ROOT).length);
              focusRow(moving);
            }}
            onClose={() => {
              setMoving(null);
              focusRow(moving);
            }}
          />
        </Suspense>
      )}
      {deleting === null ? null : (
        <Suspense fallback={null}>
          <Delete
            index={index}
            id={deleting}
            onConfirm={() => {
              setDeleting(null);
              remove(deleting);
            }}
            onClose={() => {
              setDeleting(null);
              refocus.current = deleting;
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

/** The handlers headless-tree puts on a row, which are the only part of `getProps` the row wants. */
type DragHandlers = Partial<
  Record<
    'onDragStart' | 'onDragEnter' | 'onDragOver' | 'onDragLeave' | 'onDrop',
    (event: React.DragEvent<HTMLDivElement>) => void
  >
>;

/** The parent a drop target names; the synthetic root is no parent at all. */
function parentOf(target: DragTarget<TreeNode>): NodeId | null {
  const id = target.item.getId();
  return id === ROOT ? null : id;
}

/**
 * docs/07 section 3: within 32 px of an edge the tree scrolls itself. On an interval rather
 * than on the event, because `dragover` stops firing when the pointer stops moving - and a
 * pointer held against the edge is exactly the case this is for.
 */
function useEdgeScroll(scrollRef: React.RefObject<HTMLDivElement | null>): {
  onDragOver: React.DragEventHandler<HTMLDivElement>;
  stop: () => void;
} {
  const timer = useRef<number | undefined>(undefined);

  const stop = useCallback(() => {
    if (timer.current === undefined) return;
    clearInterval(timer.current);
    timer.current = undefined;
  }, []);

  const onDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const element = scrollRef.current;
      if (element === null) return;
      const box = element.getBoundingClientRect();
      const speed =
        event.clientY - box.top < EDGE
          ? -EDGE_STEP
          : box.bottom - event.clientY < EDGE
            ? EDGE_STEP
            : 0;
      stop();
      if (speed === 0) return;
      timer.current = window.setInterval(() => {
        element.scrollTop += speed;
      }, 16);
    },
    [scrollRef, stop],
  );

  useEffect(() => stop, [stop]);

  return { onDragOver, stop };
}

/** Widths from docs/06 section 5, deep enough to read as a tree rather than a list. */
const SKELETON_ROWS = [
  { width: '80%', depth: 0 },
  { width: '65%', depth: 1 },
  { width: '72%', depth: 1 },
  { width: '60%', depth: 2 },
  { width: '88%', depth: 0 },
  { width: '70%', depth: 1 },
  { width: '64%', depth: 1 },
  { width: '76%', depth: 0 },
];

function TreeSkeleton({ className }: { className?: string }): React.JSX.Element {
  return (
    <div className={cn('space-y-0.5 p-2', className)} aria-hidden="true">
      {SKELETON_ROWS.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="flex h-7 items-center max-md:h-11"
          style={{ paddingInlineStart: `calc(var(--docs-indent) * ${String(row.depth)} + 4px)` }}
        >
          <Skeleton className="h-3.5" style={{ width: row.width }} />
        </div>
      ))}
    </div>
  );
}

/** The synthetic root, plus a placeholder for an id that vanished mid-rebuild. */
function nodeFor(index: TreeIndex, id: string): TreeNode {
  if (id === ROOT) {
    return {
      id: ROOT,
      kind: 'folder',
      title: '',
      path: '',
      parentId: null,
      childIds: index.rootIds,
    };
  }
  return index.byId[id] ?? { id, kind: 'page', title: '', path: '', parentId: null, childIds: [] };
}

function childIdsFor(index: TreeIndex, id: string): NodeId[] {
  const childIds = id === ROOT ? index.rootIds : (index.byId[id]?.childIds ?? []);
  // A stale expanded id must never put a row on screen that has no node behind it.
  return childIds.filter((childId) => childId in index.byId);
}
