'use client';

import type { NodeId, TreeNode } from '@docs/core';
import type { Value } from 'platejs';
import { Plate, usePlateEditor, type PlateEditor } from 'platejs/react';
import { useEffect, useMemo, useRef } from 'react';
import { useDocs } from '@/data/context.js';
import { canvasKey } from '@/data/fresh.js';
import { useTreeIndex } from '@/data/queries.js';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/ui/tooltip';
import { EditorContext, type EditorContextValue } from './context.js';
import { createEditorKit } from './kits/editor-kit.js';
import { UploadPlugin } from './kits/upload-kit.js';
import { Editor, EditorContainer } from './ui/editor';
import { FloatingToolbarButtons } from './ui/floating-toolbar-buttons';
import { Toolbar } from './ui/toolbar';

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
  /** The subtree the host shows, so a link resolves against what the reader can reach. */
  rootId?: NodeId;
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
  rootId,
  toolbar = 'floating',
  autoFocus = false,
  className,
}: DocumentEditorProps): React.JSX.Element {
  const { capabilities, ns, provider, strings } = useDocs();

  const plugins = useMemo(() => createEditorKit({ strings, toolbar }), [strings, toolbar]);
  // The same index the read view resolves links against, so an internal link is drawn the
  // same in both modes and the swap does not reflow the line (docs/06 section 7, docs/05 s.8).
  const { data: index } = useTreeIndex(rootId);
  const context = useMemo<EditorContextValue>(
    () => ({ node: page, idByPath: index?.idByPath ?? {}, rootId }),
    [page, index, rootId],
  );

  // `value` is initial-only, so the editor must not be rebuilt when it changes: `initial`
  // carries the value of the render that builds one.
  const initial = useRef(value);
  initial.current = value;

  // A page created in this session keeps the id it was created under as the editor's identity,
  // so the provider's id landing a moment later swaps the data without rebuilding the editor
  // the user is already typing in (docs/04 section 4).
  const identity = canvasKey(ns, pageId);
  const editor = usePlateEditor(
    {
      autoSelect: autoFocus === true ? 'start' : false,
      // A chunk is what re-renders when a block inside it changes, and what the browser skips
      // painting while it is off screen. Smaller chunks type faster on a long page - 28.8 ms
      // p95 a keystroke at 100 against 34.1 at 1,000, on 3,000 blocks - and they cost the
      // scroll offset: Plate's chunk carries no `contain-intrinsic-size`, so a chunk below the
      // fold is zero high until it is painted, the document is shorter than it will be, and a
      // reader who clicks into the text 400 px down lands somewhere else (DEV-031).
      chunking: { chunkSize: 1000, contentVisibilityAuto: true },
      plugins,
      value: () => initial.current,
    },
    [identity, plugins],
  );

  const ready = onReady;
  useEffect(() => {
    ready?.(editor);
  }, [editor, ready]);

  // `@platejs/selection` portals an off-screen input to the body to carry copy, cut and paste
  // while whole blocks are selected. It ships without a name and inside the tab order, which is
  // an unlabelled field a keyboard can land in (docs/10 section 2, DEV-020).
  const clipboardLabel = strings['editor.blockClipboard'];
  useEffect(() => {
    const name = (): void => {
      const input = document.querySelector('.slate-shadow-input');
      if (input === null) return;
      input.setAttribute('aria-label', clipboardLabel);
      input.setAttribute('tabindex', '-1');
    };
    // It mounts a tick after the editor does, so once now and once after that tick.
    name();
    const timer = setTimeout(name);
    return () => {
      clearTimeout(timer);
    };
  }, [clipboardLabel, editor]);

  // docs/05 section 6: paste and drop upload only where the backend takes uploads, and the
  // page they belong to is this editor's. Set rather than baked into the plugin, because
  // `getMeta` can turn the capability on after the editor is built (docs/03 section 10).
  const upload = useMemo(
    () => (capabilities.upload ? provider.uploadAsset?.bind(provider) : undefined),
    [capabilities.upload, provider],
  );
  useEffect(() => {
    editor.setOption(
      UploadPlugin,
      'upload',
      upload === undefined ? null : (file: File) => upload(pageId, file),
    );
  }, [editor, pageId, upload]);

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
          {/* docs/06 section 8 designs one toolbar; `'fixed'` is the same buttons, parked at
              the top of the editor for a host that wants them always visible (docs/08 s.5). */}
          {toolbar === 'fixed' && (
            <Toolbar
              aria-label={strings['editor.toolbar.label']}
              className="sticky top-0 z-10 h-9 gap-0.5 rounded-lg border border-border bg-popover p-1 text-popover-foreground"
            >
              <FloatingToolbarButtons />
            </Toolbar>
          )}
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
            {/* The gutter controls hang in the page's left margin (docs/06 section 7), which
                is outside this box: Plate's own editor clips there, and it can afford to
                because its text carries the padding they sit in. Ours does not. */}
            <Editor
              // The editable is a `textbox` to the accessibility tree, and a textbox needs a
              // name of its own - the page title is a different field (docs/10 section 2).
              aria-label={strings['editor.body']}
              variant="none"
              className="overflow-x-visible px-0 pb-0 text-base leading-[1.65]"
            />
          </EditorContainer>
        </Plate>
      </TooltipProvider>
    </EditorContext.Provider>
  );
}
