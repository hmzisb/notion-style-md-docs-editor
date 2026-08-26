import {
  Info,
  Lightbulb,
  Megaphone,
  OctagonAlert,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type { DocsStrings } from '@/data/strings.js';

/**
 * docs/06 section 7, in one place because two renderers draw a callout: the static
 * `view/nodes.tsx` and the editor's node component. The tint is the icon's alone - the box
 * is `bg-muted` in every variant - and the icon is the one docs/05 section 5 gives the
 * Markdown marker, so it cannot be picked.
 *
 * The five variants are GitHub's alert set, which `@docs/core` owns; this layer may not
 * import it (docs/02 section 2), so `callout-node.tsx` holds the check that both lists
 * still say the same thing.
 */
export const CALLOUT_VARIANTS = {
  note: { Icon: Info, tint: 'text-blue-600 dark:text-blue-400', name: 'editor.callout.note' },
  tip: { Icon: Lightbulb, tint: 'text-green-600 dark:text-green-400', name: 'editor.callout.tip' },
  important: {
    Icon: Megaphone,
    tint: 'text-violet-600 dark:text-violet-400',
    name: 'editor.callout.important',
  },
  warning: {
    Icon: TriangleAlert,
    tint: 'text-amber-600 dark:text-amber-400',
    name: 'editor.callout.warning',
  },
  caution: {
    Icon: OctagonAlert,
    tint: 'text-red-600 dark:text-red-400',
    name: 'editor.callout.caution',
  },
} as const satisfies Record<string, { Icon: LucideIcon; tint: string; name: keyof DocsStrings }>;

export type CalloutStyle = (typeof CALLOUT_VARIANTS)[keyof typeof CALLOUT_VARIANTS];

/** The variants in the order docs/05 section 5 lists their markers. */
export const CALLOUT_VARIANT_KEYS = Object.keys(
  CALLOUT_VARIANTS,
) as (keyof typeof CALLOUT_VARIANTS)[];

/** A value out of a file is free text: anything that is not a variant reads as a note. */
export const calloutVariantOf = (value: unknown): keyof typeof CALLOUT_VARIANTS =>
  typeof value === 'string' && value in CALLOUT_VARIANTS
    ? (value as keyof typeof CALLOUT_VARIANTS)
    : 'note';
