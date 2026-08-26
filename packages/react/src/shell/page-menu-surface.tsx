import { joinFrontmatter } from '@docs/core';
import {
  CornerUpRight,
  Download,
  Ellipsis,
  Link2,
  PenLine,
  Smile,
  Trash2,
  Type,
} from 'lucide-react';
import { Suspense, lazy, useRef, useState } from 'react';
import { toast } from '@/lib/toast.js';
import { useDocs } from '@/data/context.js';
import { useDeletePage, useMovePage, useUpdateMeta } from '@/data/mutations.js';
import { useStructuralGate } from '@/data/online.js';
import { usePage, useTreeIndex } from '@/data/queries.js';
import { format } from '@/data/strings.js';
import { copyText } from '@/lib/clipboard.js';
import { IconPicker } from '@/tree/IconPicker.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu';
import { Popover, PopoverAnchor, PopoverContent } from '@/ui/popover';
import { TRIGGER, type PageMenuSurfaceProps } from './PageMenu.js';
import { focusTitle } from './title-focus.js';

const MoveTo = lazy(async () => {
  const { MoveToDialog } = await import('@/tree/move-to-dialog.js');
  return { default: MoveToDialog };
});

const Delete = lazy(async () => {
  const { DeleteDialog } = await import('@/tree/delete-dialog.js');
  return { default: DeleteDialog };
});

/** docs/06 section 8: "1,240 words", counted the way a reader would count them. */
function wordsIn(body: string): number {
  const trimmed = body.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/u).length;
}

/**
 * The `.md` a browser saves. The path is the workspace's business and half of them are
 * `index.md`, so the title is what names the file the reader ends up with.
 */
function fileNameFor(title: string): string {
  const stem = title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim();
  return `${stem === '' ? 'page' : stem}.md`;
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * docs/06 section 8: the page menu itself. A chunk of its own on the ASM-063 shape - the
 * picker, the two dialogs and the menu below them are weight no reader pays for until the
 * header's `⋯` is pressed.
 */
export function PageMenuSurface({ id, rootId, label }: PageMenuSurfaceProps): React.JSX.Element {
  const { capabilities, navigation, ns, strings } = useDocs();
  // The press is what mounted this, so the press is what it opens on.
  const [open, setOpen] = useState(true);
  const [picking, setPicking] = useState(false);
  const [moving, setMoving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // D-05: icon, rename, move and delete all need the provider on the other end.
  const { offline, reason } = useStructuralGate();
  /** What an item that opens a surface of its own left for the menu to run as it goes. */
  const pending = useRef<(() => void) | null>(null);

  const { data: index } = useTreeIndex(rootId);
  const { data: page } = usePage(id);
  const update = useUpdateMeta(rootId);
  const move = useMovePage(rootId);
  const del = useDeletePage(rootId);

  const node = index?.byId[id];
  const title = node?.title ?? '';
  /** The file as it is on disk, which is what both "Copy as Markdown" and the download are. */
  const source = page === undefined ? null : joinFrontmatter(page.meta, page.body, page.eol);

  const copy = (text: string, done: string): void => {
    void copyText(text).then((ok) => {
      toast(ok ? done : strings['error.generic']);
    });
  };

  return (
    // The picker opens where the menu was, so both come out of the same button.
    <Popover open={picking} onOpenChange={setPicking}>
      {/*
       * Not modal: Radix would hide the rest of the app with `aria-hidden` while leaving every
       * control inside it focusable, which is an `aria-hidden-focus` violation (docs/10 s2).
       */}
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <PopoverAnchor asChild>
          <DropdownMenuTrigger aria-label={label} className={TRIGGER}>
            <Ellipsis aria-hidden="true" className="size-4" />
          </DropdownMenuTrigger>
        </PopoverAnchor>

        <DropdownMenuContent
          align="end"
          collisionPadding={8}
          // Change icon opens a picker, Move to and Delete open dialogs, and all three want the
          // focus this menu is about to hand back to its trigger. Fired from the teardown, once
          // the menu's focus scope has let go of the keyboard (docs/07 section 9).
          onCloseAutoFocus={(event) => {
            const surface = pending.current;
            if (surface === null) return;
            pending.current = null;
            event.preventDefault();
            surface();
          }}
        >
          {offline && (
            <DropdownMenuLabel className="font-normal text-muted-foreground">
              {reason}
            </DropdownMenuLabel>
          )}
          <DropdownMenuItem
            onSelect={() => {
              copy(navigation.href?.({ pageId: id }) ?? id, strings['menu.copiedLink']);
            }}
          >
            <Link2 aria-hidden="true" />
            {strings['menu.copyLink']}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={source === null}
            onSelect={() => {
              if (source !== null) copy(source, strings['menu.copiedMarkdown']);
            }}
          >
            <Type aria-hidden="true" />
            {strings['menu.copyMarkdown']}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={source === null}
            onSelect={() => {
              if (source === null) return;
              download(fileNameFor(title), source);
              toast(format(strings['menu.downloaded'], { title }));
            }}
          >
            <Download aria-hidden="true" />
            {strings['menu.download']}
          </DropdownMenuItem>

          {capabilities.write && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={offline}
                onSelect={() => {
                  pending.current = () => {
                    setPicking(true);
                  };
                }}
              >
                <Smile aria-hidden="true" />
                {strings['menu.changeIcon']}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={offline}
                onSelect={() => {
                  // The title is in the canvas, and it takes the caret once this menu has
                  // stopped holding the keyboard.
                  pending.current = () => {
                    focusTitle(ns, id);
                  };
                }}
              >
                <PenLine aria-hidden="true" />
                {strings['menu.rename']}
              </DropdownMenuItem>
            </>
          )}
          {capabilities.move && (
            <DropdownMenuItem
              disabled={offline}
              onSelect={() => {
                pending.current = () => {
                  setMoving(true);
                };
              }}
            >
              <CornerUpRight aria-hidden="true" />
              {strings['menu.moveTo']}
            </DropdownMenuItem>
          )}

          {page !== undefined && (
            <>
              <DropdownMenuSeparator />
              {/* An info row, so it is in the menu without being one of its choices. */}
              <DropdownMenuItem disabled>
                {format(strings['menu.wordCount'], {
                  count: wordsIn(page.body).toLocaleString(),
                })}
              </DropdownMenuItem>
            </>
          )}

          {capabilities.delete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={offline}
                onSelect={() => {
                  pending.current = () => {
                    setDeleting(true);
                  };
                }}
              >
                <Trash2 aria-hidden="true" />
                {strings['menu.delete']}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <PopoverContent
        align="end"
        aria-label={strings['menu.changeIcon']}
        className="w-[352px] p-0"
      >
        <IconPicker
          value={node?.icon}
          onChange={(next) => {
            setPicking(false);
            update.mutate(
              { id, patch: { icon: next } },
              {
                onError: () => {
                  toast(strings['error.generic']);
                },
              },
            );
          }}
        />
      </PopoverContent>

      {moving && index !== undefined && (
        <Suspense fallback={null}>
          <MoveTo
            index={index}
            id={id}
            onPick={(parentId) => {
              setMoving(false);
              // docs/06 section 8: the dialog reparents, and the page lands last among its
              // new siblings - where among them is the drag's business.
              const siblings =
                parentId === null ? index.rootIds : (index.byId[parentId]?.childIds ?? []);
              move.mutate(
                { id, parentId, index: siblings.length },
                {
                  onError: () => {
                    toast(format(strings['error.move'], { title }));
                  },
                },
              );
            }}
            onClose={() => {
              setMoving(false);
            }}
          />
        </Suspense>
      )}

      {deleting && index !== undefined && (
        <Suspense fallback={null}>
          <Delete
            index={index}
            id={id}
            onConfirm={() => {
              setDeleting(false);
              // The toasts belong to the mutation: this menu goes with the page it deletes.
              del.mutate({ id });
            }}
            onClose={() => {
              setDeleting(false);
            }}
          />
        </Suspense>
      )}
    </Popover>
  );
}
