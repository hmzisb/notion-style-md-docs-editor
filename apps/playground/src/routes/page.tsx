import { DocsShell } from '@docs/react/shell';
import { createRoute } from '@tanstack/react-router';
import type { PageMode } from '@docs/react';
import { rootRoute } from './root.js';

function PageRoute(): React.JSX.Element {
  const { pageId } = pageRoute.useParams();
  const { mode } = pageRoute.useSearch();
  return <DocsShell pageId={pageId} mode={mode} />;
}

export const pageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/p/$pageId',
  validateSearch: (search: Record<string, unknown>): { mode: PageMode } => ({
    mode: search.mode === 'edit' ? 'edit' : 'read',
  }),
  component: PageRoute,
});
