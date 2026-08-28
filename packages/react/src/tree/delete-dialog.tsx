import { subtreeIds, type NodeId, type TreeIndex } from '@hmzisb/notion-docs-core';
import { useRef } from 'react';
import { useDocs } from '@/data/context.js';
import { format } from '@/data/strings.js';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/ui/alert-dialog';

export interface DeleteDialogProps {
  index: TreeIndex;
  /** The page being deleted, and with it everything under it. */
  id: NodeId;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * docs/06 section 8: the one dialog that says how much goes, because the sub-pages of a page
 * are not on the screen when its own row is the only thing being pointed at.
 */
export function DeleteDialog({
  index,
  id,
  onConfirm,
  onClose,
}: DeleteDialogProps): React.JSX.Element {
  const { strings } = useDocs();
  /** Confirming closes the dialog too, and that close is not the cancel `onClose` answers for. */
  const confirmed = useRef(false);
  const title = index.byId[id]?.title ?? '';
  // The subtree counts the page itself, and the copy is about what goes with it.
  const count = subtreeIds(index, id).length - 1;

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !confirmed.current) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{format(strings['dialog.delete.title'], { title })}</AlertDialogTitle>
          <AlertDialogDescription>
            {count === 0
              ? strings['dialog.delete.bodyLeaf']
              : format(strings['dialog.delete.body'], { count })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{strings['dialog.cancel']}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              confirmed.current = true;
              onConfirm();
            }}
          >
            {strings['dialog.delete.confirm']}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
