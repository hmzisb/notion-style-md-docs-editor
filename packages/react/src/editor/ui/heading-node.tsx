'use client';

import { PlateElement, type PlateElementProps } from 'platejs/react';
import { blockStyles } from '@/lib/block-styles.js';

/**
 * H1-H3 only: the codec clamps H4-H6 to H3 (docs/05 section 2), so the editor has no plugin
 * that could produce one. Classes come from {@link blockStyles} so a heading is the same
 * height in edit mode as it was in read mode (docs/06 section 3).
 */
export function H1Element(props: PlateElementProps): React.JSX.Element {
  return (
    <PlateElement {...props} as="h1" className={blockStyles.h1}>
      {props.children}
    </PlateElement>
  );
}

export function H2Element(props: PlateElementProps): React.JSX.Element {
  return (
    <PlateElement {...props} as="h2" className={blockStyles.h2}>
      {props.children}
    </PlateElement>
  );
}

export function H3Element(props: PlateElementProps): React.JSX.Element {
  return (
    <PlateElement {...props} as="h3" className={blockStyles.h3}>
      {props.children}
    </PlateElement>
  );
}
