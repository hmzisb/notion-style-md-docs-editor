'use client';

import { Info, Lightbulb, MessageSquareWarning, OctagonAlert, TriangleAlert } from 'lucide-react';
import type { TCalloutElement } from 'platejs';
import { PlateElement, type PlateElementProps } from 'platejs/react';
import { cn } from '@/lib/utils';

/**
 * docs/06 section 7. A callout here is a GFM alert (docs/05 section 5), so its variant is one
 * of five fixed kinds rather than the registry item's free emoji: the icon is what the
 * Markdown says it is, and only the icon carries the variant's colour.
 */
const VARIANTS = {
  note: { Icon: Info, tint: 'text-blue-600 dark:text-blue-400' },
  tip: { Icon: Lightbulb, tint: 'text-green-600 dark:text-green-400' },
  important: { Icon: MessageSquareWarning, tint: 'text-violet-600 dark:text-violet-400' },
  warning: { Icon: TriangleAlert, tint: 'text-amber-600 dark:text-amber-400' },
  caution: { Icon: OctagonAlert, tint: 'text-red-600 dark:text-red-400' },
} as const;

type CalloutVariant = keyof typeof VARIANTS;

const isVariant = (value: unknown): value is CalloutVariant =>
  typeof value === 'string' && value in VARIANTS;

export function CalloutElement(props: PlateElementProps<TCalloutElement>): React.JSX.Element {
  const variant = isVariant(props.element.variant) ? props.element.variant : 'note';
  const { Icon, tint } = VARIANTS[variant];

  return (
    <PlateElement {...props} className="my-1 flex gap-3 rounded-md bg-muted p-4">
      <span contentEditable={false}>
        <Icon aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', tint)} />
      </span>
      <div className="w-full min-w-0">{props.children}</div>
    </PlateElement>
  );
}
