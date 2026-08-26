'use client';

import type { Path, SlateEditor } from 'platejs';
import { createPlatePlugin } from 'platejs/react';
import { imagesOf, uploadImages, type UploadImage } from '@/editor/upload.js';

/**
 * docs/05 section 6: pasting or dropping image files uploads them and inserts the paths.
 * `upload` is `null` until `DocumentEditor` sets it, and stays `null` for a backend whose
 * `capabilities.upload` is off - the plugin then does nothing and the browser's own paste
 * (a URL, HTML, text) runs as before.
 */
export const UploadPlugin = createPlatePlugin({
  key: 'docsUpload',
  options: { upload: null as UploadImage | null },
}).extend(({ getOptions }) => ({
  handlers: {
    onDrop: ({ editor, event }) => {
      const { upload } = getOptions();
      const files = imagesOf(event.dataTransfer);
      if (upload === null || files.length === 0) return false;
      event.preventDefault();
      // Where the pointer is, not where the caret was: a drop is aimed.
      const dropped = editor.api.findEventRange(event)?.focus.path[0];
      void uploadImages(
        editor,
        upload,
        files,
        dropped === undefined ? blockAfterCaret(editor) : [dropped + 1],
      );
      return true;
    },
    onPaste: ({ editor, event }) => {
      const { upload } = getOptions();
      const files = imagesOf(event.clipboardData);
      if (upload === null || files.length === 0) return false;
      event.preventDefault();
      void uploadImages(editor, upload, files, blockAfterCaret(editor));
      return true;
    },
  },
}));

/** A block image goes on its own line, under the block the caret is in. */
const blockAfterCaret = (editor: SlateEditor): Path => {
  const top = editor.api.block()?.[1][0];
  return [top === undefined ? 0 : top + 1];
};
