import type { NodeId } from '@hmzisb/notion-docs-core';

/**
 * docs/06 section 8: the page menu's "Rename" puts the caret in the page title. The menu is in
 * the header and the title is in the canvas - neither renders the other, and a prop threaded
 * through the shell would re-render the whole page for a caret. Keyed by namespace and kept out
 * of React state for the same reason as the fresh store (docs/04 section 4).
 */
const listeners = new Map<string, (id: NodeId) => void>();

/** The mounted title, which is the only thing that can answer. */
export function onTitleFocus(ns: string, listener: (id: NodeId) => void): () => void {
  listeners.set(ns, listener);
  return () => {
    if (listeners.get(ns) === listener) listeners.delete(ns);
  };
}

/** No listener means no title on the screen, and then there is nothing to focus. */
export function focusTitle(ns: string, id: NodeId): void {
  listeners.get(ns)?.(id);
}
