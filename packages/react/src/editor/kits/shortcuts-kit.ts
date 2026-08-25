'use client';

import { TogglePlugin } from '@platejs/toggle/react';
import { createSlatePlugin, insertExitBreak, KEYS, type SlateEditor, type TElement } from 'platejs';
import { setBlockType } from '@/editor/transforms';

/**
 * docs/07 section 2: the Notion mapping. The block plugins carry the shortcuts they own
 * (`Cmd+Alt+1-3`, `Cmd+Alt+8`, `Cmd+Shift+.`); what is left needs a transform of its own, or
 * belongs to no single plugin, so it lives here in one place.
 *
 * `Cmd+Alt+7` (toggle) and `Cmd+Alt+9` (callout) are not bound: neither block serializes yet
 * (P2-T10, P2-T11), and docs/05 section 5 keeps a block unreachable until its rule lands.
 */

interface Context {
  editor: SlateEditor;
}

const turnInto =
  (type: string) =>
  ({ editor }: Context): void => {
    setBlockType(editor, type);
  };

/** The block the caret is in, which is what every shortcut below acts on. */
const currentBlock = (editor: SlateEditor): [TElement, number[]] | undefined => {
  const entry = editor.api.block<TElement>();
  return entry === undefined ? undefined : [entry[0], [...entry[1]]];
};

const moveBlock =
  (direction: -1 | 1) =>
  ({ editor }: Context): void => {
    const block = currentBlock(editor);
    if (block === undefined) return;
    const [, path] = block;
    const index = path.at(-1);
    if (index === undefined) return;
    const to = [...path.slice(0, -1), index + direction];
    // A block at either end has nowhere to go; moving onto a path that holds nothing throws.
    if (index + direction < 0 || editor.api.node(to) === undefined) return;
    editor.tf.moveNodes({ at: path, to });
  };

/**
 * docs/07 section 2 gives `Cmd+Enter` to the to-do checkbox and the toggle. Everything else
 * keeps Plate's exit break, which is what the same key does in a code block or a quote.
 */
const enter = ({ editor }: Context): void => {
  const block = currentBlock(editor);
  if (block === undefined) {
    insertExitBreak(editor);
    return;
  }
  const [node, path] = block;
  if (node[KEYS.listType] === KEYS.listTodo) {
    editor.tf.setNodes({ checked: node.checked !== true }, { at: path });
    return;
  }
  if (node.type === KEYS.toggle && typeof node.id === 'string') {
    editor.getApi(TogglePlugin).toggle.toggleIds([node.id]);
    return;
  }
  insertExitBreak(editor);
};

const duplicate = ({ editor }: Context): void => {
  editor.tf.duplicateNodes({ block: true });
};

export const ShortcutsKit = [
  createSlatePlugin({
    key: 'docsShortcuts',
    shortcuts: {
      turnIntoText: { keys: 'mod+alt+0', handler: turnInto(KEYS.p) },
      turnIntoTodo: { keys: 'mod+alt+4', handler: turnInto(KEYS.listTodo) },
      turnIntoBulleted: { keys: 'mod+alt+5', handler: turnInto(KEYS.ul) },
      turnIntoNumbered: { keys: 'mod+alt+6', handler: turnInto(KEYS.ol) },
      moveBlockUp: { keys: 'mod+shift+up', handler: moveBlock(-1) },
      moveBlockDown: { keys: 'mod+shift+down', handler: moveBlock(1) },
      duplicateBlock: { keys: 'mod+d', handler: duplicate },
      toggleOrExit: { keys: 'mod+enter', handler: enter },
    },
  }),
];
