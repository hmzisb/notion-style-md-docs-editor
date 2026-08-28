import type { NodeId, PageMode } from '@hmzisb/notion-docs-core';
import { DocsProvider, type DocsNavigation } from '@hmzisb/notion-docs-react';
import { createMemoryProvider } from '@hmzisb/notion-docs-react/adapters/memory';
import { DocsShell } from '@hmzisb/notion-docs-react/shell';
import { useMemo, useState } from 'react';

/** Three Markdown files, which is a workspace: ids, order and slugs come off the paths. */
const provider = createMemoryProvider({
  files: {
    'index.md': '# Handbook\n\nEverything a new joiner needs, in three files.\n',
    'getting-started.md': '# Getting started\n\nInstall the package, import the styles.\n',
    'theming.md': '# Theming\n\nThe host owns the shadcn variables.\n',
  },
});

/**
 * The whole of a Tailwind host (docs/08 section 1): a provider, a navigation the host owns,
 * and the shell. Navigation is `useState` here rather than a router, because what this host
 * checks is the published package, not the routing.
 */
export function App(): React.JSX.Element {
  const [at, setAt] = useState<{ pageId: NodeId | null; mode: PageMode }>({
    pageId: null,
    mode: 'read',
  });
  const navigation = useMemo<DocsNavigation>(
    () => ({
      activePageId: at.pageId,
      mode: at.mode,
      navigate: (to) => {
        setAt({ pageId: to.pageId, mode: to.mode ?? 'read' });
      },
    }),
    [at],
  );

  return (
    <DocsProvider provider={provider} navigation={navigation}>
      <DocsShell pageId={at.pageId} mode={at.mode} className="h-dvh" />
    </DocsProvider>
  );
}
