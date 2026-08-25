'use client';

import type { TImageElement } from 'platejs';
import type { PlateElementProps } from 'platejs/react';

import { useDraggable } from '@platejs/dnd';
import { Image, useMediaState } from '@platejs/media/react';
import { ResizableProvider } from '@platejs/resizable';
import { PlateElement, withHOC } from 'platejs/react';

import { blockStyles } from '@/lib/block-styles.js';
import { cn } from '@/lib/utils';

import { mediaResizeHandleVariants, Resizable, ResizeHandle } from './resize-handle';

export const ImageElement = withHOC(
  // `@platejs/resizable` declares its provider as `any`.
  ResizableProvider as Parameters<typeof withHOC>[0],
  function ImageElement(props: PlateElementProps<TImageElement>) {
    const { align = 'center', focused, readOnly, selected } = useMediaState();

    const { isDragging, handleRef } = useDraggable({
      element: props.element,
    });

    return (
      <PlateElement {...props} className={blockStyles.image}>
        <figure className="group relative m-0" contentEditable={false}>
          <Resizable
            align={align}
            options={{
              align,
              readOnly,
            }}
          >
            <ResizeHandle
              className={mediaResizeHandleVariants({ direction: 'left' })}
              options={{ direction: 'left' }}
            />
            <div>
              <Image
                ref={handleRef}
                className={cn(
                  'block w-full max-w-full cursor-pointer object-cover px-0',
                  'rounded-md',
                  focused && selected && 'ring-2 ring-ring ring-offset-2',
                  isDragging && 'opacity-50',
                )}
                alt={props.attributes.alt as string | undefined}
              />
            </div>
            <ResizeHandle
              className={mediaResizeHandleVariants({
                direction: 'right',
              })}
              options={{ direction: 'right' }}
            />
          </Resizable>

          {/*
            docs/05 section 5 gives an image its caption from a following italic paragraph, and
            that rule is P2-T12. Until it lands, `caption` holds only the Markdown alt text, which
            the read view (docs/05 section 7) does not draw - so neither does the editor, or the
            swap between them would move the page under the caret (docs/05 section 8).
          */}
        </figure>

        {props.children}
      </PlateElement>
    );
  },
);
