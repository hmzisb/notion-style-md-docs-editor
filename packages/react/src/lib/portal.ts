/**
 * docs/11 section 4: Radix portals mount on `document.body`, outside `.docs-root`, where none of
 * the module's variables or scoped rules reach them - a menu or a sheet would paint with no
 * theme at all. Every portal in `ui/` renders into this container instead.
 */
let root: HTMLElement | null = null;

export function portalRoot(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined;
  // `isConnected` also covers a test environment that swaps the document between files.
  if (!root?.isConnected) {
    root = document.createElement('div');
    root.className = 'docs-root';
    // Tells the shell's own root apart from this one, which carries variables for portals only.
    root.dataset.docsPortal = '';
    // It carries variables only: every portalled surface positions itself against the viewport.
    root.style.display = 'contents';
    document.body.append(root);
  }
  return root;
}
