import type { NodeId, TreeNode } from '@docs/core';
import { createContext, useContext } from 'react';

/**
 * What an editor node component needs beyond `useDocs()`: which page it is painting, so a
 * relative link or image resolves against that page rather than against the open one - the
 * editor half of {@link ../view/context.ts}.
 */
export interface EditorContextValue {
  node: TreeNode;
  /** From the same tree the shell shows: a link outside that subtree stays unresolved. */
  idByPath: Readonly<Record<string, NodeId>>;
  /** The subtree the shell shows, so a page made from the editor lands in the same cache. */
  rootId?: NodeId | undefined;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditorContext(): EditorContextValue {
  const value = useContext(EditorContext);
  if (value === null) {
    throw new Error('Editor components must be used inside <DocumentEditor>.');
  }
  return value;
}

export function useEditorNode(): TreeNode {
  return useEditorContext().node;
}
