'use client';

import { createPlatePlugin } from 'platejs/react';

import { useDocs } from '@/data/context.js';
import { FloatingToolbar } from '@/editor/ui/floating-toolbar';
import { FloatingToolbarButtons } from '@/editor/ui/floating-toolbar-buttons';

/** A toolbar names itself, whether it floats or sits above the editor (docs/06 section 13). */
function Bar(): React.JSX.Element {
  const { strings } = useDocs();
  return (
    <FloatingToolbar aria-label={strings['editor.toolbar.label']}>
      <FloatingToolbarButtons />
    </FloatingToolbar>
  );
}

export const FloatingToolbarKit = [
  createPlatePlugin({
    key: 'floating-toolbar',
    render: { afterEditable: () => <Bar /> },
  }),
];
