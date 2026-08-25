'use client';

import { PlateElement, type PlateElementProps } from 'platejs/react';
import { blockStyles } from '@/lib/block-styles.js';

export function BlockquoteElement(props: PlateElementProps): React.JSX.Element {
  return (
    <PlateElement {...props} as="blockquote" className={blockStyles.blockquote}>
      {props.children}
    </PlateElement>
  );
}
