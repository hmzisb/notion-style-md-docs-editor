import { createCodec } from '@docs/core';
import { KEYS } from 'platejs';
import { createPlateEditor, type PlateEditor } from 'platejs/react';
import { describe, expect, it } from 'vitest';
import { defaultStrings } from '@/data/strings.js';
import { createEditorKit } from './kits/editor-kit.js';
import { insertBlock, setBlockType } from './transforms.js';

/**
 * docs/09 P2-T05: every block the slash menu offers, inserted the way the menu inserts it and
 * saved through the codec of docs/05 section 3. The snippet is the whole promise: a block the
 * editor can draw but not write back has no business being in that menu (docs/05 section 5).
 */

const codec = createCodec();

/** A one-paragraph page with the caret in it, which is where a slash command starts. */
function open(): PlateEditor {
  const editor: PlateEditor = createPlateEditor({
    plugins: createEditorKit({ strings: defaultStrings, toolbar: 'none' }),
    value: [{ children: [{ text: '' }], type: KEYS.p }],
  });
  editor.tf.select([0, 0], { edge: 'start' });
  return editor;
}

const markdown = (editor: PlateEditor): string => codec.toMarkdown(editor.children);

const insert = (type: string, text: string): PlateEditor => {
  const editor = open();
  insertBlock(editor, type, { upsert: true });
  editor.tf.insertText(text);
  return editor;
};

describe('the slash menu block set (docs/05 section 2)', () => {
  it.each([
    [KEYS.p, 'Plain words', 'Plain words\n'],
    [KEYS.h1, 'Title', '# Title\n'],
    [KEYS.h2, 'Section', '## Section\n'],
    [KEYS.h3, 'Detail', '### Detail\n'],
    [KEYS.blockquote, 'Quoted', '> Quoted\n'],
    [KEYS.ul, 'Item', '- Item\n'],
    [KEYS.ol, 'First', '1. First\n'],
    [KEYS.listTodo, 'Task', '- [ ] Task\n'],
    [KEYS.codeBlock, 'const a = 1;', '```\nconst a = 1;\n```\n'],
  ])('saves %s as its Markdown', (type, text, expected) => {
    expect(markdown(insert(type, text))).toBe(expected);
  });

  it('saves a divider', () => {
    const editor = open();
    insertBlock(editor, KEYS.hr, { upsert: true });
    expect(markdown(editor)).toBe('---\n');
  });

  it('saves a table with a header row', () => {
    const editor = open();
    insertBlock(editor, KEYS.table, { upsert: true });
    editor.tf.insertText('Head');
    // The empty cells stay empty: the blank-block marker is a top-level affair (D-02).
    expect(markdown(editor)).toBe('| Head |   |\n| ---- | - |\n|      |   |\n');
  });

  it('inserts an image with no URL, so the block can ask for one (docs/05 section 6)', () => {
    const editor = open();
    insertBlock(editor, KEYS.img, { upsert: true });
    const [image] = editor.api.nodes({ match: { type: KEYS.img } });
    expect(image?.[0]).toMatchObject({ type: KEYS.img, url: '' });
  });

  it('turns a paragraph into another block without touching its text', () => {
    const editor = open();
    editor.tf.insertText('Words');
    setBlockType(editor, KEYS.h2);
    expect(markdown(editor)).toBe('## Words\n');
    setBlockType(editor, KEYS.ul);
    expect(markdown(editor)).toBe('- Words\n');
    setBlockType(editor, KEYS.p);
    expect(markdown(editor)).toBe('Words\n');
  });

  it('leaves no block in the menu that the codec cannot write', () => {
    // Callout and toggle are drawn but not serialized yet (P2-T10, P2-T11): the guard is that
    // nothing offers them until they are.
    const editor = open();
    editor.tf.setNodes({ type: KEYS.callout }, { at: [0] });
    expect(() => markdown(editor)).toThrow();
  });
});
