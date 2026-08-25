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

/** docs/06 section 8: `size-7` icon buttons, against the `h-9 p-1` bar. */
const MARK = 'size-7 min-w-7 p-0';

export function FloatingToolbarButtons(): React.JSX.Element | null {
  const readOnly = useEditorReadOnly();
  const { strings } = useDocs();

  if (readOnly) return null;

  return (
    <>
      <ToolbarGroup>
        <TurnIntoToolbarButton />
      </ToolbarGroup>

      <ToolbarGroup>
        <MarkToolbarButton
          nodeType={KEYS.bold}
          tooltip={strings['editor.toolbar.bold']}
          className={MARK}
        >
          <BoldIcon />
        </MarkToolbarButton>

        <MarkToolbarButton
          nodeType={KEYS.italic}
          tooltip={strings['editor.toolbar.italic']}
          className={MARK}
        >
          <ItalicIcon />
        </MarkToolbarButton>

        <MarkToolbarButton
          nodeType={KEYS.strikethrough}
          tooltip={strings['editor.toolbar.strikethrough']}
          className={MARK}
        >
          <StrikethroughIcon />
        </MarkToolbarButton>

        <MarkToolbarButton
          nodeType={KEYS.code}
          tooltip={strings['editor.toolbar.code']}
          className={MARK}
        >
          <Code2Icon />
        </MarkToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup>
        <LinkToolbarButton className={MARK} />
      </ToolbarGroup>
    </>
  );
}
