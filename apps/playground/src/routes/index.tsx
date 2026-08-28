import { DocsShell } from '@hmzisb/notion-docs-react/shell';
import { createRoute } from '@tanstack/react-router';
import { applyTheme } from '../theme.js';
import { rootRoute } from './root.js';

function IndexRoute(): React.JSX.Element {
  return <DocsShell pageId={null} mode="read" onThemeChange={applyTheme} />;
}

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexRoute,
});
