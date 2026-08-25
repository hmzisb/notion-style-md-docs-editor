'use client';

import { KEYS } from 'platejs';
import { BlockPlaceholderPlugin, type AnyPlatePlugin } from 'platejs/react';
import type { DocsStrings } from '@/data/strings.js';

/**
 * docs/05 section 6: the focused empty paragraph invites the slash menu, and an empty heading
 * says which level it is. `query` keeps placeholders on top-level blocks, so an empty
 * paragraph inside a callout or a table cell stays blank.
 */
export function createBlockPlaceholderKit(strings: DocsStrings): AnyPlatePlugin[] {
  return [
    BlockPlaceholderPlugin.configure({
      options: {
        className:
          'before:absolute before:cursor-text before:text-muted-foreground/40 before:content-[attr(placeholder)]',
        placeholders: {
          [KEYS.p]: strings['editor.bodyPlaceholder'],
          [KEYS.h1]: strings['editor.heading1Placeholder'],
          [KEYS.h2]: strings['editor.heading2Placeholder'],
          [KEYS.h3]: strings['editor.heading3Placeholder'],
        },
        query: ({ path }) => path.length === 1,
      },
    }),
  ];
}
