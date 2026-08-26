import type { NodeId, PageMode } from '@docs/core';
import { Suspense, lazy, useState } from 'react';

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rootId?: NodeId;
  onOpenPage: (id: NodeId, opts?: { mode?: PageMode }) => void;
  /** Phase 3 wires creation; until then the shell answers with a toast (docs/09 P1-T12). */
  onCreatePage: (title: string) => void;
  onThemeChange?: (theme: 'light' | 'dark' | 'system') => void;
}

/**
 * The palette is a chunk of its own: cmdk and its dialog are worth about a fifth of the shell
 * and nothing renders them until a key is pressed (docs/02 section 7, DEV-012).
 */
const Dialog = lazy(async () => {
  const { CommandPaletteDialog } = await import('./command-palette.js');
  return { default: CommandPaletteDialog };
});

/** docs/06 section 8 and docs/07 section 4: Recent, then Pages, then Actions. */
export function CommandPalette(props: CommandPaletteProps): React.JSX.Element | null {
  // Once loaded it stays mounted, so closing still runs the dialog's own close animation.
  const [loaded, setLoaded] = useState(props.open);
  if (props.open && !loaded) setLoaded(true);

  return loaded ? (
    <Suspense fallback={null}>
      <Dialog {...props} />
    </Suspense>
  ) : null;
}
