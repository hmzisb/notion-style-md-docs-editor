'use client';

import type { TImageElement } from 'platejs';
import type { PlateElementProps } from 'platejs/react';

import { useDraggable } from '@platejs/dnd';
import { Image, useMediaState } from '@platejs/media/react';
import { ResizableProvider } from '@platejs/resizable';
import { ImageIcon } from 'lucide-react';
import { PlateElement, withHOC } from 'platejs/react';
import { useState } from 'react';

import { useDocs } from '@/data/context.js';
import { blockStyles } from '@/lib/block-styles.js';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/button';

import { mediaResizeHandleVariants, Resizable, ResizeHandle } from './resize-handle';

export const ImageElement = withHOC(
  // `@platejs/resizable` declares its provider as `any`.
  ResizableProvider as Parameters<typeof withHOC>[0],
  function ImageElement(props: PlateElementProps<TImageElement>) {
    const { align = 'center', focused, readOnly, selected } = useMediaState();

    const { isDragging, handleRef } = useDraggable({
      element: props.element,
    });

    // docs/05 section 6: the slash item inserts the block first and asks for the URL in place.
    if (props.element.url === '') return <ImagePrompt {...props} readOnly={readOnly} />;

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

interface ImagePromptProps extends PlateElementProps<TImageElement> {
  readOnly: boolean;
}

/**
 * An image with no URL yet: docs/05 section 6 takes a URL or a path relative to the page, and
 * P2-T13 adds the upload path next to it. Left empty, the block removes itself rather than
 * saving an `![]()` nobody asked for.
 */
function ImagePrompt({ readOnly, ...props }: ImagePromptProps): React.JSX.Element {
  const { strings } = useDocs();
  const { editor, path } = props;
  const [url, setUrl] = useState('');

  const apply = (): void => {
    const next = url.trim();
    if (next === '') return;
    editor.tf.setNodes({ url: next }, { at: path });
    editor.tf.focus();
  };

  const remove = (): void => {
    editor.tf.removeNodes({ at: path });
    editor.tf.focus();
  };

  return (
    <PlateElement {...props} className={blockStyles.image}>
      {!readOnly && (
        <div
          contentEditable={false}
          className="my-2 flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2"
        >
          <ImageIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <input
            // The block is brand new and the caret was in it a moment ago; this is where the
            // user is looking.
            autoFocus
            value={url}
            placeholder={strings['editor.image.placeholder']}
            aria-label={strings['editor.image.placeholder']}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onChange={(event) => {
              setUrl(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                apply();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                remove();
              }
            }}
            onBlur={() => {
              if (url.trim() === '') remove();
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs"
            // The blur that a click would fire first is what removes the empty block.
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={apply}
          >
            {strings['editor.image.apply']}
          </Button>
        </div>
      )}
      {props.children}
    </PlateElement>
  );
}
