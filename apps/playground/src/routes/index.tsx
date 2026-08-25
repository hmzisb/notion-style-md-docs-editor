import { DocsShell } from '@docs/react/shell';
import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './root.js';

function IndexRoute(): React.JSX.Element {
  return <DocsShell pageId={null} mode="read" />;
}

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexRoute,
});
