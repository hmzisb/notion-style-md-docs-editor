import type { NodeId, NodeKind, PageIcon } from '@docs/core';
import { ChevronRight, Plus } from 'lucide-react';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { IconGlyph } from './IconGlyph.js';

/**
 * Every prop is a primitive or an object that only changes when the snapshot does, so a row
 * re-renders on scroll only when its own data changed (docs/09 P1-T06). That is why the row
 * takes the item's data rather than the headless-tree item instance, which is rebuilt often.
 */
export interface PageTreeRowProps {
  id: NodeId;
  title: string;
  kind: NodeKind;
  icon: PageIcon | undefined;
  /** 0 for a root row; the indent is `--docs-indent` per level. */
  depth: number;
  expandable: boolean;
  expanded: boolean;
  active: boolean;
  focused: boolean;
  setSize: number;
  posInSet: number;
  /** From `navigation.href`: renders the title as a real link so a middle click opens a tab. */
  href: string | undefined;
  top: number;
  height: number;
  expandLabel: string;
  /** `Add a page inside {title}`, already formatted: the row keeps every string it renders. */
  addLabel: string;
  register: (element: HTMLDivElement | null) => void;
  onActivate: (id: NodeId) => void;
  onToggle: (id: NodeId) => void;
  onFocus: (id: NodeId) => void;
  /** Absent on a read-only provider, and then so is the button (docs/01 section 6). */
  onCreate?: (parentId: NodeId) => void;
}

function Row({
  id,
  title,
  kind,
  icon,
  depth,
  expandable,
  expanded,
  active,
  focused,
  setSize,
  posInSet,
  href,
  top,
  height,
  expandLabel,
  addLabel,
  register,
  onActivate,
  onToggle,
  onFocus,
  onCreate,
}: PageTreeRowProps): React.JSX.Element {
  return (
    <div
      ref={register}
      role="treeitem"
      aria-level={depth + 1}
      aria-setsize={setSize}
      aria-posinset={posInSet + 1}
      aria-expanded={expandable ? expanded : undefined}
      aria-selected={active}
      aria-label={title}
      tabIndex={focused ? 0 : -1}
      data-active={active ? '' : undefined}
      className={cn(
        'group absolute inset-x-0 top-0 flex items-center gap-1 rounded-md pe-1 text-sm',
        'cursor-default text-sidebar-foreground/85 outline-none',
        'hover:bg-sidebar-accent/70 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset',
        active && 'bg-sidebar-accent font-medium text-sidebar-foreground',
      )}
      style={{
        height,
        transform: `translateY(${String(top)}px)`,
        paddingInlineStart: `calc(var(--docs-indent) * ${String(depth)} + 4px)`,
      }}
      onClick={(event) => {
        onFocus(id);
        // A modified click is the browser's: open in a new tab, keep the selection.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onActivate(id);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        // Also stops the anchor's synthetic click, so a link row activates once.
        event.preventDefault();
        onActivate(id);
      }}
      onFocus={() => {
        onFocus(id);
      }}
    >
      {expandable ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={expandLabel}
          className="flex size-5 shrink-0 items-center justify-center rounded-sm hover:bg-black/8 dark:hover:bg-white/10"
          onClick={(event) => {
            event.stopPropagation();
            onToggle(id);
          }}
        >
          <ChevronRight
            aria-hidden="true"
            className={cn(
              'size-4 text-muted-foreground/70 transition-transform duration-[var(--docs-motion)]',
              expanded && 'rotate-90',
            )}
          />
        </button>
      ) : (
        <span className="size-5 shrink-0" />
      )}

      <span className="flex size-5 shrink-0 items-center justify-center">
        <IconGlyph icon={icon} kind={kind} />
      </span>

      {href === undefined ? (
        <span className="flex-1 truncate">{title}</span>
      ) : (
        // Not a tab stop: the row owns the roving tabindex (docs/07 section 9).
        <a href={href} tabIndex={-1} className="flex-1 truncate">
          {title}
        </a>
      )}

      {/* docs/06 section 5. In flow while hidden, so revealing it moves no text; touch has no
          hover, so there it is the open row that shows its actions. */}
      <span
        data-slot="tree-row-actions"
        className={cn(
          'flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100',
          'max-md:group-data-[active]:opacity-100',
        )}
      >
        {onCreate !== undefined && (
          <button
            type="button"
            // Not a tab stop: the row owns the roving tabindex, and `Cmd+Shift+Right` is the
            // keyboard's way in (docs/07 sections 2 and 9).
            tabIndex={-1}
            aria-label={addLabel}
            className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent max-md:size-11"
            onClick={(event) => {
              event.stopPropagation();
              onCreate(id);
            }}
          >
            <Plus aria-hidden="true" className="size-4" />
          </button>
        )}
      </span>
    </div>
  );
}

export const PageTreeRow = memo(Row);
