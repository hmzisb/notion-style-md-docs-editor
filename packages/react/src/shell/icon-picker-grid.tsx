import { useVirtualizer } from '@tanstack/react-virtual';
import { EmojiPicker, type EmojiPickerListEmojiProps } from 'frimousse';
import { DynamicIcon, iconNames, type IconName } from 'lucide-react/dynamic';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useDocs } from '@/data/context.js';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import type { IconPickerProps } from './IconPicker.js';

/**
 * docs/06 section 8: 9 emoji columns, 8 icon columns, 36 px cells in both. docs/07 section 6:
 * one search box per tab over the same query, `Enter` takes the highlighted cell, and the
 * popover's own `Esc` closes it.
 *
 * Both grids are driven from their search box rather than by tabbing through the cells: a
 * thousand tab stops is not a keyboard path, so the cells stay out of the tab order and the
 * box owns the arrows (`aria-activedescendant` says which cell it is on).
 */

const EMOJI_COLUMNS = 9;
const ICON_COLUMNS = 8;
const CELL = 36;

/** The emoji `Random` offers. Enough to feel arbitrary, few enough to stay in this chunk. */
const RANDOM = [
  '📄',
  '📘',
  '📚',
  '🗂️',
  '📌',
  '📎',
  '🧭',
  '🔭',
  '🔬',
  '🧪',
  '💡',
  '🔧',
  '🛠️',
  '⚙️',
  '🧱',
  '🚀',
  '🛰️',
  '⛵',
  '🌱',
  '🌲',
  '🌊',
  '🔥',
  '⭐',
  '🌙',
  '☀️',
  '🍀',
  '🐝',
  '🐙',
  '🦊',
  '🐢',
  '🎯',
  '🎨',
  '🎵',
  '🧩',
  '🏔️',
  '🗺️',
];

export function IconPickerGrid({ value, onChange }: IconPickerProps): React.JSX.Element {
  const { strings } = useDocs();
  // docs/07 section 6: the search filters both tabs, so switching tabs keeps the query.
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'emoji' | 'icons'>('emoji');
  const panelId = useId();

  return (
    <div className="flex h-[356px] w-full flex-col">
      <div role="tablist" className="flex items-center gap-1 border-b border-border p-1">
        <Tab
          id={panelId}
          current={tab}
          value="emoji"
          label={strings['editor.iconEmoji']}
          onSelect={setTab}
        />
        <Tab
          id={panelId}
          current={tab}
          value="icons"
          label={strings['editor.iconIcons']}
          onSelect={setTab}
        />
        {value !== undefined && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-xs font-normal text-muted-foreground"
            onClick={() => {
              onChange('');
            }}
          >
            {strings['editor.removeIcon']}
          </Button>
        )}
      </div>
      <div role="tabpanel" id={panelId} className="flex flex-1 flex-col overflow-hidden">
        {tab === 'emoji' ? (
          <EmojiTab query={query} onQuery={setQuery} onChange={onChange} />
        ) : (
          <IconsTab query={query} onQuery={setQuery} onChange={onChange} />
        )}
      </div>
    </div>
  );
}

function Tab({
  id,
  current,
  value,
  label,
  onSelect,
}: {
  id: string;
  current: 'emoji' | 'icons';
  value: 'emoji' | 'icons';
  label: string;
  onSelect: (tab: 'emoji' | 'icons') => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={current === value}
      aria-controls={id}
      className={cn(
        'h-7 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-accent',
        current === value && 'bg-accent text-foreground',
      )}
      onClick={() => {
        onSelect(value);
      }}
    >
      {label}
    </button>
  );
}

interface TabProps {
  query: string;
  onQuery: (query: string) => void;
  onChange: (icon: string) => void;
}

const SEARCH =
  'h-8 flex-1 rounded-md border-0 bg-muted px-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50';

function EmojiTab({ query, onQuery, onChange }: TabProps): React.JSX.Element {
  const { strings } = useDocs();
  const search = useRef<HTMLInputElement | null>(null);

  // The popover parks focus on the first tab when it opens, and the grid arrives a chunk
  // later than that; the search box is where the keyboard path starts (docs/07 section 6).
  useEffect(() => {
    search.current?.focus();
  }, []);

  return (
    <EmojiPicker.Root
      className="flex flex-1 flex-col overflow-hidden"
      columns={EMOJI_COLUMNS}
      onEmojiSelect={({ emoji }) => {
        onChange(emoji);
      }}
    >
      <div className="flex items-center gap-1 p-1">
        <EmojiPicker.Search
          ref={search}
          className={SEARCH}
          placeholder={strings['editor.iconSearch']}
          value={query}
          onChange={(event) => {
            onQuery(event.target.value);
          }}
        />
        <EmojiPicker.SkinToneSelector className="flex size-8 shrink-0 items-center justify-center rounded-md text-base hover:bg-accent" />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 px-2 text-xs font-normal"
          onClick={() => {
            onChange(RANDOM[Math.floor(Math.random() * RANDOM.length)] ?? '🎲');
          }}
        >
          {strings['editor.iconRandom']}
        </Button>
      </div>
      <EmojiPicker.Viewport className="relative flex-1 outline-none">
        <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {strings['editor.iconLoading']}
        </EmojiPicker.Loading>
        <EmojiPicker.Empty className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {strings['editor.slash.empty']}
        </EmojiPicker.Empty>
        <EmojiPicker.List
          className="pb-1 select-none"
          components={{
            CategoryHeader: ({ category, className, ...props }) => (
              <div
                {...props}
                className={cn(
                  'bg-popover px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground',
                  className,
                )}
              >
                {category.label}
              </div>
            ),
            Row: ({ className, ...props }) => <div {...props} className={cn('px-1', className)} />,
            Emoji: EmojiCell,
          }}
        />
      </EmojiPicker.Viewport>
    </EmojiPicker.Root>
  );
}

function EmojiCell({ emoji, className, ...props }: EmojiPickerListEmojiProps): React.JSX.Element {
  return (
    <button
      {...props}
      className={cn(
        'flex size-9 items-center justify-center rounded-md text-[22px] leading-none',
        emoji.isActive && 'bg-accent',
        className,
      )}
    >
      {emoji.emoji}
    </button>
  );
}

function IconsTab({ query, onQuery, onChange }: TabProps): React.JSX.Element {
  const { strings } = useDocs();
  const search = useRef<HTMLInputElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const cells = useId();
  const [active, setActive] = useState(0);

  const names = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle === '' ? iconNames : iconNames.filter((name) => name.includes(needle));
  }, [query]);

  const virtualizer = useVirtualizer({
    count: Math.ceil(names.length / ICON_COLUMNS),
    getScrollElement: () => scroller.current,
    estimateSize: () => CELL,
    overscan: 4,
  });

  useEffect(() => {
    search.current?.focus();
  }, []);

  // The highlighted cell follows the arrows, and the viewport follows the highlight.
  const row = Math.floor(active / ICON_COLUMNS);
  useEffect(() => {
    virtualizer.scrollToIndex(row);
  }, [row, virtualizer]);

  const move = (delta: number): void => {
    setActive((index) => Math.min(names.length - 1, Math.max(0, index + delta)));
  };

  return (
    <>
      <div className="flex items-center gap-1 p-1">
        <Input
          ref={search}
          className={SEARCH}
          placeholder={strings['editor.iconSearch']}
          value={query}
          aria-controls={cells}
          aria-activedescendant={names.length === 0 ? undefined : `${cells}-${String(active)}`}
          onChange={(event) => {
            setActive(0);
            onQuery(event.target.value);
          }}
          onKeyDown={(event) => {
            const steps: Record<string, number> = {
              ArrowRight: 1,
              ArrowLeft: -1,
              ArrowDown: ICON_COLUMNS,
              ArrowUp: -ICON_COLUMNS,
            };
            const step = steps[event.key];
            if (step !== undefined) {
              event.preventDefault();
              move(step);
              return;
            }
            if (event.key !== 'Enter') return;
            const name = names[active];
            if (name === undefined) return;
            event.preventDefault();
            onChange(`lucide:${name}`);
          }}
        />
      </div>
      <div
        ref={scroller}
        role="grid"
        id={cells}
        aria-label={strings['editor.iconIcons']}
        className="flex-1 overflow-y-auto px-1 pb-1"
      >
        {names.length === 0 ? (
          <p className="pt-8 text-center text-sm text-muted-foreground">
            {strings['editor.slash.empty']}
          </p>
        ) : (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtual) => (
              <div
                key={virtual.key}
                role="row"
                className="absolute top-0 left-0 grid w-full grid-cols-8 place-items-center"
                style={{
                  height: virtual.size,
                  transform: `translateY(${String(virtual.start)}px)`,
                }}
              >
                {names
                  .slice(virtual.index * ICON_COLUMNS, (virtual.index + 1) * ICON_COLUMNS)
                  .map((name, column) => (
                    <IconCell
                      key={name}
                      name={name}
                      id={`${cells}-${String(virtual.index * ICON_COLUMNS + column)}`}
                      active={virtual.index * ICON_COLUMNS + column === active}
                      onHover={() => {
                        setActive(virtual.index * ICON_COLUMNS + column);
                      }}
                      onSelect={() => {
                        onChange(`lucide:${name}`);
                      }}
                    />
                  ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function IconCell({
  name,
  id,
  active,
  onHover,
  onSelect,
}: {
  name: IconName;
  id: string;
  active: boolean;
  onHover: () => void;
  onSelect: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="gridcell"
      id={id}
      // The search box is the only tab stop: it moves the highlight and takes `Enter`.
      tabIndex={-1}
      aria-selected={active}
      aria-label={name}
      className={cn(
        'flex size-9 items-center justify-center rounded-md text-foreground/80 hover:bg-accent',
        active && 'bg-accent',
      )}
      onMouseMove={onHover}
      onClick={onSelect}
    >
      <DynamicIcon
        name={name}
        aria-hidden="true"
        className="size-5"
        // Icons stream in one chunk at a time; the space they land in is held from the start.
        fallback={() => <span className="size-5" />}
      />
    </button>
  );
}
