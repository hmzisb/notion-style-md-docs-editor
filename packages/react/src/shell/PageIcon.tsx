import type { NodeId, PageIcon as PageIconValue, PageMode, TreeNode } from '@docs/core';
import { Smile } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useDocs } from '@/data/context.js';
import { useUpdateMeta } from '@/data/mutations.js';
import { useStructuralGate } from '@/data/online.js';
import { cn } from '@/lib/utils';
import { IconGlyph } from '@/tree/IconGlyph.js';
import { Button } from '@/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/tooltip';
import { IconPicker } from './IconPicker.js';

export interface PageIconProps {
  pageId: NodeId;
  node: TreeNode;
  rootId?: NodeId;
  mode: PageMode;
  /** A read-only host shows the icon and nothing else: there is no picker to open. */
  editable: boolean;
}

/**
 * docs/06 section 7: the page's icon above the title, 40 px, and the "Add icon" button that
 * takes its place while there is none. Both open the picker (docs/07 section 6).
 */
export function PageIcon({
  pageId,
  node,
  rootId,
  mode,
  editable,
}: PageIconProps): React.JSX.Element | null {
  const { strings } = useDocs();
  const update = useUpdateMeta(rootId);
  const { offline, reason } = useStructuralGate();
  const [open, setOpen] = useState(false);

  const icon = node.icon;
  if (!editable) return icon === undefined ? null : <Glyph icon={icon} node={node} />;
  // Nothing to show and nothing to hover: read mode keeps the page as the reader found it.
  if (icon === undefined && mode !== 'edit') return null;

  const change = (next: string): void => {
    setOpen(false);
    update.mutate(
      { id: pageId, patch: { icon: next } },
      { onError: () => toast(strings['error.generic']) },
    );
  };

  // The icon is a structural change (D-05), so offline it is the same control, turned off.
  // `aria-disabled` rather than `disabled`: a control the keyboard cannot reach is a reason
  // nobody can read, and the tooltip below is the reason (docs/07 section 9).
  const trigger =
    icon === undefined ? (
      <Button
        variant="ghost"
        size="sm"
        aria-disabled={offline}
        // A control nobody can see is a control nobody can reach: the keyboard brings it
        // back, and so does a device with no pointer to hover with (docs/06 section 13).
        className={cn(
          'mb-1 h-7 gap-1.5 px-1.5 text-xs font-normal text-muted-foreground opacity-0 transition-opacity duration-100 group-hover/title:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100',
          offline && 'cursor-not-allowed',
        )}
      >
        <Smile className="size-4" />
        {strings['editor.addIcon']}
      </Button>
    ) : (
      <button
        type="button"
        aria-label={strings['menu.changeIcon']}
        aria-disabled={offline}
        className={cn(
          'mb-2 flex size-10 items-center justify-center rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
          offline ? 'cursor-not-allowed opacity-50' : 'hover:bg-accent',
        )}
      >
        <Inner icon={icon} node={node} />
      </button>
    );

  if (offline) {
    return (
      <TooltipProvider>
        <Tooltip>
          {/* A disabled control fires no pointer events, so the wrapper is what is hovered. */}
          <TooltipTrigger asChild>
            <span className="inline-flex">{trigger}</span>
          </TooltipTrigger>
          <TooltipContent>{reason}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-[352px] gap-0 p-0">
        <IconPicker value={icon} onChange={change} />
      </PopoverContent>
    </Popover>
  );
}

function Glyph({ icon, node }: { icon: PageIconValue; node: TreeNode }): React.JSX.Element {
  return (
    <div className="mb-2 flex size-10 items-center justify-center">
      <Inner icon={icon} node={node} />
    </div>
  );
}

/** docs/06 section 7: an emoji is type at 36 px, a Lucide icon is a 36 px glyph. */
function Inner({ icon, node }: { icon: PageIconValue; node: TreeNode }): React.JSX.Element {
  return (
    <IconGlyph
      icon={icon}
      kind={node.kind}
      className={icon.kind === 'emoji' ? 'text-[36px] leading-none' : 'size-9'}
    />
  );
}
