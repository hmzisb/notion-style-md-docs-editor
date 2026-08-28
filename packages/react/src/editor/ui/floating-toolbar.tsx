'use client';

import * as React from 'react';

import {
  type FloatingToolbarState,
  flip,
  offset,
  useFloatingToolbar,
  useFloatingToolbarState,
} from '@platejs/floating';
import { useComposedRef } from '@udecode/cn';
import { KEYS } from 'platejs';
import {
  useEditorContainerRef,
  useEditorId,
  useEventEditorValue,
  usePluginOption,
} from 'platejs/react';

import { cn } from '@/lib/utils';

import { Toolbar } from './toolbar';

export function FloatingToolbar({
  children,
  className,
  state,
  ...props
}: React.ComponentProps<typeof Toolbar> & {
  state?: FloatingToolbarState;
}) {
  const editorId = useEditorId();
  const focusedEditorId = useEventEditorValue('focus');
  const isFloatingLinkOpen = !!usePluginOption({ key: KEYS.link }, 'mode');
  const isAIChatOpen = usePluginOption({ key: KEYS.aiChat }, 'open');
  const containerRef = useEditorContainerRef();

  const floatingToolbarState = useFloatingToolbarState({
    editorId,
    focusedEditorId,
    hideToolbar: isFloatingLinkOpen || isAIChatOpen,
    ...state,
    floatingOptions: {
      middleware: [
        offset(12),
        // Derivable, not a plain object: the container is null on the first render and
        // this runs on every reposition, by which point it is not.
        flip(() => ({
          fallbackPlacements: ['top-start', 'top-end', 'bottom-start', 'bottom-end'],
          padding: 12,
          // docs/06 section 8 puts the toolbar above the selection. Left to the default
          // boundary it measures against the scrolling ancestor, which starts above the
          // editor - so a selection in the first block had room to draw over the page
          // title. The editor's own box is the top it may not pass. `rootBoundary` still
          // defaults to the viewport and is intersected in, so a block scrolled to the
          // top of the screen still flips below rather than off it.
          ...(containerRef.current === null ? {} : { boundary: containerRef.current }),
        })),
      ],
      placement: 'top',
      ...state?.floatingOptions,
    },
  });

  const {
    clickOutsideRef,
    hidden,
    props: rootProps,
    ref: floatingRef,
  } = useFloatingToolbar(floatingToolbarState);

  const ref = useComposedRef<HTMLDivElement>(props.ref, floatingRef);

  if (hidden) return null;

  return (
    <div ref={clickOutsideRef}>
      <Toolbar
        {...props}
        {...rootProps}
        ref={ref}
        className={cn(
          // docs/06 section 8: h-9, p-1, gap-0.5, and the surface every popover shares.
          'scrollbar-hide absolute z-50 h-9 gap-0.5 overflow-x-auto whitespace-nowrap rounded-lg border border-border bg-popover p-1 text-popover-foreground opacity-100 shadow-md print:hidden',
          'max-w-[80vw]',
          className,
        )}
      >
        {children}
      </Toolbar>
    </div>
  );
}
