'use client';

import { insertCallout } from '@platejs/callout';
import { insertCodeBlock, toggleCodeBlock } from '@platejs/code-block';
import { triggerFloatingLink } from '@platejs/link/react';
import { insertMedia } from '@platejs/media';
import { TablePlugin } from '@platejs/table/react';
import { KEYS, PathApi, type NodeEntry, type Path, type TElement } from 'platejs';
import type { PlateEditor } from 'platejs/react';

/**
 * `@plate/transforms`, trimmed to the v1 block set (docs/05 section 2): the entries for AI,
 * columns, date, equations, excalidraw, footnotes, TOC, code drawings, and the audio, video
 * and file placeholders are gone with their plugins, and so are the suggestion guards, which
 * only matter to a `@platejs/suggestion` this module does not install.
 */

const insertList = (editor: PlateEditor, type: string): void => {
  editor.tf.insertNodes(editor.api.create.block({ indent: 1, listStyleType: type }), {
    select: true,
  });
};

const createBlockquote = (editor: PlateEditor): TElement => ({
  children: [editor.api.create.block({ type: KEYS.p })],
  type: KEYS.blockquote,
});

const selectBlockquoteStart = (editor: PlateEditor, path: Path): void => {
  const start = editor.api.start(path.concat([0]));
  if (start) editor.tf.select(start);
};

const insertBlockMap: Record<string, (editor: PlateEditor, type: string) => void> = {
  [KEYS.listTodo]: insertList,
  [KEYS.ol]: insertList,
  [KEYS.ul]: insertList,
  [KEYS.callout]: (editor) => {
    insertCallout(editor, { select: true });
  },
  [KEYS.codeBlock]: (editor) => {
    insertCodeBlock(editor, { select: true });
  },
  [KEYS.img]: (editor) => {
    // Opens the URL prompt and resolves when the user is done with it; nothing waits on that.
    void insertMedia(editor, { select: true, type: KEYS.img });
  },
  [KEYS.table]: (editor) => {
    editor.getTransforms(TablePlugin).insert.table({}, { select: true });
  },
};

const insertInlineMap: Record<string, (editor: PlateEditor, type: string) => void> = {
  [KEYS.link]: (editor) => {
    triggerFloatingLink(editor, { focused: true });
  },
};

export interface InsertBlockOptions {
  upsert?: boolean;
}

export const insertBlock = (
  editor: PlateEditor,
  type: string,
  options: InsertBlockOptions = {},
): void => {
  const { upsert = false } = options;

  editor.tf.withoutNormalizing(() => {
    const block = editor.api.block();
    if (!block) return;

    const [currentNode, path] = block;
    const isCurrentBlockEmpty = editor.api.isEmpty(currentNode);
    const isSameBlockType = type === getBlockType(currentNode);

    if (upsert && isCurrentBlockEmpty && isSameBlockType) return;

    if (type === KEYS.blockquote) {
      const insertPath = PathApi.next(path);
      editor.tf.insertNodes(createBlockquote(editor), { at: insertPath });
      if (!isSameBlockType && isCurrentBlockEmpty) editor.tf.removeNodes({ at: path });
      selectBlockquoteStart(editor, isCurrentBlockEmpty && !isSameBlockType ? path : insertPath);
      return;
    }

    const insert = insertBlockMap[type];
    if (insert) insert(editor, type);
    else
      editor.tf.insertNodes(editor.api.create.block({ type }), {
        at: PathApi.next(path),
        select: true,
      });

    if (!isSameBlockType) editor.tf.removeNodes({ previousEmptyBlock: true });
  });
};

export const insertInlineElement = (editor: PlateEditor, type: string): void => {
  insertInlineMap[type]?.(editor, type);
};

const setList = (editor: PlateEditor, type: string, entry: NodeEntry<TElement>): void => {
  editor.tf.setNodes(editor.api.create.block({ indent: 1, listStyleType: type }), { at: entry[1] });
};

const setBlockMap: Record<
  string,
  (editor: PlateEditor, type: string, entry: NodeEntry<TElement>) => void
> = {
  [KEYS.listTodo]: setList,
  [KEYS.ol]: setList,
  [KEYS.ul]: setList,
  [KEYS.codeBlock]: (editor) => {
    toggleCodeBlock(editor);
  },
};

export const setBlockType = (
  editor: PlateEditor,
  type: string,
  { at }: { at?: Path } = {},
): void => {
  editor.tf.withoutNormalizing(() => {
    if (type === KEYS.blockquote) {
      const target = at ?? editor.selection;
      if (!target || editor.api.some({ at: target, match: { type } })) return;
      editor.tf.toggleBlock(type, { ...(at ? { at } : {}), wrap: true });
      return;
    }

    const setEntry = (entry: NodeEntry<TElement>): void => {
      const [node, path] = entry;
      if (node[KEYS.listType]) editor.tf.unsetNodes([KEYS.listType, 'indent'], { at: path });
      const set = setBlockMap[type];
      if (set) {
        set(editor, type, entry);
        return;
      }
      if (node.type !== type) editor.tf.setNodes({ type }, { at: path });
    };

    if (at) {
      const entry = editor.api.node<TElement>(at);
      if (entry) {
        setEntry(entry);
        return;
      }
    }

    for (const entry of editor.api.blocks<TElement>({ mode: 'lowest' })) setEntry(entry);
  });
};

export const getBlockType = (block: TElement): string => {
  const listType = block[KEYS.listType];
  if (listType === KEYS.ol) return KEYS.ol;
  if (listType === KEYS.listTodo) return KEYS.listTodo;
  if (listType) return KEYS.ul;
  return block.type;
};
