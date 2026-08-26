import type { NodeId, PageMode } from '@docs/core';
import { FileText, History, TriangleAlert, type LucideIcon } from 'lucide-react';
import {
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { useDocs } from '@/data/context.js';
import type { DocumentSession } from '@/data/session.js';
import { useSessionState } from '@/data/session-store.js';
import { format } from '@/data/strings.js';
import { cancelIdle, requestIdle } from '@/lib/idle.js';
import { relativeTime } from '@/lib/relative-time.js';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/button';

/** The diff and the dialog around it are a chunk of their own: `Compare` is what fetches it. */
const DraftCompare = lazy(async () => {
  const { DraftCompare: Component } = await import('./draft-compare.js');
  return { default: Component };
});

export type BannerVariant = 'info' | 'warning' | 'danger';

/** docs/06 section 10. */
const VARIANT: Record<BannerVariant, string> = {
  info: 'bg-muted border-border',
  warning: 'bg-amber-50 border-amber-200 dark:border-amber-900 dark:bg-amber-950/30',
  danger: 'bg-red-50 border-red-200 dark:border-red-900 dark:bg-red-950/30',
};

/** The icon carries the severity, the way the status pill's does (docs/06 section 9). */
const ICON: Record<BannerVariant, string> = {
  info: 'text-muted-foreground',
  warning: 'text-amber-600 dark:text-amber-500',
  danger: 'text-red-600 dark:text-red-500',
};

export interface BannerProps extends Omit<ComponentProps<'div'>, 'role' | 'title'> {
  variant?: BannerVariant;
  icon: LucideIcon;
  /** docs/07 section 9: the conflict banner interrupts, the rest wait their turn. */
  role?: 'status' | 'alert';
  actions?: ReactNode;
}

/** docs/06 section 10: one line of text, the buttons on the right, nothing dismissible. */
export function Banner({
  variant = 'info',
  icon: Icon,
  role = 'status',
  actions,
  children,
  className,
  ...rest
}: BannerProps): React.JSX.Element {
  return (
    <div
      role={role}
      className={cn(
        'my-2 flex flex-wrap items-start gap-3 rounded-md border px-3 py-2 text-sm',
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', ICON[variant])} aria-hidden="true" />
      {/* Below 768 px the line keeps the row to itself and the buttons wrap under it. */}
      <div className="min-w-0 flex-1 basis-[calc(100%-1.75rem)] md:basis-0">{children}</div>
      {actions !== undefined && (
        <div className="flex shrink-0 items-center gap-1.5 max-md:w-full max-md:justify-end">
          {actions}
        </div>
      )}
    </div>
  );
}

export interface PageBannersProps {
  pageId: NodeId;
  session: DocumentSession;
  mode: PageMode;
  /** Over the block threshold, so the page opened read-only (docs/05 section 6). */
  largePage?: boolean;
  /** "Edit anyway": both the lossy and the large-page banner hand the page to the editor. */
  onEdit: () => void;
  className?: string;
}

/**
 * The banner stack between the header and the page (docs/06 section 10), in the order a reader
 * has to answer them: what happened to the file first, then what is in the editor, then what
 * editing would cost.
 */
export function PageBanners({
  pageId,
  session,
  mode,
  largePage = false,
  onEdit,
  className,
}: PageBannersProps): React.JSX.Element | null {
  const { capabilities, ns, onEvent, strings } = useDocs();
  const state = useSessionState(ns, pageId);

  // docs/07 section 8: the lossy banner is shown before the first edit, so entering edit mode
  // at all is the acknowledgement - coming back to read mode does not bring it back.
  const [acked, setAcked] = useState(false);

  /** The two bodies, read once when `Compare` is pressed; `null` while the dialog is closed. */
  const [comparing, setComparing] = useState<{ file: string; draft: string } | null>(null);
  useEffect(() => {
    if (mode === 'edit') setAcked(true);
  }, [mode]);

  // docs/05 section 4: one serialize and two parses, in idle time after the first paint.
  const [lossy, setLossy] = useState<string[] | null>(null);
  const skip = acked || mode === 'edit' || !capabilities.write;
  // Read through a ref: the session object is rebuilt on every status change, and classifying
  // is not something to redo because a save landed.
  const latest = useRef(session);
  latest.current = session;
  useEffect(() => {
    if (skip) return;
    const idle = requestIdle(() => {
      const fidelity = latest.current.fidelity;
      const reasons = fidelity.level === 'lossy' ? fidelity.reasons : null;
      setLossy(reasons);
      // docs/08 section 3: the host hears what the reader is about to be told.
      if (reasons !== null) {
        onEvent({ type: 'warning', code: 'lossy_document', id: pageId, details: reasons });
      }
    });
    return () => {
      cancelIdle(idle);
    };
  }, [pageId, skip, onEvent]);

  const conflict = state?.status === 'conflict';
  const draftRestored = state?.draftRestored === true;
  const draftMismatch = state?.draftMismatch === true;
  const showLossy = !skip && lossy !== null;
  // The guard holds in both modes: pressing Edit on a huge page leaves the reader here until
  // they take the banner's way in (docs/05 section 6).
  const showLarge = largePage && capabilities.write;

  if (!conflict && !draftRestored && !draftMismatch && !showLossy && !showLarge) return null;

  const at = state?.draftAt ?? null;

  return (
    <div className={className}>
      {conflict && (
        <Banner
          data-docs-banner="conflict"
          variant="danger"
          role="alert"
          icon={TriangleAlert}
          actions={
            <>
              <Action
                label={strings['banner.conflictReload']}
                onClick={() => {
                  void session.resolveConflict('reload');
                }}
              />
              <Action
                variant="ghost"
                label={strings['banner.conflictOverwrite']}
                onClick={() => {
                  void session.resolveConflict('overwrite');
                }}
              />
            </>
          }
        >
          {strings['banner.conflict']}
        </Banner>
      )}

      {draftRestored && (
        <Banner
          data-docs-banner="draft"
          icon={History}
          actions={
            <>
              <Action
                label={strings['banner.draftKeep']}
                onClick={() => {
                  session.resolveDraft('keep');
                }}
              />
              <Action
                variant="ghost"
                label={strings['banner.draftDiscard']}
                onClick={() => {
                  session.resolveDraft('discard');
                }}
              />
            </>
          }
        >
          {format(strings['banner.draftRestored'], {
            time: at === null ? '' : relativeTime(at),
          })}
        </Banner>
      )}

      {draftMismatch && (
        <Banner
          data-docs-banner="draft"
          variant="warning"
          icon={History}
          actions={
            <>
              <Action
                label={strings['banner.draftApply']}
                onClick={() => {
                  session.resolveDraft('keep');
                }}
              />
              <Action
                variant="ghost"
                label={strings['banner.draftKeepFile']}
                onClick={() => {
                  session.resolveDraft('discard');
                }}
              />
              <Action
                variant="ghost"
                label={strings['banner.draftCompare']}
                onClick={() => {
                  setComparing(session.compareDraft());
                }}
              />
            </>
          }
        >
          {strings['banner.draftMismatch']}
        </Banner>
      )}

      {comparing !== null && (
        <Suspense fallback={null}>
          <DraftCompare
            file={comparing.file}
            draft={comparing.draft}
            onClose={() => {
              setComparing(null);
            }}
          />
        </Suspense>
      )}

      {showLossy && <LossyBanner reasons={lossy} onEdit={onEdit} />}

      {showLarge && (
        <Banner
          data-docs-banner="large"
          icon={FileText}
          actions={<Action label={strings['banner.largePageEdit']} onClick={onEdit} />}
        >
          {strings['banner.largePage']}
        </Banner>
      )}
    </div>
  );
}

/** docs/06 section 10: "Learn more" opens the reasons list under the line that summarises it. */
function LossyBanner({
  reasons,
  onEdit,
}: {
  reasons: string[];
  onEdit: () => void;
}): React.JSX.Element {
  const { strings } = useDocs();
  const [open, setOpen] = useState(false);
  const labels = reasons.map((reason) => reasonLabel(reason, strings));

  return (
    <Banner
      data-docs-banner="lossy"
      variant="warning"
      icon={TriangleAlert}
      actions={
        <>
          <Action label={strings['banner.lossyEdit']} onClick={onEdit} />
          <Action
            variant="ghost"
            label={strings['banner.lossyLearnMore']}
            expanded={open}
            onClick={() => {
              setOpen((was) => !was);
            }}
          />
        </>
      }
    >
      {format(strings['banner.lossy'], { reasons: list(labels) })}
      {open && (
        <>
          <p className="mt-2 text-xs font-medium">{strings['banner.lossyReasons']}</p>
          <ul className="mt-1 list-disc space-y-0.5 ps-4 text-xs">
            {labels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </>
      )}
    </Banner>
  );
}

/** Every banner button is the same size (docs/06 section 10); only the emphasis differs. */
function Action({
  label,
  onClick,
  variant = 'secondary',
  expanded,
}: {
  label: string;
  onClick: () => void;
  variant?: 'secondary' | 'ghost';
  expanded?: boolean;
}): React.JSX.Element {
  return (
    <Button
      variant={variant}
      size="sm"
      // 44 px on a phone (docs/06 section 15), 28 px on a pointer device.
      className="h-7 text-xs max-md:h-11"
      aria-expanded={expanded}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

/**
 * The classifier names reasons in mdast terms (docs/05 section 4). A reason it invented for a
 * node type nothing here knows still has to read as a sentence, hence the fallback.
 */
function reasonLabel(reason: string, strings: Record<string, string>): string {
  const unknown = reason.startsWith('unknown_node:');
  if (unknown) {
    return format(strings['reason.unknown'] ?? '{type}', { type: reason.slice(13) });
  }
  return strings[`reason.${reason}`] ?? reason;
}

const list = (labels: string[]): string => labels.join(', ');
