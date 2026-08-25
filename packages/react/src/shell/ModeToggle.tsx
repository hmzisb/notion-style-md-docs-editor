import type { PageMode } from '@docs/core';
import { Loader2 } from 'lucide-react';
import { useDocs } from '@/data/context.js';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/button';

export interface ModeToggleProps {
  mode: PageMode;
  onChange: (mode: PageMode) => void;
  /**
   * The editor chunk is still loading. docs/05 section 8: the spinner lives inside this
   * control, never over the page, and the control stays clickable while it spins.
   */
  loading?: boolean;
  className?: string;
}

/** docs/06 section 6: ghost "Edit", filled "Done" while editing. */
export function ModeToggle({
  mode,
  onChange,
  loading = false,
  className,
}: ModeToggleProps): React.JSX.Element {
  const { strings } = useDocs();
  const editing = mode === 'edit';

  return (
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
}
