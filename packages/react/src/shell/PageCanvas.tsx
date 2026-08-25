import type { NodeId, PageDocument, PageMode, TreeNode } from '@docs/core';
import { TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDocs } from '@/data/context.js';
import { useDocumentSession } from '@/data/session.js';
import { preloadEditor, useEditorChunk } from '@/editor-chunk.js';
import type { PlateEditor } from '@/editor/index.js';
import { useHotkeys, type Hotkey } from '@/lib/hotkeys';
import { IconGlyph } from '@/tree/IconGlyph.js';
import { DocumentView } from '@/view/DocumentView.js';
import { EmptyState } from './EmptyState.js';

/** Where a click must not start editing (docs/07 section 7): links and every control. */
const NOT_TEXT = 'a, button, summary, input, [role="button"], [role="checkbox"]';

/** A click that moved this far is a drag, not a caret placement (docs/07 section 7). */
const DRAG_THRESHOLD = 4;
/** The overlay `BlockSelection` draws over a block Plate has selected, and only then. */
const BLOCK_SELECTED = '[data-slot="block-selection"]';

type PendingFocus = { type: 'start' } | { type: 'point'; x: number; y: number };

export interface PageCanvasProps {
  page: PageDocument;
  node: TreeNode;
  rootId?: NodeId;
  mode: PageMode;
  /** The content region: the scroll container and what `E` and `Enter` are scoped to. */
  regionRef: React.RefObject<HTMLElement | null>;
  toolbar?: 'floating' | 'fixed' | 'none';
  onModeChange: (mode: PageMode) => void;
}

/**
 * docs/06 sections 4 and 7: the title block, then the page itself. docs/05 section 8: the read
 * view swaps to `<Plate>` inside this same scroll container, at the same offset, and stays
 * there for the rest of the page session so a second click into edit is instant.
 */
export function PageCanvas({
  page,
  node,
  rootId,
  mode,
  regionRef,
  toolbar,
  onModeChange,
}: PageCanvasProps): React.JSX.Element {
  const { capabilities, strings } = useDocs();
  const chunk = useEditorChunk();
  const session = useDocumentSession(page);
  const [swapped, setSwapped] = useState(false);

  const editorRef = useRef<PlateEditor | null>(null);
  const pending = useRef<PendingFocus | null>(null);
  const offset = useRef<number | null>(null);
  const pointerDown = useRef<{ x: number; y: number } | null>(null);

  const editable = capabilities.write;
  const wants = editable && (mode === 'edit' || swapped);
  const showEditor = wants && chunk !== null;

  useEffect(() => {
    if (wants) void preloadEditor();
  }, [wants]);

  useEffect(() => {
    if (showEditor) setSwapped(true);
  }, [showEditor]);

  // The swap replaces the page's DOM in one commit; a shorter first paint would otherwise clamp
  // the container's scroll to the new height and drop the reader somewhere else.
  useLayoutEffect(() => {
    if (!showEditor || offset.current === null) return;
    const region = regionRef.current;
    if (region !== null) region.scrollTop = offset.current;
    offset.current = null;
  }, [showEditor, regionRef]);

  const applyFocus = useCallback(() => {
    const editor = editorRef.current;
    const focus = pending.current;
    if (editor === null || focus === null) return;
    pending.current = null;
    if (focus.type === 'point') focusAtPoint(editor, focus.x, focus.y);
    else editor.tf.focus({ edge: 'startEditor' });
  }, []);

  // Both entries into edit mode land here: the first one when the chunk swaps in, every later
  // one when only `mode` changes, because the editor is already mounted by then.
  useEffect(() => {
    if (mode === 'edit' && showEditor) applyFocus();
  }, [mode, showEditor, applyFocus]);

  const requestEdit = useCallback(
    (focus: PendingFocus) => {
      pending.current = focus;
      offset.current = regionRef.current?.scrollTop ?? null;
      if (mode === 'edit') applyFocus();
      else onModeChange('edit');
    },
    [applyFocus, mode, onModeChange, regionRef],
  );

  const bind = session.bind;
  const onReady = useCallback(
    (editor: PlateEditor) => {
      editorRef.current = editor;
      bind(editor);
      applyFocus();
    },
    [applyFocus, bind],
  );

  // docs/04 section 3.1: leaving the editor flushes. Focus that stays inside the canvas - a
  // toolbar button, the title - is still editing, so only a blur that leaves counts.
  const flush = session.flush;
  const onBlur = (event: React.FocusEvent<HTMLElement>): void => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    void flush();
  };

  useHotkeys(
    editable && mode === 'read'
      ? ([
          // docs/07 section 7: `E` anywhere in the region, `Enter` only on the region itself.
          {
            keys: 'E',
            scopes: ['content'],
            run: () => {
              requestEdit({ type: 'start' });
            },
          },
          {
            keys: 'Enter',
            scopes: ['content'],
            run: () => {
              if (document.activeElement === regionRef.current) requestEdit({ type: 'start' });
            },
          },
        ] satisfies Hotkey[])
      : [],
    regionRef,
  );

  const onPointerUp = (event: React.PointerEvent): void => {
    const start = pointerDown.current;
    pointerDown.current = null;
    if (!editable || mode === 'edit' || start === null) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) >= DRAG_THRESHOLD) return;
    // A selection the reader made with the pointer is a copy, not a request to edit.
    const selection = window.getSelection();
    if (selection !== null && !selection.isCollapsed) return;
    if (event.target instanceof Element && event.target.closest(NOT_TEXT) !== null) return;
    requestEdit({ type: 'point', x: event.clientX, y: event.clientY });
  };

  // docs/07 section 7: the first `Escape` collapses the caret to a block selection - Plate's
  // own - and the second one leaves edit mode. Plate would spend that second press clearing
  // the selection, so it is taken here, while the overlay it draws is still up.
  const onKeyDownCapture = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Escape' || mode !== 'edit') return;
    if (event.currentTarget.querySelector(BLOCK_SELECTED) === null) return;
    event.preventDefault();
    event.stopPropagation();
    onModeChange('read');
  };

  return (
    <article
      className="mx-auto w-full max-w-[calc(var(--docs-content-width)+8rem)] px-4 pt-20 pb-[40vh] md:px-16 md:pt-[88px]"
      onPointerDown={(event) => {
        pointerDown.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={onPointerUp}
      onKeyDownCapture={onKeyDownCapture}
      onBlur={onBlur}
    >
      {node.icon !== undefined && (
        <div className="pb-2">
          <IconGlyph
            icon={node.icon}
            kind={node.kind}
            className="size-9 text-[36px] leading-none"
          />
        </div>
      )}
      <h1 className="text-[32px] leading-tight font-bold md:text-[40px]">
        {page.meta.title ?? node.title}
      </h1>
      {showEditor ? (
        <chunk.EditorErrorBoundary
          resetKey={page.id}
          fallback={(_error, retry) => (
            <EmptyState
              icon={TriangleAlert}
              title={strings['empty.editorCrash.title']}
              body={strings['empty.editorCrash.body']}
              action={{ label: strings['empty.editorCrash.action'], onClick: retry }}
              secondaryAction={{
                label: strings['empty.editorCrash.secondary'],
                onClick: () => {
                  setSwapped(false);
                  onModeChange('read');
                },
              }}
            />
          )}
        >
          <chunk.DocumentEditor
            pageId={page.id}
            page={node}
            value={session.value}
            readOnly={mode === 'read'}
            toolbar={toolbar}
            onReady={onReady}
            onChange={session.onChange}
            className="pt-4"
          />
        </chunk.EditorErrorBoundary>
      ) : (
        <DocumentView page={page} node={node} rootId={rootId} className="pt-4" />
      )}
    </article>
  );
}

/**
 * docs/07 section 7: a click into read mode puts the caret where the reader clicked. The
 * coordinates outlive the click, so they still resolve once the editor has swapped in.
 *
 * Focus first, select second: focusing an editable that holds no DOM selection parks the
 * browser caret at its start, and Slate then adopts that as the selection - which is why
 * `focus({ at })`, whose order is the other way round, loses the point. A click that resolves
 * to nothing (the margin, or a browser without the API) focuses where the editor already is
 * rather than dragging the reader to the top.
 */
function focusAtPoint(editor: PlateEditor, x: number, y: number): void {
  const range = caretRangeAt(x, y);
  const at =
    range === null
      ? null
      : (editor.api.toSlateRange(range, { exactMatch: false, suppressThrow: true }) ?? null);
  editor.tf.focus();
  if (at !== null) editor.tf.select(at);
}

/** Every evergreen browser has this; jsdom has not, which is why it is checked at runtime. */
function caretRangeAt(x: number, y: number): Range | null {
  if (typeof document.caretPositionFromPoint !== 'function') return null;
  const position = document.caretPositionFromPoint(x, y);
  if (position === null) return null;
  const range = document.createRange();
  range.setStart(position.offsetNode, position.offset);
  range.collapse(true);
  return range;
}
