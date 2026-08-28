import {
  ancestorsOf,
  flatten,
  isDescendant,
  type NodeId,
  type TreeIndex,
} from '@hmzisb/notion-docs-core';
import { useMemo } from 'react';
import { useDocs } from '@/data/context.js';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/ui/command';

export interface MoveToDialogProps {
  index: TreeIndex;
  /** The page being moved: neither it nor anything under it is a destination. */
  id: NodeId;
  /** `null` is the root. The page lands as the last child of whatever is picked. */
  onPick: (parentId: NodeId | null) => void;
  onClose: () => void;
}

/**
 * docs/06 section 8: the keyboard's way to reparent, for the reach drag and drop does not have -
 * a page far enough down the tree that the two rows are never on the screen together.
 */
export function MoveToDialog({ index, id, onPick, onClose }: MoveToDialogProps): React.JSX.Element {
  const { strings } = useDocs();

  const destinations = useMemo(
    () =>
      flatten(index)
        .filter((candidate) => candidate !== id && !isDescendant(index, candidate, id))
        .map((candidate) => ({
          id: candidate,
          title: index.byId[candidate]?.title ?? '',
          // The row is a title; the path under it is what tells two pages of the same name apart.
          path: ancestorsOf(index, candidate)
            .map((ancestorId) => index.byId[ancestorId]?.title ?? '')
            .join(' / '),
        })),
    [id, index],
  );

  return (
    <CommandDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={strings['dialog.move.title']}
      description={strings['dialog.move.placeholder']}
    >
      <Command label={strings['dialog.move.title']}>
        <CommandInput placeholder={strings['dialog.move.placeholder']} />
        <CommandList>
          <CommandEmpty>{strings['dialog.move.empty']}</CommandEmpty>
          <CommandItem
            value={strings['dialog.move.root']}
            onSelect={() => {
              onPick(null);
            }}
          >
            {strings['dialog.move.root']}
          </CommandItem>
          {destinations.map((destination) => (
            <CommandItem
              key={destination.id}
              value={`${destination.title} ${destination.path}`}
              onSelect={() => {
                onPick(destination.id);
              }}
            >
              <span className="flex flex-col">
                <span>{destination.title}</span>
                {destination.path === '' ? null : (
                  <span className="text-xs text-muted-foreground">{destination.path}</span>
                )}
              </span>
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
