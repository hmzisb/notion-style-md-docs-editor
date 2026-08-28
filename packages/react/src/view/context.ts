import type { NodeId, TreeNode } from '@hmzisb/notion-docs-core';
import { createContext, useContext } from 'react';

/**
 * What a static node component needs beyond `useDocs()`: which page it is painting, so a
 * relative link or image resolves against that page rather than against the open one.
 */
export interface ViewContextValue {
  node: TreeNode;
  /** From the same tree the shell shows: a link outside that subtree stays unresolved. */
  idByPath: Readonly<Record<string, NodeId>>;
}

export const ViewContext = createContext<ViewContextValue | null>(null);

export function useView(): ViewContextValue {
  const value = useContext(ViewContext);
  if (value === null) {
    throw new Error('View components must be used inside <DocumentView>.');
  }
  return value;
}
