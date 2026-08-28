'use client';

import type { PlateElementProps } from 'platejs/react';

import { CaptionTextarea } from '@platejs/caption/react';
import { useDraggable } from '@platejs/dnd';
import { useMediaState } from '@platejs/media/react';
import { ImageIcon, ImageOff, Loader2 } from 'lucide-react';
import { NodeApi, type TCaptionProps, type TImageElement } from 'platejs';
import { PlateElement, usePluginOption, withHOC } from 'platejs/react';
import { ResizableProvider } from '@platejs/resizable';
import { useRef, useState } from 'react';

import { useAssetUrl } from '@/data/assets.js';
import { useDocs } from '@/data/context.js';
import { format } from '@/data/strings.js';
import { useEditorNode } from '@/editor/context.js';
import { UploadPlugin } from '@/editor/kits/upload-kit.js';
import { uploadInto, type UploadingImage } from '@/editor/upload.js';
import { blockStyles } from '@/lib/block-styles.js';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/button';
import { Skeleton } from '@/ui/skeleton';

import { mediaResizeHandleVariants, Resizable, ResizeHandle } from './resize-handle';

type ImageProps = PlateElementProps<TImageElement & TCaptionProps & UploadingImage>;

export const ImageElement = withHOC(
  // `@platejs/resizable` declares its provider as `any`.
  ResizableProvider as Parameters<typeof withHOC>[0],
  function ImageElement(props: ImageProps) {
    const { align = 'center', focused, readOnly, selected } = useMediaState();
    const { strings } = useDocs();
    const page = useEditorNode();
    // What the caption UI edits is one text node, which is what `CaptionTextarea` writes.
    const [line] = props.element.caption ?? [];
    const caption = line === undefined ? '' : NodeApi.string(line);
    // docs/05 section 6: the path in the Markdown is relative to the page, so the editor
    // resolves it the same way the read view does - a raw path is not a URL a browser has.
    const { url, failed } = useAssetUrl(props.element.url, page);

    const { isDragging, handleRef } = useDraggable({
      element: props.element,
    });

    if (props.element.uploadId !== undefined) return <ImageUploading {...props} />;
    // docs/05 section 6: the slash item inserts the block first and asks for the URL in place.
    if (props.element.url === '') return <ImagePrompt {...props} readOnly={readOnly} />;

    return (
      <PlateElement {...props} className={blockStyles.image}>
        <figure className={cn(blockStyles.figure, 'group relative')} contentEditable={false}>
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
              {failed ? (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-sm text-muted-foreground">
                  <ImageOff aria-hidden="true" className="size-4 shrink-0" />
                  {format(strings['editor.imageMissing'], { path: props.element.url })}
                </span>
              ) : url === null ? (
                <Skeleton className="aspect-video w-full rounded-md" />
              ) : (
                <img
                  ref={handleRef}
                  src={url}
                  alt={typeof props.element.alt === 'string' ? props.element.alt : ''}
                  // docs/06 section 7 sizes an image `max-w-full`, not `w-full`: a picture
                  // narrower than the column is drawn at its own size in the read view, and
                  // stretching it here would redraw the page on the way into edit mode
                  // (docs/05 section 8).
                  className={cn(
                    'block max-w-full cursor-pointer px-0',
                    blockStyles.figureImage,
                    'rounded-md',
                    focused && selected && 'ring-2 ring-ring ring-offset-2',
                    isDragging && 'opacity-50',
                  )}
                />
              )}
            </div>
            <ResizeHandle
              className={mediaResizeHandleVariants({
                direction: 'right',
              })}
              options={{ direction: 'right' }}
            />
          </Resizable>

          {/*
            docs/05 section 5: the caption is the italic paragraph after the image, and the alt
            text above is a different string. The field only appears once there is something to
            show or the image is selected, so read and edit draw the same page (docs/05
            section 8) until the writer asks for the field.
          */}
          {caption !== '' || (!readOnly && selected) ? (
            <figcaption className={blockStyles.caption}>
              {readOnly ? (
                caption
              ) : (
                <CaptionTextarea
                  // A placeholder is not a label: the field needs a name of its own.
                  aria-label={strings['editor.image.caption']}
                  className="w-full resize-none bg-transparent text-center outline-none placeholder:text-muted-foreground/60"
                  placeholder={strings['editor.image.caption']}
                />
              )}
            </figcaption>
          ) : null}
        </figure>

        {props.children}
      </PlateElement>
    );
  },
);

/** docs/05 section 6: progress where the picture will be, not in a corner of the screen. */
function ImageUploading(props: ImageProps): React.JSX.Element {
  const { strings } = useDocs();

  return (
    <PlateElement {...props} className={blockStyles.image}>
      <div
        contentEditable={false}
        className="my-2 flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground"
        // The name changes as each upload lands, so the row has to be read out again.
        aria-live="polite"
      >
        <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin" />
        {format(strings['editor.image.uploading'], { name: props.element.uploadName ?? '' })}
      </div>
      {props.children}
    </PlateElement>
  );
}

interface ImagePromptProps extends ImageProps {
  readOnly: boolean;
}

/**
 * An image with no URL yet: docs/05 section 6 takes a URL, a path relative to the page, or a
 * file, and offers the file only where the backend takes uploads. Left empty, the block
 * removes itself rather than saving an `![]()` nobody asked for.
 */
function ImagePrompt({ readOnly, ...props }: ImagePromptProps): React.JSX.Element {
  const { strings } = useDocs();
  const { editor, path } = props;
  const [url, setUrl] = useState('');
  const upload = usePluginOption(UploadPlugin, 'upload');
  const file = useRef<HTMLInputElement>(null);

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
        <div contentEditable={false} className="my-2 space-y-1">
          <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2">
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
              onBlur={(event) => {
                // Reaching for `Upload` is not leaving the block; an empty one only goes away
                // when the writer looks somewhere else entirely.
                if (event.currentTarget.parentElement?.parentElement?.contains(event.relatedTarget))
                  return;
                if (url.trim() === '') remove();
              }}
            />
            {upload !== null && (
              <>
                <input
                  ref={file}
                  type="file"
                  accept="image/*"
                  multiple={false}
                  className="hidden"
                  onChange={(event) => {
                    const [chosen] = event.target.files ?? [];
                    if (chosen !== undefined) void uploadInto(editor, upload, chosen, path);
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => {
                    file.current?.click();
                  }}
                >
                  {strings['editor.image.upload']}
                </Button>
              </>
            )}
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
          {props.element.uploadFailed === true && (
            <p role="alert" className="px-1 text-xs text-destructive">
              {strings['editor.image.uploadFailed']}
            </p>
          )}
        </div>
      )}
      {props.children}
    </PlateElement>
  );
}
