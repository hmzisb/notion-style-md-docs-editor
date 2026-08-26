import type { PageIcon } from '@docs/core';
import { Suspense, lazy } from 'react';

export interface IconPickerProps {
  value?: PageIcon;
  /** An emoji, `lucide:<name>`, or `''` to remove the icon (docs/03 section 5). */
  onChange: (icon: string) => void;
}

/**
 * The grid is a chunk of its own: the emoji data source and Lucide's icon map are worth about
 * as much as the rest of the shell, and nobody pays for them until a picker is opened
 * (docs/02 section 7).
 */
const Grid = lazy(async () => {
  const { IconPickerGrid } = await import('./icon-picker-grid.js');
  return { default: IconPickerGrid };
});

/** docs/06 section 8 and docs/07 section 6: emoji and Lucide icons, searchable, plus Remove. */
export function IconPicker(props: IconPickerProps): React.JSX.Element {
  // The height the grid settles at, so opening the popover does not resize it a moment later.
  return (
    <Suspense fallback={<div className="h-[356px]" />}>
      <Grid {...props} />
    </Suspense>
  );
}
