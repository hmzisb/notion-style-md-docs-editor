'use client';

import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

import { DndPlugin } from '@platejs/dnd';

import { BlockDraggable } from '@/editor/ui/block-draggable';

/**
 * docs/05 section 6. The registry item also drops files into a media placeholder; that path
 * needs `uploadAsset` and the host's `capabilities.upload`, so it lands with P2-T13.
 */
export const DndKit = [
  DndPlugin.configure({
    options: {
      enableScroller: true,
    },
    render: {
      aboveNodes: BlockDraggable,
      aboveSlate: ({ children }) => <DndProvider backend={HTML5Backend}>{children}</DndProvider>,
    },
  }),
];
