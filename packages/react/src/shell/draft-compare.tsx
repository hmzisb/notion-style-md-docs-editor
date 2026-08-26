import { useMemo } from 'react';
import { useDocs } from '@/data/context.js';
import { diffLines, type DiffRow } from '@/lib/line-diff.js';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/dialog';

export interface DraftCompareProps {
  /** The page as it stands on disk. */
  file: string;
  /** The unsaved body the mismatch banner is asking about. */
  draft: string;
  onClose: () => void;
}

/** One side of one row: the line number, then the line, or an empty cell where the side has none. */
function Side({ row, side }: { row: DiffRow; side: 'left' | 'right' }): React.JSX.Element {
  const missing = side === 'left' ? row.kind === 'added' : row.kind === 'removed';
  const no = side === 'left' ? row.leftNo : row.rightNo;
  return (
    <div
      className={cn(
        'flex min-w-0 gap-2 px-2',
        missing && 'bg-muted/40',
        !missing && row.kind === 'removed' && 'bg-red-100/70 dark:bg-red-950/40',
        !missing && row.kind === 'added' && 'bg-emerald-100/70 dark:bg-emerald-950/40',
      )}
    >
      <span className="w-8 shrink-0 text-right text-muted-foreground tabular-nums select-none">
        {no ?? ''}
      </span>
      {/* `whitespace-pre-wrap`: a long Markdown line wraps inside its cell rather than
          scrolling the two sides out of step with each other. */}
      <span className="min-w-0 flex-1 whitespace-pre-wrap">{missing ? '' : row.text}</span>
    </div>
  );
}

/**
 * docs/04 section 3.3: what "Apply draft" and "Keep file" are choosing between. A read-only
 * view - the answer is still one of the two banner buttons, so there is nothing to confirm here.
 */
export function DraftCompare({ file, draft, onClose }: DraftCompareProps): React.JSX.Element {
  const { strings } = useDocs();
  const rows = useMemo(() => diffLines(file, draft), [file, draft]);
  const changed = rows.some((row) => row.kind !== 'same');

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-3xl" data-docs-dialog="compare">
        <DialogHeader>
          <DialogTitle>{strings['dialog.compare.title']}</DialogTitle>
          <DialogDescription>{strings['dialog.compare.description']}</DialogDescription>
        </DialogHeader>

        {changed ? (
          <div className="overflow-hidden rounded-md border">
            <div className="grid grid-cols-2 border-b bg-muted/60 text-xs font-medium">
              <div className="border-r px-2 py-1">{strings['dialog.compare.file']}</div>
              <div className="px-2 py-1">{strings['dialog.compare.draft']}</div>
            </div>
            {/* The pane scrolls, not the dialog: the footer stays reachable on a long diff. */}
            <div className="max-h-[50vh] overflow-y-auto font-mono text-xs leading-5">
              {rows.map((row, i) => (
                <div key={i} className="grid grid-cols-2">
                  <div className="min-w-0 border-r">
                    <Side row={row} side="left" />
                  </div>
                  <div className="min-w-0">
                    <Side row={row} side="right" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">{strings['dialog.compare.same']}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {strings['dialog.compare.close']}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
