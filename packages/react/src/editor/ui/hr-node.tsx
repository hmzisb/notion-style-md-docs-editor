'use client';

import {
  PlateElement,
  useFocused,
  useReadOnly,
  useSelected,
  type PlateElementProps,
} from 'platejs/react';
import { blockStyles } from '@/lib/block-styles.js';
import { cn } from '@/lib/utils';

/** Void: the rule is decoration and sits inside a 12 px hit area (docs/06 section 7). */
export function HrElement(props: PlateElementProps): React.JSX.Element {
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();

  return (
    <PlateElement {...props}>
      <div className={blockStyles.hrBox} contentEditable={false}>
        <hr
          className={cn(
            blockStyles.hrRule,
            selected && focused && 'border-primary',
            !readOnly && 'cursor-pointer',
          )}
        />
      </div>
      {props.children}
    </PlateElement>
  );
}
