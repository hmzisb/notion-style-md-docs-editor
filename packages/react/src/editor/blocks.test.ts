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
    [KEYS.callout, 'Heads up', '> [!NOTE]\n> Heads up\n'],
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
    // Toggle is drawn but not serialized yet (P2-T11): its words do not survive a save, which
    // is why docs/05 section 5 keeps it out of the menu until its rule lands.
    const editor = open();
    editor.tf.insertText('Words');
    editor.tf.setNodes({ type: KEYS.toggle }, { at: [0] });
    expect(markdown(editor)).toBe('');
  });
});

/** docs/05 section 5 and docs/07 section 2: the three ways into a callout, and one way out. */
describe('the callout block', () => {
  it('turns the block the caret is in into a note (Cmd+Alt+9)', () => {
    const editor = open();
    editor.tf.insertText('Words');
    setBlockType(editor, KEYS.callout);
    expect(markdown(editor)).toBe('> [!NOTE]\n> Words\n');
  });

  it('takes its variant from the marker the reader types', () => {
    const editor = open();
    editor.tf.insertText('[!warning]');
    editor.tf.insertText(' ');
    editor.tf.insertText('Careful');
    expect(editor.children[0]).toMatchObject({
      type: KEYS.callout,
      variant: 'warning',
      icon: 'triangle-alert',
    });
    expect(markdown(editor)).toBe('> [!WARNING]\n> Careful\n');
  });

  it('is a paragraph again, with its words, when turned back', () => {
    const editor = open();
    editor.tf.insertText('Words');
    setBlockType(editor, KEYS.callout);
    setBlockType(editor, KEYS.p);
    expect(markdown(editor)).toBe('Words\n');
  });
});
