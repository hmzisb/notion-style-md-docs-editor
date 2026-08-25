import type { TreeNode } from '@docs/core';
import { createContext, useContext } from 'react';

/**
 * What an editor node component needs beyond `useDocs()`: which page it is painting, so a
 * relative link or image resolves against that page rather than against the open one - the
 * editor half of {@link ../view/context.ts}.
 */
export interface EditorContextValue {
  node: TreeNode;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditorNode(): TreeNode {
  const value = useContext(EditorContext);
  if (value === null) {
    throw new Error('Editor components must be used inside <DocumentEditor>.');
  }
  return value.node;
}
