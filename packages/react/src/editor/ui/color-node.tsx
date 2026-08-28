'use client';

import { isTextColor } from '@hmzisb/notion-docs-core';
import { PlateLeaf, type PlateLeafProps } from 'platejs/react';

/**
 * DEV-034: the Markdown carries a hex inline, so a page read outside this module keeps its
 * colour with no stylesheet; the module paints from its own variable instead, which is what
 * lets dark mode use a lighter one (docs/06 section 12).
 */
export function ColorLeaf(props: PlateLeafProps): React.JSX.Element {
  const { color } = props.leaf as { color?: unknown };
  return (
    <PlateLeaf
      {...props}
      style={isTextColor(color) ? { color: `var(--docs-text-${color})` } : undefined}
    />
  );
}
