import { PageTree } from '@docs/react/tree';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { rootRoute } from './root.js';

/** The sidebar column the shell will own from P1-T07; for now the tree stands alone. */
function IndexRoute(): React.JSX.Element {
  const navigate = useNavigate();

  return (
    <div className="flex h-[calc(100dvh-2.75rem)]">
      <div className="w-[var(--docs-sidebar-width)] shrink-0 border-e bg-sidebar p-2 text-sidebar-foreground">
        <PageTree
          activeId={null}
          onOpen={(pageId, opts) => {
            void navigate({
              to: '/p/$pageId',
              params: { pageId },
              search: { mode: opts?.mode ?? ('read' as const) },
            });
          }}
        />
      </div>
      <p className="p-4 text-sm text-muted-foreground">Pick a page from the tree.</p>
    </div>
  );
}

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexRoute,
});
