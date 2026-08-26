import type { NodeId, PageMode } from '@docs/core';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useDocs } from '@/data/context.js';
import { isFresh, isTempId } from '@/data/fresh.js';
import { useUpdateMeta } from '@/data/mutations.js';
import { useStructuralGate } from '@/data/online.js';
import { format } from '@/data/strings.js';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/tooltip';

/** docs/06 section 7: the title is one size below 768 px and the full one above it. */
const TITLE = 'text-[32px] leading-tight font-bold md:text-[40px]';

/** docs/07 section 5: the tree row follows the title this long after the typing stops. */
const COMMIT_DELAY = 600;

export interface PageTitleProps {
  pageId: NodeId;
  /** The page's own title, which is the tree row's title until the page says otherwise. */
  title: string;
  rootId?: NodeId;
  mode: PageMode;
  /** A read-only host renders the title as text: there is nothing to commit. */
  editable: boolean;
  onModeChange: (mode: PageMode) => void;
  /** `Enter`, and `ArrowDown` from the last line: the caret belongs in the body from here. */
  onGoToContent: () => void;
}

/**
 * docs/06 section 7 and docs/07 section 5. The textarea holds the title while it is being
 * typed and `updateMeta` takes it from there, debounced, so the sidebar row follows along
 * without a write per keystroke. Every path out - blur, unmount, `Enter` - flushes first.
 */
export function PageTitle({
  pageId,
  title,
  rootId,
  mode,
  editable,
  onModeChange,
  onGoToContent,
}: PageTitleProps): React.JSX.Element {
  const { ns, strings } = useDocs();
  const update = useUpdateMeta(rootId);
  // A rename is structural (D-05): offline the field still reads and scrolls, it just cannot
  // be typed into. `readOnly` rather than `disabled`, so the text stays selectable.
  const { offline, reason } = useStructuralGate();
  const [value, setValue] = useState(title);
  const field = useRef<HTMLTextAreaElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The last title the provider was asked for, so a flush after a commit is a no-op. */
  const sent = useRef(title);
  // A click in read mode both switches the mode and asks for the caret, and the textarea it
  // asks for does not exist until the mode has changed. A page created a moment ago asks for it
  // without a click: it opens in edit mode with the title focused (docs/01 section 5.3).
  const wanted = useRef(isFresh(ns, pageId));
  /** The latest `commit`: a page can close, or gain its real id, between a timer and its shot. */
  const latest = useRef<(next: string) => void>(() => undefined);
  /** A title typed before the provider answered, waiting for the id to send it under. */
  const deferred = useRef<string | null>(null);

  const commit = useCallback(
    (next: string) => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      if (next === sent.current) return;
      // docs/01 section 5.3: the page is open before the provider has given it an id. A title
      // typed in that moment is held until the real one lands rather than naming a page that
      // has none; the effect below is what sends it.
      if (isTempId(pageId)) {
        deferred.current = next;
        return;
      }
      sent.current = next;
      update.mutate(
        // docs/03 section 4.7: the first title on a page created here renames `untitled*.md`.
        { id: pageId, patch: { title: next }, renameFile: isFresh(ns, pageId) },
        {
          onError: () => {
            // The patch was rolled back, so this title was not written after all: leaving it as
            // sent would make retyping the same one a no-op.
            sent.current = title;
            toast(format(strings['error.rename'], { title }));
          },
        },
      );
    },
    [ns, pageId, strings, title, update],
  );

  // Whatever is pending when the page closes is still the user's title.
  latest.current = commit;

  // The provider's id arrived: the title that was waiting for it goes now (docs/04 section 4).
  useEffect(() => {
    const held = deferred.current;
    if (held === null || isTempId(pageId)) return;
    deferred.current = null;
    commit(held);
  }, [commit, pageId]);
  const pending = useRef(value);
  pending.current = value;
  useEffect(
    () => () => {
      if (timer.current !== null) latest.current(pending.current);
    },
    [],
  );

  useLayoutEffect(() => {
    const element = field.current;
    if (element === null) return;
    // An auto-growing textarea has to be measured from nothing: `scrollHeight` never shrinks
    // on its own. `field-sizing` would do this in CSS, and does not exist in WebKit yet.
    element.style.height = 'auto';
    element.style.height = `${String(element.scrollHeight)}px`;
  }, [value, mode]);

  useEffect(() => {
    if (mode !== 'edit' || !wanted.current) return;
    wanted.current = false;
    const element = field.current;
    if (element === null) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, [mode]);

  if (!editable || mode === 'read') {
    return (
      <h1
        className={cn(TITLE, value === '' && 'text-muted-foreground/50')}
        // docs/06 section 7: on a host that can write, the title is a way into edit mode.
        onClick={() => {
          if (!editable) return;
          wanted.current = true;
          onModeChange('edit');
        }}
      >
        {value === '' ? strings['editor.titlePlaceholder'] : value}
      </h1>
    );
  }

  const input = (
    <textarea
      ref={field}
      aria-label={strings['editor.title']}
      readOnly={offline}
      // `block`, because a textarea is inline by default and the line box under it adds six
      // pixels the read-mode heading does not have - the page under the title would step down
      // on the way into edit mode (docs/05 section 8).
      className={cn(
        TITLE,
        'block w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none placeholder:text-muted-foreground/50',
      )}
      placeholder={strings['editor.titlePlaceholder']}
      rows={1}
      spellCheck={false}
      value={value}
      onChange={(event) => {
        const next = event.target.value.replace(/\n/g, '');
        setValue(next);
        if (timer.current !== null) clearTimeout(timer.current);
        // Through the ref: the page can have gained its real id between the keystroke and
        // this shot, and the title belongs to whichever id it has by then.
        timer.current = setTimeout(() => {
          latest.current(next);
        }, COMMIT_DELAY);
      }}
      onBlur={() => {
        commit(pending.current);
      }}
      onKeyDown={(event) => {
        const element = event.currentTarget;
        if (event.key === 'Enter') {
          event.preventDefault();
          commit(element.value);
          onGoToContent();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          element.blur();
          return;
        }
        // Only from the end: everywhere else `ArrowDown` is still moving through the title.
        if (event.key !== 'ArrowDown') return;
        if (element.selectionStart !== element.value.length) return;
        if (element.selectionEnd !== element.value.length) return;
        event.preventDefault();
        commit(element.value);
        onGoToContent();
      }}
    />
  );

  if (!offline) return input;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{input}</TooltipTrigger>
        {/* Centred on the field rather than over its start, where the icon button is. */}
        <TooltipContent>{reason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
