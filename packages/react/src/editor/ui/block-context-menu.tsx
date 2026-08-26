'use client';

import * as React from 'react';

import { BlockSelectionPlugin, copySelectedBlocks } from '@platejs/selection/react';
import { Copy, CopyPlus, Replace, Trash2 } from 'lucide-react';
import { useEditorReadOnly, useEditorRef } from 'platejs/react';

import { useDocs } from '@/data/context.js';
import { toast } from '@/lib/toast.js';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/ui/context-menu';
import { setBlockType } from '@/editor/transforms';

import { turnIntoItems } from './turn-into-toolbar-button';

/** Radix opens a context menu on a long press, which is how a phone selects text instead. */
const coarsePointer = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/**
 * docs/05 section 2: the right-click menu over a block - turn into, duplicate, copy, delete.
 * `BlockSelectionKit` is configured with `enableContextMenu`, so the press has already chosen
 * the blocks this acts on by the time the menu opens.
 */
export function BlockContextMenu({ children }: { children: React.ReactNode }): React.JSX.Element {
  const editor = useEditorRef();
  const { strings } = useDocs();
  const readOnly = useEditorReadOnly();
  const [touch] = React.useState(coarsePointer);

  // The read view renders the same editor (docs/05 section 1), where the browser's own menu is
  // what a reader wants: copy, search, translate. The trigger is what turns off, rather than
  // this wrapper, which would rebuild the editable on every mode change (docs/05 section 8).
  const off = readOnly || touch;

  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger
        asChild
        disabled={off}
        onContextMenu={(event) => {
          // The editable itself, and anything that keeps a menu of its own (an image, a code
          // block), are marked by Plate. `preventDefault` here is what holds Radix back.
          const dataset = (event.target as HTMLElement).dataset;
          if (dataset.slateEditor === 'true' || dataset.plateOpenContextMenu === 'false') {
            event.preventDefault();
          }
        }}
      >
        <div className="w-full">{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent
        className="w-56"
        aria-label={strings['editor.blockMenu.label']}
        onCloseAutoFocus={(event) => {
          // The blocks stay selected, so the keyboard goes back to them and not to a caret.
          event.preventDefault();
          editor.getApi(BlockSelectionPlugin).blockSelection.focus();
        }}
      >
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Replace aria-hidden="true" />
            {strings['editor.toolbar.turnInto']}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            {turnIntoItems.map(({ icon, name, value }) => (
              <ContextMenuItem
                key={value}
                onSelect={() => {
                  for (const [, path] of editor
                    .getApi(BlockSelectionPlugin)
                    .blockSelection.getNodes()) {
                    setBlockType(editor, value, { at: path });
                  }
                }}
              >
                {icon}
                {strings[name]}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem
          onSelect={() => {
            editor.getTransforms(BlockSelectionPlugin).blockSelection.duplicate();
          }}
        >
          <CopyPlus aria-hidden="true" />
          {strings['editor.blockMenu.duplicate']}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            const copied = copySelectedBlocks(editor);
            toast(copied ? strings['editor.blockMenu.copied'] : strings['error.copy']);
          }}
        >
          <Copy aria-hidden="true" />
          {strings['editor.blockMenu.copy']}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onSelect={() => {
            editor.getTransforms(BlockSelectionPlugin).blockSelection.removeNodes();
            editor.tf.focus();
          }}
        >
          <Trash2 aria-hidden="true" />
          {strings['editor.blockMenu.delete']}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
