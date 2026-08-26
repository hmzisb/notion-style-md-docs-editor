import { createCodec } from '@docs/core';
import { KEYS, type Path } from 'platejs';
import { createPlateEditor, type PlateEditor } from 'platejs/react';
import { describe, expect, it } from 'vitest';
import { defaultStrings } from '@/data/strings.js';
import { createEditorKit } from './kits/editor-kit.js';
import { UploadPlugin } from './kits/upload-kit.js';
import { imagesOf, uploadImages, uploadInto, type UploadImage } from './upload.js';

/**
 * docs/05 section 6 and docs/09 P2-T13: a dropped, pasted or picked image is uploaded next to
 * the page and the block carries the upload while it runs. What the file gets is the path the
 * provider handed back - never a half-finished block.
 */

const codec = createCodec();

/** A one-paragraph page with the caret in it, which is where every one of these starts. */
function open(): PlateEditor {
  const editor: PlateEditor = createPlateEditor({
    plugins: createEditorKit({ strings: defaultStrings, toolbar: 'none' }),
    value: [{ children: [{ text: 'Words' }], type: KEYS.p }],
  });
  editor.tf.select([0, 0], { edge: 'end' });
  return editor;
}

const png = (name: string): File => new File(['bytes'], name, { type: 'image/png' });

/** jsdom has no `DataTransfer`; the handlers only ever read the files off one. */
const transfer = (...files: File[]): DataTransfer => ({ files }) as unknown as DataTransfer;

const images = (editor: PlateEditor): Record<string, unknown>[] =>
  editor.children.filter((node) => node.type === KEYS.img);

/** An upload the test finishes by hand, so the block can be read while it is still running. */
function deferred(): {
  upload: UploadImage;
  resolve: (path: string) => void;
  reject: () => void;
} {
  let settle: (result: { path: string; url: string }) => void = () => undefined;
  let fail: (error: Error) => void = () => undefined;
  const promise = new Promise<{ path: string; url: string }>((res, rej) => {
    settle = res;
    fail = rej;
  });
  return {
    upload: () => promise,
    resolve: (path) => {
      settle({ path, url: `blob:${path}` });
    },
    reject: () => {
      fail(new Error('offline'));
    },
  };
}

const at = (editor: PlateEditor, path: Path): Record<string, unknown> =>
  editor.api.node(path)?.[0] as Record<string, unknown>;

describe('the files a paste or a drop carries', () => {
  it('takes the images and leaves everything else to the browser', () => {
    const data = transfer(
      new File(['{}'], 'notes.json', { type: 'application/json' }),
      png('a.png'),
      new File(['x'], 'b.gif', { type: 'image/gif' }),
    );

    expect(imagesOf(data).map((file) => file.name)).toEqual(['a.png', 'b.gif']);
    expect(imagesOf(null)).toEqual([]);
  });
});

describe('uploading into the page (docs/05 section 6)', () => {
  it('shows the name where the picture will be, then the path it came back with', async () => {
    const editor = open();
    const { upload, resolve } = deferred();

    const running = uploadImages(editor, upload, [png('Flow Diagram.png')], [1]);

    // While it runs: a block of its own under the caret, naming the file being uploaded.
    expect(at(editor, [1])).toMatchObject({
      type: KEYS.img,
      uploadName: 'Flow Diagram.png',
      url: '',
    });
    expect(typeof at(editor, [1]).uploadId).toBe('string');

    resolve('assets/flow-diagram.png');
    await running;

    expect(at(editor, [1])).toMatchObject({ type: KEYS.img, url: 'assets/flow-diagram.png' });
    // The transient props are the block's business, not the file's.
    expect(at(editor, [1])).not.toHaveProperty('uploadId');
    expect(at(editor, [1])).not.toHaveProperty('uploadName');
  });

  it('never writes a block that is still uploading', async () => {
    const editor = open();
    const { upload, resolve } = deferred();

    const running = uploadImages(editor, upload, [png('shot.png')], [1]);
    expect(codec.toMarkdown(editor.children)).toBe('Words\n');

    resolve('assets/shot.png');
    await running;
    expect(codec.toMarkdown(editor.children)).toBe('Words\n\n![](assets/shot.png)\n');
  });

  it('inserts one block per file, in the order they were dropped', async () => {
    const editor = open();
    const upload: UploadImage = (file) =>
      Promise.resolve({ path: `assets/${file.name}`, url: `blob:${file.name}` });

    await uploadImages(editor, upload, [png('a.png'), png('b.png')], [1]);

    expect(images(editor).map((node) => node.url)).toEqual(['assets/a.png', 'assets/b.png']);
  });

  it('leaves a failed upload asking for a URL instead of losing the writer their place', async () => {
    const editor = open();
    const { upload, reject } = deferred();

    const running = uploadImages(editor, upload, [png('shot.png')], [1]);
    reject();
    await running;

    expect(at(editor, [1])).toMatchObject({ type: KEYS.img, uploadFailed: true, url: '' });
    expect(at(editor, [1])).not.toHaveProperty('uploadId');
    // Nothing half-written reaches the file either.
    expect(codec.toMarkdown(editor.children)).toBe('Words\n');
  });

  it('does nothing when the block is gone before the upload lands', async () => {
    const editor = open();
    const { upload, resolve } = deferred();

    const running = uploadImages(editor, upload, [png('shot.png')], [1]);
    editor.tf.removeNodes({ at: [1] });
    resolve('assets/shot.png');
    await running;

    expect(images(editor)).toEqual([]);
  });

  it('fills the block that asked for a URL, in place', async () => {
    const editor = open();
    editor.tf.insertNodes({ children: [{ text: '' }], type: KEYS.img, url: '' }, { at: [1] });
    const { upload, resolve } = deferred();

    const running = uploadInto(editor, upload, png('shot.png'), [1]);
    expect(at(editor, [1])).toMatchObject({ uploadName: 'shot.png' });

    resolve('assets/shot.png');
    await running;

    expect(images(editor)).toHaveLength(1);
    expect(at(editor, [1])).toMatchObject({ type: KEYS.img, url: 'assets/shot.png' });
    expect(at(editor, [1])).not.toHaveProperty('uploadName');
  });
});

/** The plugin only takes over a paste or a drop it can actually act on. */
describe('the paste and drop handlers', () => {
  const paste = (editor: PlateEditor, data: DataTransfer): boolean => {
    const event = { clipboardData: data, preventDefault: () => undefined };
    const { onPaste } = editor.getPlugin(UploadPlugin).handlers;
    return onPaste?.({ editor, event } as never) === true;
  };

  it('inserts the pasted image under the caret when the backend takes uploads', () => {
    const editor = open();
    editor.setOption(UploadPlugin, 'upload', (file: File) =>
      Promise.resolve({ path: `assets/${file.name}`, url: `blob:${file.name}` }),
    );
    expect(paste(editor, transfer(png('shot.png')))).toBe(true);
    expect(at(editor, [1])).toMatchObject({ type: KEYS.img, uploadName: 'shot.png' });
  });

  it('leaves a paste alone when there is no image, or nowhere to put one', () => {
    const editor = open();
    // No upload capability: the block set has an image item, but not one from a file.
    expect(paste(editor, transfer(png('shot.png')))).toBe(false);

    editor.setOption(UploadPlugin, 'upload', (file: File) =>
      Promise.resolve({ path: file.name, url: file.name }),
    );
    // A pasted URL is text, and text is the browser's own paste.
    expect(paste(editor, transfer())).toBe(false);
    expect(images(editor)).toEqual([]);
  });
});
