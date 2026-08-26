import type { NodeId, PageIcon } from '@docs/core';
import { Ellipsis } from 'lucide-react';
import { Suspense, lazy, useState } from 'react';

export const TRIGGER =
  'flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent max-md:size-11';

export interface PageTreeRowMenuProps {
  id: NodeId;
  icon: PageIcon | undefined;
  /** `More options for {title}`, already formatted: the row keeps every string it renders. */
  label: string;
  labels: { addInside: string; rename: string; changeIcon: string; copyLink: string };
  /** D-05: the reason structural items are off, or `null` when the provider is reachable. */
  offline: string | null;
  /** Each handler is absent on a read-only provider, and then so is its item (docs/01 §6). */
  onCreate?: (parentId: NodeId) => void;
  onRename?: (id: NodeId) => void;
  onIcon?: (id: NodeId, icon: string) => void;
  onCopyLink: (id: NodeId) => void;
}

const Surface = lazy(async () => {
  const { RowMenuSurface } = await import('./row-menu-surface.js');
  return { default: RowMenuSurface };
});

/**
 * docs/06 section 5: the row's `⋯`, which is a button and nothing else until it is pressed.
 * docs/10 section 5 is why: a screenful is 45 rows scrolling at 60 fps, and a menu, a popover
 * and their chunk per row is more than that budget has to give for something no row has asked
 * for yet. The press mounts the real one in this one's place, already open.
 */
export function PageTreeRowMenu(props: PageTreeRowMenuProps): React.JSX.Element {
  const [armed, setArmed] = useState(false);

  const button = (
    <button
      type="button"
      // Not a tab stop: the row owns the roving tabindex (docs/07 section 9).
      tabIndex={-1}
      aria-label={props.label}
      className={TRIGGER}
      onPointerDown={() => {
        setArmed(true);
      }}
      // The row would take this as a click on itself and open the page (docs/06 section 5).
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <Ellipsis aria-hidden="true" className="size-4" />
    </button>
  );

  if (!armed) return button;
  return (
    <Suspense fallback={button}>
      <Surface {...props} />
    </Suspense>
  );
}
