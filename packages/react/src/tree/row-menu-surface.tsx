import { CornerUpRight, Ellipsis, Link2, PenLine, Plus, Smile, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu';
import { Popover, PopoverAnchor, PopoverContent } from '@/ui/popover';
import { IconPicker } from './IconPicker.js';
import { TRIGGER, type PageTreeRowMenuProps } from './PageTreeRowMenu.js';

/**
 * docs/06 sections 5 and 8: the row menu itself, and the icon picker it opens. A chunk of its
 * own (docs/02 section 7): a menu and a popover per row is weight every tree pays for, and
 * nobody needs either until a row's `⋯` is pressed.
 */
export function RowMenuSurface({
  id,
  icon,
  label,
  labels,
  offline,
  onCreate,
  onRename,
  onIcon,
  onCopyLink,
  onMoveTo,
  onDelete,
}: PageTreeRowMenuProps): React.JSX.Element {
  // It arrives because the button was pressed, so the press is what it opens on.
  const [open, setOpen] = useState(true);
  const [picking, setPicking] = useState(false);
  const gated = offline !== null;
  /** What an item that opens a surface of its own left for the menu to run as it goes. */
  const pending = useRef<(() => void) | null>(null);
  const glyph = <Ellipsis aria-hidden="true" className="size-4" />;

  return (
    // The picker opens where the menu was, so it is anchored on the button both come out of.
    <Popover open={picking} onOpenChange={setPicking}>
      {/*
       * Not modal: Radix would hide the rest of the app with `aria-hidden` while leaving every
       * control inside it focusable, which is an `aria-hidden-focus` violation (docs/10 s2).
       */}
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <PopoverAnchor asChild>
          <DropdownMenuTrigger
            tabIndex={-1}
            aria-label={label}
            className={TRIGGER}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            {glyph}
          </DropdownMenuTrigger>
        </PopoverAnchor>

        <DropdownMenuContent
          align="start"
          // A row on a phone is a hand's width from the edge, and the menu is wider than
          // what is left of it (docs/06 section 15).
          collisionPadding={8}
          // Rename opens a field and Change icon opens a picker, and both want the focus this
          // menu is about to hand back to its trigger. This fires from the menu's own teardown,
          // once it is off the screen: before that its focus scope still owns the keyboard and
          // pulls it straight back out of whatever opened (docs/07 section 9).
          onCloseAutoFocus={(event) => {
            const surface = pending.current;
            if (surface === null) return;
            pending.current = null;
            event.preventDefault();
            surface();
          }}
        >
          {gated && (
            <DropdownMenuLabel className="font-normal text-muted-foreground">
              {offline}
            </DropdownMenuLabel>
          )}
          {onCreate !== undefined && (
            <DropdownMenuItem
              disabled={gated}
              onSelect={() => {
                onCreate(id);
              }}
            >
              <Plus aria-hidden="true" />
              {labels.addInside}
            </DropdownMenuItem>
          )}
          {onRename !== undefined && (
            <DropdownMenuItem
              disabled={gated}
              onSelect={() => {
                pending.current = () => {
                  onRename(id);
                };
              }}
            >
              <PenLine aria-hidden="true" />
              {labels.rename}
            </DropdownMenuItem>
          )}
          {onIcon !== undefined && (
            <DropdownMenuItem
              disabled={gated}
              onSelect={() => {
                pending.current = () => {
                  setPicking(true);
                };
              }}
            >
              <Smile aria-hidden="true" />
              {labels.changeIcon}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => {
              onCopyLink(id);
            }}
          >
            <Link2 aria-hidden="true" />
            {labels.copyLink}
          </DropdownMenuItem>
          {onMoveTo !== undefined && (
            <DropdownMenuItem
              disabled={gated}
              onSelect={() => {
                // A dialog, so it opens from the teardown for the same reason the picker does.
                pending.current = () => {
                  onMoveTo(id);
                };
              }}
            >
              <CornerUpRight aria-hidden="true" />
              {labels.moveTo}
            </DropdownMenuItem>
          )}
          {onDelete !== undefined && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={gated}
                onSelect={() => {
                  // The confirmation is a dialog, so it opens from the teardown too.
                  pending.current = () => {
                    onDelete(id);
                  };
                }}
              >
                <Trash2 aria-hidden="true" />
                {labels.delete}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <PopoverContent align="start" aria-label={labels.changeIcon} className="w-[352px] p-0">
        {onIcon !== undefined && (
          <IconPicker
            value={icon}
            onChange={(next) => {
              setPicking(false);
              onIcon(id, next);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
