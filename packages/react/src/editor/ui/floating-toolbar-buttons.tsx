'use client';

import { BoldIcon, Code2Icon, ItalicIcon, StrikethroughIcon } from 'lucide-react';
import { KEYS } from 'platejs';
import { useEditorReadOnly } from 'platejs/react';
import { useDocs } from '@/data/context.js';
import { LinkToolbarButton } from './link-toolbar-button';
import { MarkToolbarButton } from './mark-toolbar-button';
import { ToolbarGroup } from './toolbar';
import { TurnIntoToolbarButton } from './turn-into-toolbar-button';

/**
 * docs/06 section 8: turn-into, the four marks the block set ships, and the link button. The
 * registry item also offers AI, comments, suggestions, equations and underline; none of those
 * plugins are installed (docs/05 section 2), so none of their buttons are here.
 */
export function FloatingToolbarButtons(): React.JSX.Element | null {
  const readOnly = useEditorReadOnly();
  const { strings } = useDocs();

  if (readOnly) return null;

  return (
    <ToolbarGroup>
      <TurnIntoToolbarButton />

      <MarkToolbarButton nodeType={KEYS.bold} tooltip={strings['editor.toolbar.bold']}>
        <BoldIcon />
      </MarkToolbarButton>

      <MarkToolbarButton nodeType={KEYS.italic} tooltip={strings['editor.toolbar.italic']}>
        <ItalicIcon />
      </MarkToolbarButton>

      <MarkToolbarButton
        nodeType={KEYS.strikethrough}
        tooltip={strings['editor.toolbar.strikethrough']}
      >
        <StrikethroughIcon />
      </MarkToolbarButton>

      <MarkToolbarButton nodeType={KEYS.code} tooltip={strings['editor.toolbar.code']}>
        <Code2Icon />
      </MarkToolbarButton>

      <LinkToolbarButton />
    </ToolbarGroup>
  );
}
