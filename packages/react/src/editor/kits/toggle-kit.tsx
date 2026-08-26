'use client';

import { buildToggleIndex, TogglePlugin } from '@platejs/toggle/react';
import { createSlatePlugin } from 'platejs';

import { IndentKit } from '@/editor/kits/indent-kit';
import { ToggleElement } from '@/editor/ui/toggle-node';

/**
 * docs/07 section 2: `Tab` indents the block, which is what moves it into the toggle above it
 * (docs/05 section 5). A closed toggle hides what it holds, so the block the writer just moved
 * in - and the caret with it - would go invisible; opening the toggle instead is what Plate's
 * own turn-into button does for the same reason.
 */
const OpenOnIndentPlugin = createSlatePlugin({ key: 'docsToggleOpen' }).overrideEditor(
  ({ editor, tf: { tab } }) => ({
    transforms: {
      tab(options) {
        const result = tab(options);
        const block = editor.api.block();
        if (block === undefined) return result;
        // The plugin keeps its index in a render effect, so after a transform it is a step
        // behind: the enclosing toggles are read off the children the transform just left.
        const enclosing = buildToggleIndex(editor.children).get(block[0].id as string) ?? [];
        if (enclosing.length > 0) editor.getApi(TogglePlugin).toggle.toggleIds(enclosing, true);
        return result;
      },
    },
  }),
);

export const ToggleKit = [
  ...IndentKit,
  TogglePlugin.withComponent(ToggleElement),
  OpenOnIndentPlugin,
];
