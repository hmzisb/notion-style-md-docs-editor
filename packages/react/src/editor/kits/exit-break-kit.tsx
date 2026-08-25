'use client';

import { ExitBreakPlugin } from 'platejs';

/**
 * docs/07 section 2 spends `Cmd+Enter` on the to-do checkbox and the toggle, so the exit
 * break keeps only the key above it; `ShortcutsKit` falls back to an exit break on any block
 * that has neither of those (`insertExitBreak`), which is the same transform this registers.
 */
export const ExitBreakKit = [
  ExitBreakPlugin.configure({
    shortcuts: {
      insert: null,
      insertBefore: { keys: 'mod+shift+enter' },
    },
  }),
];
