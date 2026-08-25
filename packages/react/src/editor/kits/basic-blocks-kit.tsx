'use client';

import { BlockquoteRules, HeadingRules, HorizontalRuleRules } from '@platejs/basic-nodes';
import {
  BlockquotePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  HorizontalRulePlugin,
} from '@platejs/basic-nodes/react';
import { ParagraphPlugin } from 'platejs/react';

import { BlockquoteElement } from '@/editor/ui/blockquote-node';
import { H1Element, H2Element, H3Element } from '@/editor/ui/heading-node';
import { HrElement } from '@/editor/ui/hr-node';
import { ParagraphElement } from '@/editor/ui/paragraph-node';

/**
 * The registry item, trimmed to the block set of docs/05 section 2: H4-H6 have no plugin
 * here because the codec clamps them to H3, so the editor could never produce one.
 */
export const BasicBlocksKit = [
  ParagraphPlugin.withComponent(ParagraphElement),
  H1Plugin.configure({
    inputRules: [HeadingRules.markdown()],
    node: {
      component: H1Element,
    },
    rules: {
      break: { empty: 'reset' },
    },
    shortcuts: { toggle: { keys: 'mod+alt+1' } },
  }),
  H2Plugin.configure({
    inputRules: [HeadingRules.markdown()],
    node: {
      component: H2Element,
    },
    rules: {
      break: { empty: 'reset' },
    },
    shortcuts: { toggle: { keys: 'mod+alt+2' } },
  }),
  H3Plugin.configure({
    inputRules: [HeadingRules.markdown()],
    node: {
      component: H3Element,
    },
    rules: {
      break: { empty: 'reset' },
    },
    shortcuts: { toggle: { keys: 'mod+alt+3' } },
  }),
  BlockquotePlugin.configure({
    inputRules: [BlockquoteRules.markdown()],
    node: { component: BlockquoteElement },
    shortcuts: { toggle: { keys: 'mod+shift+period' } },
  }),
  HorizontalRulePlugin.configure({
    inputRules: [
      HorizontalRuleRules.markdown({ variant: '-' }),
      HorizontalRuleRules.markdown({ variant: '_' }),
    ],
    node: {
      component: HrElement,
    },
  }),
];
