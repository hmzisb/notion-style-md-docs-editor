import { useTreeIndex } from '@docs/react';
import { Link, createRoute } from '@tanstack/react-router';
import { rootRoute } from './root.js';

/** Temporary until `PageTree` lands in P1-T06: every page, flat, in tree order. */
function IndexRoute(): React.JSX.Element {
  const { data: index, isPending, error } = useTreeIndex();

  if (isPending) return <p className="p-4 text-sm text-muted-foreground">Loading pages…</p>;
  if (error !== null) return <p className="p-4 text-sm text-destructive">{error.message}</p>;

  const nodes = Object.values(index.byId).filter((node) => node.kind === 'page');

  return (
    <ul className="p-4 text-sm">
      {nodes.map((node) => (
        <li key={node.id} className="py-0.5">
          <Link
            to="/p/$pageId"
            params={{ pageId: node.id }}
            search={{ mode: 'read' as const }}
            className="hover:underline"
          >
            {node.title}
          </Link>
          <span className="pl-2 text-xs text-muted-foreground">{node.path}</span>
        </li>
      ))}
    </ul>
  );
}

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexRoute,
});
