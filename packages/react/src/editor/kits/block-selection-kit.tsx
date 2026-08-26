'use client';

import { BlockSelectionPlugin } from '@platejs/selection/react';
import { createSlatePlugin, getPluginTypes, KEYS, RangeApi } from 'platejs';

import { BlockSelection } from '@/editor/ui/block-selection';

export const hasSelectableClass = ({
  attributes,
  className,
}: {
  attributes: { className?: string };
  className?: string;
}) => [className, attributes.className].filter(Boolean).join(' ').includes('slate-selectable');

/**
 * docs/07 section 2: `Cmd+A` selects the block's text, and every block on the second press.
 * Plate's own override asks `isAt({ block: true, end: true, start: true })`, and `isAt` answers
 * on `block` alone for a range - true for a bare caret - so the first press would already take
 * every block. Everything else is left to it: this only holds the first press back.
 */
const SelectAllPlugin = createSlatePlugin({ key: 'docsSelectAll' }).overrideEditor(
  ({ editor, tf: { selectAll } }) => ({
    transforms: {
      selectAll() {
        const entry = editor.api.block({ highest: true });
        if (!entry || !editor.selection || !editor.api.isAt({ block: true })) return selectAll();
        const [, path] = entry;
        const [start, end] = RangeApi.edges(editor.selection);
        if (editor.api.isStart(start, path) && editor.api.isEnd(end, path)) return selectAll();
        editor.tf.select(path);
        return true;
      },
    },
  }),
);

export const BlockSelectionKit = [
  BlockSelectionPlugin.configure(({ editor }) => ({
    options: {
      enableContextMenu: true,
      isSelectable: (element) =>
        !getPluginTypes(editor, [KEYS.column, KEYS.codeLine, KEYS.td]).includes(element.type),
    },
    render: {
      belowRootNodes: (props) => {
        if (!hasSelectableClass(props)) return null;

        return <BlockSelection {...(props as React.ComponentProps<typeof BlockSelection>)} />;
      },
    },
  })),
  SelectAllPlugin,
];
