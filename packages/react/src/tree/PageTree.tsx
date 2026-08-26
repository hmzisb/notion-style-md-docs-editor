import type { NodeId, PageMode, TreeIndex, TreeNode } from '@docs/core';
import { hotkeysCoreFeature, searchFeature, syncDataLoaderFeature } from '@headless-tree/core';
import { AssistiveTreeDescription, useTree } from '@headless-tree/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useDocs } from '@/data/context.js';
import { useTreeIndex } from '@/data/queries.js';
import { useSidebarStore } from '@/data/sidebar-store.js';
import { format } from '@/data/strings.js';
import { useIsMobile } from '@/hooks/use-mobile';
import { useHotkeys, type Hotkey } from '@/lib/hotkeys';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/button';
import { Skeleton } from '@/ui/skeleton';
import { PageTreeRow } from './PageTreeRow.js';

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

/** docs/06 section 4: `--docs-row-height`. Rows never measure: 5k of them stay cheap. */
const ROW_HEIGHT = 28;
/** docs/06 section 15: a row is a touch target below 768 px. */
const ROW_HEIGHT_TOUCH = 44;
const OVERSCAN = 8;
/**
 * headless-tree needs one item above the visible roots; it is never rendered. Node ids are
 * `p_`/`f_` hashes or ULIDs, so this cannot collide with a real one.
 */
const ROOT = 'docs-root';

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
      className={className}
    />
  );
}

function TreeBody({
  index,
  activeId,
  onOpen,
  onCreate,
  className,
}: Omit<PageTreeProps, 'rootId'> & { index: TreeIndex }): React.JSX.Element {
  const { navigation, strings } = useDocs();
  const expanded = useSidebarStore((state) => state.expanded);
  const setExpandedIds = useSidebarStore((state) => state.setExpandedIds);
  /**
   * Identity matters: headless-tree rebuilds its row list whenever this array is a new object,
   * and rebuilding sets React state, so a fresh array per render would loop.
   */
  const expandedItems = useMemo(() => Object.keys(expanded), [expanded]);

  // Read by callbacks that headless-tree keeps from an earlier render.
  const latest = useRef({ index, expandedItems });
  latest.current = { index, expandedItems };
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollToIndex = useRef<((rowIndex: number) => void) | null>(null);

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
    features: [syncDataLoaderFeature, hotkeysCoreFeature, searchFeature],
  });

  const create = onCreate;

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

  // docs/07 section 2: the pointer has the `+` on the row; this is the same thing from the
  // keyboard, on whichever row the roving tabindex is on.
  useHotkeys(
    create === undefined
      ? []
      : ([
          {
            keys: 'Mod+Shift+ArrowRight',
            scopes: ['tree'],
            run: () => {
              const id = tree.getFocusedItem().getId();
              if (latest.current.index.byId[id] !== undefined) create(id);
            },
          },
        ] satisfies Hotkey[]),
    scrollRef,
  );

  const items = tree.getItems();
  const rowHeight = useIsMobile() ? ROW_HEIGHT_TOUCH : ROW_HEIGHT;
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

  const containerProps = tree.getContainerProps(
    strings['tree.label'],
  ) as React.ComponentProps<'div'>;
  // Type-ahead is headless-tree's: it focuses the input it owns, so the input has to exist.
  const searchProps = tree.getSearchInputElementProps() as React.ComponentProps<'input'>;

  return (
    <div ref={scrollRef} className={cn('h-full overflow-y-auto overscroll-contain', className)}>
      {/* Outside the container: `role="tree"` may only hold rows, and this is a live region. */}
      <AssistiveTreeDescription tree={tree} />
      <div
        {...containerProps}
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
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
              register={registerFor(node.id)}
              onActivate={activate}
              onToggle={toggle}
              onFocus={focusItem}
              onCreate={create}
            />
          );
        })}
      </div>
      {/*
       * After the container: headless-tree only wires its keydown handler onto the search
       * input if the container registered first, and without it Escape cannot close search.
       */}
      <input {...searchProps} aria-label={strings['tree.typeAhead']} style={OFFSCREEN} />
    </div>
  );
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
