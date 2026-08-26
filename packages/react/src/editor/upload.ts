import { generateId } from '@docs/core';
import { KEYS, type Path, type SlateEditor, type TElement } from 'platejs';

/**
 * docs/05 section 6: dropping, pasting or picking an image writes the file next to the page
 * and puts the path it came back with in the block. The block is inserted first and carries
 * the upload while it runs, so the progress is where the picture will be.
 */

/** What `DocumentEditor` hands the editor: the provider call, already bound to the page. */
export type UploadImage = (file: File) => Promise<{ path: string; url: string }>;

/** The transient properties an uploading image carries. None of them reach the file. */
export interface UploadingImage extends TElement {
  uploadId?: string;
  uploadName?: string;
  uploadFailed?: boolean;
}

export const isImageFile = (file: File): boolean => file.type.startsWith('image/');

/** The images in a paste or a drop, in the order the browser lists them. */
export const imagesOf = (data: DataTransfer | null): File[] =>
  data === null ? [] : [...data.files].filter(isImageFile);

const pathOf = (editor: SlateEditor, uploadId: string): Path | undefined =>
  editor.api.node({
    at: [],
    match: (node) => (node as UploadingImage).uploadId === uploadId,
  })?.[1];

/**
 * Runs one upload and puts the path in the block that is carrying it. A failure leaves the
 * block asking for a URL instead, which is the one thing the writer can still do about it
 * without losing their place.
 */
async function settle(
  editor: SlateEditor,
  upload: UploadImage,
  file: File,
  uploadId: string,
): Promise<void> {
  try {
    const { path } = await upload(file);
    const at = pathOf(editor, uploadId);
    // The block can be gone: the writer undid the insert, or deleted it while it ran.
    if (at === undefined) return;
    editor.tf.setNodes({ uploadFailed: null, uploadId: null, uploadName: null, url: path }, { at });
  } catch {
    const at = pathOf(editor, uploadId);
    if (at === undefined) return;
    editor.tf.setNodes({ uploadFailed: true, uploadId: null, uploadName: null }, { at });
  }
}

/** Inserts one image block per file at `at` and fills each in as its upload lands. */
export async function uploadImages(
  editor: SlateEditor,
  upload: UploadImage,
  files: readonly File[],
  at: Path,
): Promise<void> {
  const pending = files.map((file) => ({ file, uploadId: generateId() }));

  editor.tf.insertNodes(
    pending.map(({ file, uploadId }) => ({
      children: [{ text: '' }],
      type: KEYS.img,
      uploadId,
      uploadName: file.name,
      url: '',
    })),
    { at },
  );

  await Promise.all(pending.map(({ file, uploadId }) => settle(editor, upload, file, uploadId)));
}

/** The same, into the block that is already there: the empty one asking for a URL. */
export async function uploadInto(
  editor: SlateEditor,
  upload: UploadImage,
  file: File,
  at: Path,
): Promise<void> {
  const uploadId = generateId();
  editor.tf.setNodes({ uploadFailed: null, uploadId, uploadName: file.name }, { at });
  await settle(editor, upload, file, uploadId);
}
