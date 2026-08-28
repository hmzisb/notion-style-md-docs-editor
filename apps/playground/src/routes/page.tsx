import { DocsShell } from '@hmzisb/notion-docs-react/shell';
import { createRoute } from '@tanstack/react-router';
import type { PageMode } from '@hmzisb/notion-docs-react';
import { applyTheme } from '../theme.js';
import { rootRoute } from './root.js';

function PageRoute(): React.JSX.Element {
  const { pageId } = pageRoute.useParams();
  const { mode } = pageRoute.useSearch();
  return <DocsShell pageId={pageId} mode={mode} onThemeChange={applyTheme} />;
}

export const pageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/p/$pageId',
  validateSearch: (search: Record<string, unknown>): { mode: PageMode } => ({
    mode: search.mode === 'edit' ? 'edit' : 'read',
  }),
  component: PageRoute,
});
