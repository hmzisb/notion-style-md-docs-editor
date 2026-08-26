import { ancestorsOf, type NodeId, type PageMode, type TreeIndex, type TreeNode } from '@docs/core';
import { defaultFilter } from 'cmdk';
import {
  ChevronsDownUp,
  ChevronsUpDown,
  FilePlus,
  PanelLeft,
  Search,
  SunMoon,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRecents } from '@/data/cache/recents.js';
import { useDocs } from '@/data/context.js';
import { SEARCH_MIN_QUERY, useSearch, useTreeIndex } from '@/data/queries.js';
import { expandableIds, useSidebarStore } from '@/data/sidebar-store.js';
import { formatKeys } from '@/lib/hotkeys';
import { relativeTime } from '@/lib/relative-time.js';
import { IconGlyph } from '@/tree/IconGlyph.js';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/ui/command';
import { useSidebar } from '@/ui/sidebar';
import type { CommandPaletteProps } from './CommandPalette.js';

/** docs/06 section 8: Recent shows five. */
const MAX_RECENT = 5;
/** cmdk mounts every item it is handed, and an index can hold 5k of them (docs/07 section 4),
 *  so the same scorer cmdk would filter with picks the rows that are worth mounting. */
const MAX_PAGES = 50;
/** docs/07 section 4. */
const SEARCH_DEBOUNCE = 250;

interface Action {
  id: string;
  label: string;
  icon: LucideIcon;
  keys?: string;
  run: () => void;
}

/** docs/06 section 8 and docs/07 section 4: Recent, then Pages, then Actions. */
export function CommandPaletteDialog({
  open,
  onOpenChange,
  rootId,
  onOpenPage,
  onCreatePage,
  onThemeChange,
}: CommandPaletteProps): React.JSX.Element {
  const { strings, capabilities } = useDocs();
  const { data: index } = useTreeIndex(rootId);
  const recents = useRecents((state) => state.recents);
  const { toggleSidebar } = useSidebar();
  const expandAll = useSidebarStore((state) => state.expandAll);
  const collapseAll = useSidebarStore((state) => state.collapseAll);
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // A palette that reopens on yesterday's query is nobody's intent (docs/07 section 4).
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const nodes = useMemo(() => (index === undefined ? [] : Object.values(index.byId)), [index]);
  const pages = useMemo(() => rank(nodes, query), [nodes, query]);
  const recentNodes = useMemo(
    () =>
      recents
        .slice(0, MAX_RECENT)
        .map((recent) => ({ node: index?.byId[recent.id], at: recent.at }))
        .filter((entry): entry is { node: TreeNode; at: number } => entry.node !== undefined),
    [recents, index],
  );

  const debounced = useDebounced(query, SEARCH_DEBOUNCE);
  const wantsSearch = capabilities.search && debounced.trim().length >= SEARCH_MIN_QUERY;
  const hits = useSearch(debounced, { enabled: open, rootId });
  // Not `hits.data` alone: the last query's hits are still cached while a shorter one is typed.
  const results = wantsSearch ? (hits.data ?? []) : [];

  const close = (): void => {
    onOpenChange(false);
  };
  const openPage = (id: NodeId, mode?: PageMode): void => {
    close();
    onOpenPage(id, mode === undefined ? undefined : { mode });
  };
  /** docs/07 section 2: the action makes an untitled page; `Shift+Enter` names it with the query. */
  const create = (title: string): void => {
    close();
    onCreatePage(title);
  };

  const actions: Action[] = [
    ...(capabilities.write
      ? [
          {
            id: 'new-page',
            label: strings['palette.newPage'],
            icon: FilePlus,
            keys: 'Mod+Alt+N',
            run: () => {
              create('');
            },
          },
        ]
      : []),
    {
      id: 'toggle-sidebar',
      label: strings['palette.toggleSidebar'],
      icon: PanelLeft,
      keys: 'Mod+\\',
      run: () => {
        close();
        toggleSidebar();
      },
    },
    {
      id: 'expand-all',
      label: strings['palette.expandAll'],
      icon: ChevronsUpDown,
      run: () => {
        close();
        expandAll(expandableIds(nodes));
      },
    },
    {
      id: 'collapse-all',
      label: strings['palette.collapseAll'],
      icon: ChevronsDownUp,
      run: () => {
        close();
        collapseAll();
      },
    },
    ...(onThemeChange === undefined
      ? []
      : [
          {
            id: 'switch-theme',
            label: strings['palette.switchTheme'],
            icon: SunMoon,
            run: () => {
              close();
              // The host owns the theme; the class it already applied says which way to flip.
              const dark = document.documentElement.classList.contains('dark');
              onThemeChange(dark ? 'light' : 'dark');
            },
          },
        ]),
  ];

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={strings['palette.label']}
      description={strings['palette.placeholder']}
      className="sm:max-w-[640px]"
    >
      <Command
        label={strings['palette.label']}
        // docs/06 section 8: the palette input is taller than the one the primitive ships.
        className="[&_[data-slot=command-input]]:h-12 [&_[data-slot=command-input]]:text-base [&_[data-slot=input-group]]:h-12!"
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          // cmdk owns a plain Enter; these two are the palette's own (docs/07 section 4).
          if (event.metaKey || event.ctrlKey) {
            const id = selectedPageId(listRef.current);
            if (id === null) return;
            event.preventDefault();
            openPage(id, 'edit');
            return;
          }
          if (event.shiftKey && capabilities.write && query.trim() !== '') {
            event.preventDefault();
            create(query.trim());
          }
        }}
      >
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={strings['palette.placeholder']}
        />
        <CommandList ref={listRef}>
          {results.length === 0 && !hits.isFetching && (
            <CommandEmpty>{strings['palette.empty']}</CommandEmpty>
          )}

          {query === '' && recentNodes.length > 0 && (
            <CommandGroup heading={strings['palette.recent']}>
              {recentNodes.map(({ node, at }) => (
                <PageRow
                  key={node.id}
                  node={node}
                  onSelect={() => {
                    openPage(node.id);
                  }}
                  trailing={<CommandShortcut>{relativeTime(at)}</CommandShortcut>}
                />
              ))}
            </CommandGroup>
          )}

          {pages.length > 0 && (
            <CommandGroup heading={strings['palette.pages']}>
              {pages.map((node) => (
                <PageRow
                  key={node.id}
                  node={node}
                  path={index === undefined ? undefined : breadcrumb(index, node.id)}
                  onSelect={() => {
                    openPage(node.id);
                  }}
                />
              ))}
            </CommandGroup>
          )}

          {wantsSearch && (
            <CommandGroup heading={strings['palette.results']} forceMount>
              {results.map((hit) => (
                <CommandItem
                  key={hit.id}
                  forceMount
                  value={`hit-${hit.id}`}
                  data-page-id={hit.id}
                  className="h-10 items-start py-2"
                  onSelect={() => {
                    openPage(hit.id);
                  }}
                >
                  <Search aria-hidden="true" className="mt-0.5 text-muted-foreground/70" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{hit.title}</span>
                    {hit.snippet !== undefined && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {hit.snippet}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
              {(hits.isFetching || hits.error !== null) && (
                <CommandItem
                  forceMount
                  value="search-in-content"
                  className="h-10"
                  onSelect={() => {
                    void hits.refetch();
                  }}
                >
                  <Search aria-hidden="true" className="text-muted-foreground/70" />
                  <span className="truncate">{strings['palette.searchContent']}</span>
                  {hits.error !== null && (
                    <CommandShortcut>{strings['palette.retry']}</CommandShortcut>
                  )}
                </CommandItem>
              )}
            </CommandGroup>
          )}

          <CommandGroup heading={strings['palette.actions']}>
            {actions.map((action) => (
              <CommandItem
                key={action.id}
                value={action.label}
                className="h-10"
                onSelect={action.run}
              >
                <action.icon aria-hidden="true" className="text-muted-foreground/70" />
                <span className="truncate">{action.label}</span>
                {action.keys !== undefined && (
                  <CommandShortcut>{formatKeys(action.keys)}</CommandShortcut>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
        <div className="flex items-center gap-3 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <span>{strings['palette.footerNavigate']}</span>
          <span>{strings['palette.footerOpen']}</span>
          <span>{strings['palette.footerClose']}</span>
        </div>
      </Command>
    </CommandDialog>
  );
}

function PageRow({
  node,
  path,
  trailing,
  onSelect,
}: {
  node: TreeNode;
  path?: string | undefined;
  trailing?: React.ReactNode;
  onSelect: () => void;
}): React.JSX.Element {
  return (
    <CommandItem
      value={pageValue(node)}
      data-page-id={node.id}
      className="h-10"
      onSelect={onSelect}
    >
      <IconGlyph icon={node.icon} kind={node.kind} className="text-muted-foreground/70" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{node.title}</span>
        {path !== undefined && path !== '' && (
          <span className="block truncate text-xs text-muted-foreground">{path}</span>
        )}
      </span>
      {trailing}
    </CommandItem>
  );
}

/** Unique per node, and what both this file and cmdk score the query against. */
const pageValue = (node: TreeNode): string => `${node.title} ${node.path}`;

function rank(nodes: readonly TreeNode[], query: string): TreeNode[] {
  if (query.trim() === '') return [];
  return nodes
    .map((node) => ({ node, score: defaultFilter(pageValue(node), query.trim()) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_PAGES)
    .map((entry) => entry.node);
}

/** docs/06 section 8: the ancestors under the title, not the file path. */
function breadcrumb(index: TreeIndex, id: NodeId): string {
  return ancestorsOf(index, id)
    .map((ancestor) => index.byId[ancestor]?.title)
    .filter((title): title is string => title !== undefined)
    .join(' / ');
}

const selectedPageId = (list: HTMLElement | null): NodeId | null =>
  list?.querySelector<HTMLElement>('[cmdk-item][aria-selected="true"][data-page-id]')?.dataset
    .pageId ?? null;

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, ms);
    return () => {
      clearTimeout(timer);
    };
  }, [value, ms]);
  return debounced;
}
