'use client';

import { CALLOUT_ICONS, type CalloutVariant } from '@docs/core';
import type { TCalloutElement } from 'platejs';
import { PlateElement, useEditorRef, useReadOnly, type PlateElementProps } from 'platejs/react';
import { useState } from 'react';
import { useDocs } from '@/data/context.js';
import { blockStyles } from '@/lib/block-styles.js';
import {
  CALLOUT_VARIANTS,
  CALLOUT_VARIANT_KEYS,
  calloutVariantOf,
  type CalloutStyle,
} from '@/lib/callout.js';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu';

/**
 * `@/lib` may not import `@docs/core` (docs/02 section 2), so this is where the two halves of
 * the variant list meet: a variant core knows and this file cannot draw fails here.
 */
const VARIANTS: Record<CalloutVariant, CalloutStyle> = CALLOUT_VARIANTS;

/**
 * docs/06 section 7. A callout here is a GFM alert (docs/05 section 5), so its icon is not an
 * author's emoji but the variant's: the icon button picks the variant instead, which is the
 * only part of a callout the Markdown can carry.
 */
export function CalloutElement(props: PlateElementProps<TCalloutElement>): React.JSX.Element {
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const { strings } = useDocs();
  const [open, setOpen] = useState(false);

  const variant = calloutVariantOf(props.element.variant);
  const { Icon, tint } = VARIANTS[variant];

  const change = (next: string): void => {
    const chosen = calloutVariantOf(next);
    editor.tf.setNodes<TCalloutElement>(
      { variant: chosen, icon: CALLOUT_ICONS[chosen] },
      { at: props.element },
    );
  };

  return (
    <PlateElement {...props} className={blockStyles.callout}>
      {/* Outside the editable tree: a click here is a menu, not a caret (docs/05 section 6). */}
      <span contentEditable={false} className="select-none">
        {readOnly ? (
          <Icon aria-hidden="true" className={cn(blockStyles.calloutIcon, tint)} />
        ) : (
          <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
            <DropdownMenuTrigger
              aria-label={strings['editor.callout.variant']}
              className="-m-1 flex rounded-sm p-1 hover:bg-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Icon aria-hidden="true" className={cn(blockStyles.calloutIcon, tint)} />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="min-w-40"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                editor.tf.focus();
              }}
            >
              <DropdownMenuRadioGroup value={variant} onValueChange={change}>
                {CALLOUT_VARIANT_KEYS.map((key) => (
                  <VariantItem key={key} variant={key} />
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </span>
      <div className="w-full min-w-0">{props.children}</div>
    </PlateElement>
  );
}

function VariantItem({ variant }: { variant: CalloutVariant }): React.JSX.Element {
  const { strings } = useDocs();
  const { Icon, tint, name } = VARIANTS[variant];
  return (
    <DropdownMenuRadioItem value={variant}>
      <Icon aria-hidden="true" className={cn('size-4', tint)} />
      {strings[name]}
    </DropdownMenuRadioItem>
  );
}
