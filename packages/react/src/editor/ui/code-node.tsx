'use client';

import { PlateLeaf, type PlateLeafProps } from 'platejs/react';
import { blockStyles } from '@/lib/block-styles.js';
import { cn } from '@/lib/utils';

export function CodeLeaf(props: PlateLeafProps): React.JSX.Element {
  return (
    <PlateLeaf {...props} as="code" className={cn(blockStyles.code, 'whitespace-pre-wrap')}>
      {props.children}
    </PlateLeaf>
  );
}
