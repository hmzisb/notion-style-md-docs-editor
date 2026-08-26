'use client';

import { useToggleButton, useToggleButtonState, useToggleIndex } from '@platejs/toggle/react';
import { ChevronRight } from 'lucide-react';
import { PlateElement, useReadOnly, type PlateElementProps } from 'platejs/react';
import { useDocs } from '@/data/context.js';
import { blockStyles } from '@/lib/block-styles.js';
import { cn } from '@/lib/utils';

/**
 * docs/06 section 7. The summary is the block's own text; what the toggle hides are the
 * blocks indented under it, which Plate finds through the index the plugin keeps - so the
 * same index answers whether this one holds anything at all.
 */
export function ToggleElement(props: PlateElementProps): React.JSX.Element {
  const id = props.element.id as string | undefined;
  const state = useToggleButtonState(id ?? '');
  const { buttonProps, open } = useToggleButton(state);
  const readOnly = useReadOnly();
  const { strings } = useDocs();

  const index = useToggleIndex();
  const empty =
    id === undefined || ![...index.values()].some((enclosing) => enclosing.includes(id));

  return (
    <PlateElement {...props} className={blockStyles.toggle}>
      <button
        type="button"
        contentEditable={false}
        aria-expanded={open}
        aria-label={strings['editor.toggleBlocks']}
        className="mt-0.5 shrink-0 rounded-sm p-px select-none hover:bg-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        {...buttonProps}
      >
        <ChevronRight className={cn(blockStyles.toggleChevron, open && 'rotate-90')} />
      </button>
      <div className="w-full min-w-0">{props.children}</div>
      {/* Only worth saying while there is somewhere to drop a block: in read mode an empty
          toggle is just a line of text (docs/06 section 7). */}
      {readOnly || !empty || open ? null : (
        <span
          contentEditable={false}
          className="shrink-0 text-sm font-normal text-muted-foreground"
        >
          {strings['editor.emptyToggle']}
        </span>
      )}
    </PlateElement>
  );
}
