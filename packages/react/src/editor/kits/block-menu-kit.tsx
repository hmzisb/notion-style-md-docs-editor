'use client';

import { createPlatePlugin } from 'platejs/react';

import { BlockContextMenu } from '@/editor/ui/block-context-menu';

/**
 * docs/05 section 2: the right-click menu over a block. Plate's own `BlockMenuPlugin` is
 * `editOnly`, so its wrapper leaves the tree on the read flip and takes the editable with it
 * (docs/05 section 8, DEV-013). This one is registered in both modes and the menu itself is
 * what turns off, and the selection half stays `BlockSelectionKit`.
 */
export const BlockMenuKit = [
  createPlatePlugin({
    key: 'docsBlockMenu',
    render: { aboveEditable: BlockContextMenu },
  }),
];
