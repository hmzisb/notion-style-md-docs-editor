import { useRef, useState } from 'react';
import { useDocs } from '@/data/context.js';
import { cn } from '@/lib/utils';

export interface ResizeHandleProps {
  width: number;
  min: number;
  max: number;
  onWidth: (width: number) => void;
  /** Double-click target: back to the shipped default. */
  onReset: () => void;
  className?: string;
}

const STEP = 16;
const COARSE_STEP = 64;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * docs/06 section 5: a 4 px hit area on the sidebar's right edge that shows a 1 px line while
 * it matters. docs/07 section 9: a focusable `separator` that also resizes from the keyboard,
 * which is the only way to reach it without a pointer.
 */
export function ResizeHandle({
  width,
  min,
  max,
  onWidth,
  onReset,
  className,
}: ResizeHandleProps): React.JSX.Element {
  const { strings } = useDocs();
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, width });

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={strings['tree.resize']}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      data-dragging={dragging}
      className={cn(
        'group absolute inset-y-0 end-0 z-20 w-1 cursor-col-resize touch-none outline-none',
        className,
      )}
      onPointerDown={(event) => {
        // Only the primary button drags; a right-click here belongs to the browser.
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = { x: event.clientX, width };
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (!dragging) return;
        onWidth(clamp(start.current.width + (event.clientX - start.current.x), min, max));
      }}
      onPointerUp={(event) => {
        if (!dragging) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        setDragging(false);
      }}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const step = event.shiftKey ? COARSE_STEP : STEP;
        onWidth(clamp(width + (event.key === 'ArrowRight' ? step : -step), min, max));
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 end-0 w-px bg-border opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[dragging=true]:opacity-100"
      />
    </div>
  );
}
