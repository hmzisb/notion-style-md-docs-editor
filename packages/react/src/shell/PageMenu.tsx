import type { NodeId } from '@hmzisb/notion-docs-core';
import { Ellipsis } from 'lucide-react';
import { Suspense, lazy, useState } from 'react';
import { useDocs } from '@/data/context.js';

/** docs/06 section 6: ghost `size-7`, and a touch target below 768 px (docs/06 section 15). */
export const TRIGGER =
  'flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none max-md:size-11';

export interface PageMenuProps {
  id: NodeId;
  rootId?: NodeId;
}

/** `More options`: the surface renders the trigger the second time, and needs its name. */
export type PageMenuSurfaceProps = PageMenuProps & { label: string };

const Surface = lazy(async () => {
  const { PageMenuSurface } = await import('./page-menu-surface.js');
  return { default: PageMenuSurface };
});

/**
 * docs/06 section 8: the header's `⋯`, which is a button and nothing else until it is pressed.
 * The menu, the icon picker and the two dialogs behind it are a chunk of their own (docs/02
 * section 7), and the press is what fetches it - already open.
 */
export function PageMenu({ id, rootId }: PageMenuProps): React.JSX.Element {
  const { strings } = useDocs();
  const [armed, setArmed] = useState(false);
  const label = strings['header.menu'];

  const button = (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="menu"
      className={TRIGGER}
      // Pointer and keyboard both arrive here: the second `setArmed` of a mouse press is a
      // no-op, and a `click` is all `Enter` and `Space` produce.
      onPointerDown={() => {
        setArmed(true);
      }}
      onClick={() => {
        setArmed(true);
      }}
    >
      <Ellipsis aria-hidden="true" className="size-4" />
    </button>
  );

  if (!armed) return button;
  return (
    <Suspense fallback={button}>
      <Surface id={id} rootId={rootId} label={label} />
    </Suspense>
  );
}
