'use client';

import {
  BoldRules,
  CodeRules,
  ItalicRules,
  MarkComboRules,
  StrikethroughRules,
} from '@platejs/basic-nodes';
import {
  BoldPlugin,
  CodePlugin,
  ItalicPlugin,
  StrikethroughPlugin,
} from '@platejs/basic-nodes/react';

import { CodeLeaf } from '@/editor/ui/code-node';

/**
 * Bold, italic, strikethrough and inline code: the four marks with a GFM form (docs/05
 * section 2). Underline, highlight, kbd, sub and superscript are dropped for the reason
 * DEV-004 gives - they serialize to MDX JSX, which non-MDX stringify cannot write.
 */
export const BasicMarksKit = [
  BoldPlugin.configure({
    inputRules: [
      BoldRules.markdown({ variant: '*' }),
      BoldRules.markdown({ variant: '_' }),
      MarkComboRules.markdown({ variant: 'boldItalic' }),
    ],
  }),
  ItalicPlugin.configure({
    inputRules: [ItalicRules.markdown({ variant: '*' }), ItalicRules.markdown({ variant: '_' })],
  }),
  CodePlugin.configure({
    inputRules: [CodeRules.markdown()],
    node: { component: CodeLeaf },
    shortcuts: { toggle: { keys: 'mod+e' } },
  }),
  StrikethroughPlugin.configure({
    inputRules: [StrikethroughRules.markdown()],
    shortcuts: { toggle: { keys: 'mod+shift+x' } },
  }),
];
