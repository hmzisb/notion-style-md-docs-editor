'use client';

import type { NodeId, TreeNode } from '@docs/core';
import type { Value } from 'platejs';
import { Plate, usePlateEditor, type PlateEditor } from 'platejs/react';
import { useEffect, useMemo, useRef } from 'react';
import { useDocs } from '@/data/context.js';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/ui/tooltip';
import { EditorContext, type EditorContextValue } from './context.js';
import { createEditorKit } from './kits/editor-kit.js';
import { Editor, EditorContainer } from './ui/editor';

export interface DocumentEditorProps {
  pageId: NodeId;
  /**
   * The initial value only, which is Plate's own semantics. Every later reset - conflict
   * Reload, a silent refresh while clean, discarding a draft - goes through the editor handed
   * to {@link DocumentEditorProps.onReady} (docs/08 section 5, review log B5).
   */
  value: Value;
  readOnly: boolean;
  onChange: (value: Value) => void;
  /** Hands the session the editor instance, once per page (docs/08 section 5). */
  onReady?: (editor: PlateEditor) => void;
  /** Read mode: a click or `Enter` in the content asks the host to switch to edit mode. */
  onRequestEdit?: () => void;
  /** The page's tree node: the base its relative links and images resolve against. */
  page: TreeNode;
  toolbar?: 'floating' | 'fixed' | 'none';
  autoFocus?: boolean | 'title-next';
  className?: string;
}

/**
 * docs/05 section 6. One editor per page: `pageId` is the identity, so history never undoes
 * into the page before it, while `readOnly` flips on the editor already mounted - no remount,
 * no re-parse, no scroll jump when the reader clicks into the text (docs/05 section 8).
 *
 * Chunking is Plate's own: blocks render in chunks with `content-visibility: auto`, which is
 * what keeps the first paint of a long page cheap.
 */
export function DocumentEditor({
  pageId,
  value,
  readOnly,
  onChange,
  onReady,
  onRequestEdit,
  page,
  toolbar = 'floating',
  autoFocus = false,
  className,
}: DocumentEditorProps): React.JSX.Element {
  const { strings } = useDocs();

  const plugins = useMemo(() => createEditorKit({ strings, toolbar }), [strings, toolbar]);
  const context = useMemo<EditorContextValue>(() => ({ node: page }), [page]);

  // `value` is initial-only, so the editor must not be rebuilt when it changes: `initial`
  // carries the value of the render that builds one.
  const initial = useRef(value);
  initial.current = value;

  const editor = usePlateEditor(
    {
      autoSelect: autoFocus === true ? 'start' : false,
      chunking: { chunkSize: 1000, contentVisibilityAuto: true },
      plugins,
      value: () => initial.current,
    },
    [pageId, plugins],
  );

  const ready = onReady;
  useEffect(() => {
    ready?.(editor);
  }, [editor, ready]);

  // docs/05 section 6: a click inside the text is one of the ways into edit mode. The region
  // wrapper and its `Enter` are the shell's (docs/07 section 2); this is the click half.
  const enter = onRequestEdit;

  return (
    <EditorContext.Provider value={context}>
      {/* Every toolbar button in the canvas has a tooltip; standalone hosts have no provider. */}
      <TooltipProvider>
        <Plate
          editor={editor}
          readOnly={readOnly}
          onChange={({ value: next }) => {
            onChange(next);
          }}
        >
          <EditorContainer
            className={cn('h-auto overflow-visible', className)}
            onClick={
              readOnly && enter !== undefined
                ? () => {
                    enter();
                  }
                : undefined
            }
          >
            {/* The canvas column and its padding belong to the host page (docs/06 section 4);
                the body type is docs/06 section 3, set here as `DocumentView` sets it, so the
                swap between the two does not reflow a line (docs/05 section 8). */}
            <Editor variant="none" className="px-0 pb-0 text-base leading-[1.65]" />
          </EditorContainer>
        </Plate>
      </TooltipProvider>
    </EditorContext.Provider>
  );
}
