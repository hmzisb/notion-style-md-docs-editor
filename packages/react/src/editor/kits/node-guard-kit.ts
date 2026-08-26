import { createSlatePlugin, NodeApi, PathApi, type AnySlatePlugin } from 'platejs';

/**
 * `editor.api.node(path)` answers `undefined` for a path that is not there, and it gets there
 * by catching the error Slate throws - an error whose message is the whole document, run
 * through `JSON.stringify` before anything decides to discard it (DEV-030).
 *
 * `@platejs/list` asks for the block after every block an operation touched, so a page of
 * 4,500 blocks pays that serialization thousands of times over a single edit-mode entry: 20
 * of the 30 seconds it used to cost. Looking first is the same answer without the throw.
 */
export const NodeGuardPlugin: AnySlatePlugin = createSlatePlugin({
  key: 'docsNodeGuard',
}).overrideEditor(({ editor, api: { node } }) => ({
  api: {
    node(atOrOptions, nodeOptions) {
      if (PathApi.isPath(atOrOptions) && !NodeApi.has(editor, atOrOptions)) return undefined;
      return node(atOrOptions, nodeOptions);
    },
  },
}));
