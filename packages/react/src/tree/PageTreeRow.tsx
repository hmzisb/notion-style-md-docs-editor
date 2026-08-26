import type { NodeId, NodeKind, PageIcon } from '@docs/core';
import { ChevronRight, Plus } from 'lucide-react';
import { memo, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/ui/input';
import { IconGlyph } from './IconGlyph.js';
import { PageTreeRowMenu, type PageTreeRowMenuProps } from './PageTreeRowMenu.js';

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
  renameLabel: string;
  menu: Omit<PageTreeRowMenuProps, 'id' | 'icon'>;
  /** docs/07 section 5: the title is an input while this row is the one being renamed. */
  renaming: boolean;
  onRenameStart?: (id: NodeId) => void;
  onRenameEnd?: (id: NodeId, title: string | null) => void;
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
  renameLabel,
  menu,
  renaming,
  onRenameStart,
  onRenameEnd,
  register,
  onActivate,
  onToggle,
  onFocus,
  onCreate,
}: PageTreeRowProps): React.JSX.Element {
  /**
   * A React event crosses a portal: the row menu and the picker it opens are this row's
   * children in the React tree, so their clicks and keys arrive here as though the row itself
   * had been used - and the row would open the page on the `Enter` that chose an emoji. Only
   * what happens inside the row's own DOM belongs to the row (docs/07 section 9).
   */
  const own = (event: React.SyntheticEvent): boolean =>
    event.currentTarget.contains(event.target as Node);

  // docs/07 section 5: a double click on the title renames, which the row's own click handler
  // must not read as two attempts to open the page.
  const startRename =
    onRenameStart === undefined
      ? undefined
      : (event: React.MouseEvent): void => {
          event.preventDefault();
          event.stopPropagation();
          onRenameStart(id);
        };

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
        if (!own(event)) return;
        onFocus(id);
        // A modified click is the browser's: open in a new tab, keep the selection.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onActivate(id);
      }}
      onKeyDown={(event) => {
        if (!own(event)) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        // Also stops the anchor's synthetic click, so a link row activates once.
        event.preventDefault();
        onActivate(id);
      }}
      onFocus={(event) => {
        if (!own(event)) return;
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

      {renaming && onRenameEnd !== undefined ? (
        <RenameField
          title={title}
          label={renameLabel}
          onEnd={(next) => {
            onRenameEnd(id, next);
          }}
        />
      ) : href === undefined ? (
        <span className="flex-1 truncate" onDoubleClick={startRename}>
          {title}
        </span>
      ) : (
        // Not a tab stop: the row owns the roving tabindex (docs/07 section 9).
        <a href={href} tabIndex={-1} className="flex-1 truncate" onDoubleClick={startRename}>
          {title}
        </a>
      )}

      {/* docs/06 section 5. In flow while hidden, so revealing it moves no text; touch has no
          hover, so there it is the open row that shows its actions. */}
      <span
        data-slot="tree-row-actions"
        className={cn(
          'flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100',
          // The menu's own focus is in a portal, so the row is neither hovered nor focused
          // while it is open - and the `...` it came out of would be the thing that vanished.
          'has-data-[state=open]:opacity-100',
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
            // D-05: creating a page needs the provider, and offline it is the same button, off.
            disabled={menu.offline !== null}
            className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent disabled:opacity-50 max-md:size-11"
            onClick={(event) => {
              event.stopPropagation();
              onCreate(id);
            }}
          >
            <Plus aria-hidden="true" className="size-4" />
          </button>
        )}
        <PageTreeRowMenu {...menu} id={id} icon={icon} />
      </span>
    </div>
  );
}

export const PageTreeRow = memo(Row);

/**
 * docs/06 section 5 and docs/07 section 5. `Enter` and blur commit, `Esc` cancels, and an empty
 * title is not a title: the field shakes, says so to a screen reader, and stays open.
 */
function RenameField({
  title,
  label,
  onEnd,
}: {
  title: string;
  label: string;
  /** The new title, or `null` for "leave it as it was". */
  onEnd: (title: string | null) => void;
}): React.JSX.Element {
  const [value, setValue] = useState(title);
  const [rejected, setRejected] = useState(false);
  /** Set by whichever of `Enter`, `Esc` and blur got there first, so the others do nothing. */
  const ended = useRef(false);
  const field = useRef<HTMLInputElement | null>(null);

  // Not `autoFocus`: the row is a roving tabindex and headless-tree focuses it as it renders,
  // so the field asks for the focus after that rather than during it (docs/07 section 9).
  useLayoutEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);

  const end = (next: string | null): void => {
    if (ended.current) return;
    ended.current = true;
    onEnd(next);
  };

  const commit = (): void => {
    const next = value.trim();
    if (next === '') {
      setRejected(true);
      shake(field.current);
      return;
    }
    end(next === title ? null : next);
  };

  return (
    <Input
      ref={field}
      value={value}
      aria-label={label}
      aria-invalid={rejected}
      className="h-6 flex-1 px-1 text-sm"
      onFocus={(event) => {
        event.currentTarget.select();
      }}
      onChange={(event) => {
        setRejected(false);
        setValue(event.target.value);
      }}
      // The row is a treeitem: without this every keystroke is type-ahead and `Enter` opens
      // the page under the field (docs/07 sections 2 and 9).
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          end(null);
        }
      }}
      onBlur={() => {
        // A field left empty is abandoned rather than rejected: there is nowhere left to shake.
        if (value.trim() === '') end(null);
        else commit();
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
      }}
    />
  );
}

/**
 * 150 ms, in the browser rather than in the sheet: a host that compiles its own Tailwind from
 * `@source` never loads `styles.css`, so a keyframe written there would reach half the hosts
 * (docs/11 section 4). `aria-invalid` is what carries the same news to a screen reader.
 */
function shake(element: HTMLInputElement | null): void {
  if (element === null || typeof element.animate !== 'function') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  element.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-3px)' },
      { transform: 'translateX(3px)' },
      { transform: 'translateX(0)' },
    ],
    { duration: 150, easing: 'ease-in-out' },
  );
}
