import type { NodeId } from '@docs/core';
import { DocsProvider, usePage, useTreeIndex, type DocsNavigation } from '@docs/react';
import { createMemoryProvider } from '@docs/react/adapters/memory';
import { PageTree } from '@docs/react/tree';
import { DocumentView } from '@docs/react/view';
import { useMemo, useState } from 'react';

const provider = createMemoryProvider({
  files: {
    'index.md': '# Handbook\n\nEverything a new joiner needs, in three files.\n',
    'getting-started.md': '# Getting started\n\nInstall the package, import the styles.\n',
    'theming.md': '# Theming\n\nThe host owns the shadcn variables.\n',
  },
});

/**
 * A host that composes the parts itself (docs/08 section 4): the tree on the left, the read
 * view on the right, its own layout around them. The sizes come from the module's variables,
 * which is all a host without Tailwind gets - `--docs-sidebar-width` is 240 px in
 * `styles.css` and the rows are 28 px because the package compiled its own classes.
 */
function Body({
  pageId,
  onOpen,
}: {
  pageId: NodeId | null;
  onOpen: (id: NodeId) => void;
}): React.JSX.Element {
  const { data: index } = useTreeIndex();
  const { data: page } = usePage(pageId);
  const node = pageId === null ? undefined : index?.byId[pageId];

  return (
    <div className="docs-root" style={{ display: 'flex', height: '100dvh' }}>
      <aside
        style={{
          width: 'var(--docs-sidebar-width)',
          borderRight: '1px solid var(--docs-sidebar-border)',
          overflow: 'auto',
        }}
      >
        <PageTree activeId={pageId} onOpen={onOpen} />
      </aside>
      <main style={{ flex: 1, overflow: 'auto', padding: '32px' }}>
        {page === undefined || node === undefined ? (
          <p>Pick a page.</p>
        ) : (
          <DocumentView page={page} node={node} />
        )}
      </main>
    </div>
  );
}

export function App(): React.JSX.Element {
  const [pageId, setPageId] = useState<NodeId | null>(null);
  const navigation = useMemo<DocsNavigation>(
    () => ({
      activePageId: pageId,
      mode: 'read',
      navigate: (to) => {
        setPageId(to.pageId);
      },
    }),
    [pageId],
  );

  return (
    <DocsProvider provider={provider} navigation={navigation}>
      <Body pageId={pageId} onOpen={setPageId} />
    </DocsProvider>
  );
}
