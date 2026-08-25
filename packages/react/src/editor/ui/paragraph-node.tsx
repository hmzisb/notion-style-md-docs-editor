'use client';

import { PlateElement, type PlateElementProps } from 'platejs/react';
import { blockStyles } from '@/lib/block-styles.js';

export function ParagraphElement(props: PlateElementProps): React.JSX.Element {
  return (
    <PlateElement {...props} className={blockStyles.p}>
      {props.children}
    </PlateElement>
  );
}
