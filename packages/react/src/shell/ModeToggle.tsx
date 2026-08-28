import type { PageMode } from '@hmzisb/notion-docs-core';
import { Loader2 } from 'lucide-react';
import { useDocs } from '@/data/context.js';
import { format } from '@/data/strings.js';
import { relativeTime } from '@/lib/relative-time.js';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/tooltip';

export interface ModeToggleProps {
  mode: PageMode;
  onChange: (mode: PageMode) => void;
  /**
   * The editor chunk is still loading. docs/05 section 8: the spinner lives inside this
   * control, never over the page, and the control stays clickable while it spins.
   */
  loading?: boolean;
  /** Epoch ms of the last save. In edit mode the tooltip reads "Saved ..." (docs/06 section 9). */
  savedAt?: number | null;
  className?: string;
}

/** docs/06 section 6: ghost "Edit", filled "Done" while editing. */
export function ModeToggle({
  mode,
  onChange,
  loading = false,
  savedAt = null,
  className,
}: ModeToggleProps): React.JSX.Element {
  const { strings } = useDocs();
  const editing = mode === 'edit';

  const button = (
    <Button
      variant={editing ? 'default' : 'ghost'}
      size="sm"
      // 44 px on a phone (docs/06 section 16), 28 px on a pointer device.
      className={cn('h-7 gap-1.5 px-2.5 text-sm max-md:h-11', className)}
      aria-busy={loading || undefined}
      onClick={() => {
        onChange(editing ? 'read' : 'edit');
      }}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
      {editing ? strings['header.done'] : strings['header.edit']}
    </Button>
  );

  if (!editing || savedAt === null) return button;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="bottom">
          {format(strings['header.savedAt'], { time: relativeTime(savedAt) })}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
