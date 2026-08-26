'use client';

import { CALLOUT_ICONS, DEFAULT_CALLOUT_VARIANT } from '@docs/core';
import { insertCallout } from '@platejs/callout';
import { insertCodeBlock, toggleCodeBlock } from '@platejs/code-block';
import { triggerFloatingLink } from '@platejs/link/react';
import { TablePlugin } from '@platejs/table/react';
import { KEYS, PathApi, type NodeEntry, type Path, type TElement } from 'platejs';
import type { PlateEditor } from 'platejs/react';

/**
 * `@plate/transforms`, trimmed to the v1 block set (docs/05 section 2): the entries for AI,
 * columns, date, equations, excalidraw, footnotes, TOC, code drawings, and the audio, video
 * and file placeholders are gone with their plugins, and so are the suggestion guards, which
 * only matter to a `@platejs/suggestion` this module does not install.
 */

/** A to-do without `checked` saves as a plain bullet, so the list type carries it. */
const listProps = (type: string): Record<string, unknown> =>
  type === KEYS.listTodo
    ? { indent: 1, listStyleType: type, checked: false }
    : { indent: 1, listStyleType: type };

/**
 * After the block the caret is in, never inside it: inserting at the selection splits the
 * block, and the split takes the DOM node the caret lives in with it, so a slash menu driven
 * by the mouse would leave the editor with no focus at all.
 */
const insertAfter = (editor: PlateEditor, node: TElement, at: Path): void => {
  editor.tf.insertNodes(node, { at: PathApi.next(at), select: true });
};

const insertList = (editor: PlateEditor, type: string, at: Path): void => {
  insertAfter(editor, editor.api.create.block(listProps(type)), at);
};

const createBlockquote = (editor: PlateEditor): TElement => ({
  children: [editor.api.create.block({ type: KEYS.p })],
  type: KEYS.blockquote,
});

const selectBlockquoteStart = (editor: PlateEditor, path: Path): void => {
  const start = editor.api.start(path.concat([0]));
  if (start) editor.tf.select(start);
};

const insertBlockMap: Record<string, (editor: PlateEditor, type: string, at: Path) => void> = {
  [KEYS.listTodo]: insertList,
  [KEYS.ol]: insertList,
  [KEYS.ul]: insertList,
  [KEYS.callout]: (editor) => {
    // docs/05 section 5: the variant is what the file carries, and the icon follows it. The
    // plugin's own default is the last emoji the user picked, which no alert can hold.
    insertCallout(editor, {
      select: true,
      variant: DEFAULT_CALLOUT_VARIANT,
      icon: CALLOUT_ICONS[DEFAULT_CALLOUT_VARIANT],
    });
  },
  [KEYS.codeBlock]: (editor) => {
    insertCodeBlock(editor, { select: true });
  },
  [KEYS.img]: (editor, _type, at) => {
    // `insertMedia` asks for the URL through `window.prompt`; `ImageElement` asks for it in
    // the block itself instead (docs/05 section 6), so the block goes in empty.
    insertAfter(editor, editor.api.create.block({ type: KEYS.img, url: '' }), at);
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
    if (insert) insert(editor, type, path);
    else
      editor.tf.insertNodes(editor.api.create.block({ type }), {
        at: PathApi.next(path),
        select: true,
      });

    // The block the caret started in is left behind, empty, above the new one. `removeNodes`'s
    // own `previousEmptyBlock` reads the block the caret is in now, and a table parks it in a
    // cell, where that paragraph is not a sibling; the path it started at still finds it.
    if (!isSameBlockType && isCurrentBlockEmpty && editor.api.node(path)?.[0] === currentNode)
      editor.tf.removeNodes({ at: path });
  });
};

export const insertInlineElement = (editor: PlateEditor, type: string): void => {
  insertInlineMap[type]?.(editor, type);
};

const setList = (editor: PlateEditor, type: string, entry: NodeEntry<TElement>): void => {
  editor.tf.setNodes(editor.api.create.block(listProps(type)), { at: entry[1] });
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
  [KEYS.callout]: (editor, type, [, path]) => {
    editor.tf.setNodes(
      { type, variant: DEFAULT_CALLOUT_VARIANT, icon: CALLOUT_ICONS[DEFAULT_CALLOUT_VARIANT] },
      { at: path },
    );
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
