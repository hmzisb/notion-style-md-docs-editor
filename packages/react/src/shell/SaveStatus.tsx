import type { NodeId } from '@hmzisb/notion-docs-core';
import { CircleAlert, CircleDot, CloudOff, History, Loader2, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useDocs } from '@/data/context.js';
import { flushSession } from '@/data/session.js';
import { useSessionState } from '@/data/session-store.js';
import { format } from '@/data/strings.js';
import { relativeTime } from '@/lib/relative-time.js';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/tooltip';

/** docs/06 section 9: a save that lands inside this window never shows a spinner. */
const SAVING_DELAY = 800;

export interface SaveStatusProps {
  pageId: NodeId | null;
  className?: string;
}

/**
 * docs/06 section 9. Quiet by default: clean, a dirty page with its save timer running, and
 * the moment after a save render nothing at all. What is left is the states the user has to
 * know about, and each of them offers the way out (docs/07 section 8).
 */
export function SaveStatus({ pageId, className }: SaveStatusProps): React.JSX.Element | null {
  const { ns, strings } = useDocs();
  const state = useSessionState(ns, pageId);
  const status = state?.status ?? 'clean';
  const ref = useRef<HTMLButtonElement>(null);

  // A save under 800 ms is not worth a spinner; one over it has to say why the page is busy.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (status !== 'saving') {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => {
      setSlow(true);
    }, SAVING_DELAY);
    return () => {
      clearTimeout(timer);
    };
  }, [status]);

  if (state === null || pageId === null) return null;

  const save = (): void => {
    flushSession(ns, pageId);
  };
  /** The banner is the answer to both of these; the pill only has to get the reader there. */
  const scrollTo = (kind: 'conflict' | 'draft') => () => {
    const root: ParentNode = ref.current?.closest('.docs-root') ?? document;
    root
      .querySelector(`[data-docs-banner="${kind}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const pill = ((): {
    label: string;
    icon: ComponentType<{ className?: string }>;
    tone?: string;
    onClick?: () => void;
  } | null => {
    switch (status) {
      case 'saving':
        return slow
          ? { label: strings['status.saving'], icon: Loader2, tone: 'animate-spin' }
          : null;
      case 'dirty':
        // With a timer running the save is seconds away and saying so is noise; paused means
        // it is not coming until someone asks for it.
        return state.pending
          ? null
          : { label: strings['status.unsaved'], icon: CircleDot, onClick: save };
      case 'offline':
        return { label: strings['status.offline'], icon: CloudOff, onClick: save };
      case 'conflict':
        return {
          label: strings['status.conflict'],
          icon: TriangleAlert,
          tone: 'text-amber-600',
          onClick: scrollTo('conflict'),
        };
      case 'draft':
        return { label: strings['status.draft'], icon: History, onClick: scrollTo('draft') };
      case 'error':
        return {
          label: strings['status.error'],
          icon: CircleAlert,
          tone: 'text-destructive',
          onClick: save,
        };
      default:
        return null;
    }
  })();

  if (pill === null) return null;
  const Icon = pill.icon;

  const tip =
    status === 'offline' && state.retryAt !== null
      ? format(strings['status.offlineTooltip'], { time: relativeTime(state.retryAt) })
      : state.lastSavedAt === null
        ? null
        : format(strings['header.savedAt'], { time: relativeTime(state.lastSavedAt) });

  const shape = cn(
    'flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground',
    className,
  );
  const face = (
    <>
      <Icon className={cn('size-3.5 shrink-0', pill.tone)} aria-hidden="true" />
      <span className="truncate">{pill.label}</span>
    </>
  );

  // Saving is the one state with nothing to do about it, so it is text rather than a control.
  if (pill.onClick === undefined) return <span className={shape}>{face}</span>;

  const body = (
    <button
      ref={ref}
      type="button"
      onClick={pill.onClick}
      className={cn(
        shape,
        'hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
      )}
    >
      {face}
    </button>
  );

  if (tip === null) return body;
  // Its own provider: docs/08 section 2 lets a host render this without the rest of the shell.
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{body}</TooltipTrigger>
        <TooltipContent side="bottom">{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
