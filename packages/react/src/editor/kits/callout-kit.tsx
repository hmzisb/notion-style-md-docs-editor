'use client';

import { CALLOUT_ICONS, isCalloutVariant } from '@docs/core';
import { CalloutPlugin } from '@platejs/callout/react';
import { createBlockStartInputRule, createSlatePlugin, KEYS } from 'platejs';

import { CalloutElement } from '@/editor/ui/callout-node';

/**
 * docs/05 section 5: the block is written `> [!NOTE]`, so the marker is what turns a
 * paragraph into one - the same shape as `#` for a heading and `>` for a quote, minus the
 * quote the callout replaces.
 */
const MARKER = /^\[!(note|tip|important|warning|caution)]$/i;

const CalloutAutoformatPlugin = createSlatePlugin({
  key: 'calloutAutoformat',
  inputRules: [
    createBlockStartInputRule<{ variant: keyof typeof CALLOUT_ICONS }>({
      trigger: ' ',
      match: MARKER,
      enabled: ({ editor }) =>
        !editor.api.some({ match: { type: editor.getType(KEYS.codeBlock) } }),
      resolveMatch: ({ match }) => {
        const variant = typeof match === 'string' ? undefined : match[1]?.toLowerCase();
        return isCalloutVariant(variant) ? { variant } : undefined;
      },
      apply: ({ editor }, { range, variant }) => {
        editor.tf.delete({ at: range });
        editor.tf.setNodes(
          { type: editor.getType(KEYS.callout), variant, icon: CALLOUT_ICONS[variant] },
          { match: (node) => editor.api.isBlock(node) },
        );
        return true;
      },
    }),
  ],
});

export const CalloutKit = [CalloutPlugin.withComponent(CalloutElement), CalloutAutoformatPlugin];
