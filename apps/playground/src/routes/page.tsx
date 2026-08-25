import { useRecents, useSidebarStore, usePage, type PageMode } from '@docs/react';
import { Link, createRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { rootRoute } from './root.js';

/** Temporary until `DocumentView` lands in P1-T08: the Markdown as it came off the provider. */
function PageRoute(): React.JSX.Element {
  const { pageId } = pageRoute.useParams();
  const { mode } = pageRoute.useSearch();
  const { data: page, isPending, error } = usePage(pageId);
  const record = useRecents((state) => state.record);
  const setLastOpenedPageId = useSidebarStore((state) => state.setLastOpenedPageId);

  useEffect(() => {
    record(pageId);
    setLastOpenedPageId(pageId);
  }, [pageId, record, setLastOpenedPageId]);

  if (isPending) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  if (error !== null) return <p className="p-4 text-sm text-destructive">{error.message}</p>;

  return (
    <article className="mx-auto max-w-[700px] p-4">
      <h1 className="text-2xl font-semibold">{page.meta.title ?? pageId}</h1>
      <p className="pt-1 text-xs break-all text-muted-foreground">
        {page.version} · mode {mode} ·{' '}
        <Link to="/p/$pageId" params={{ pageId }} search={{ mode: otherMode(mode) }}>
          switch to {otherMode(mode)}
        </Link>
      </p>
      <pre className="pt-4 text-sm whitespace-pre-wrap">{page.body}</pre>
    </article>
  );
}

const otherMode = (mode: PageMode): PageMode => (mode === 'read' ? 'edit' : 'read');

export const pageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/p/$pageId',
  validateSearch: (search: Record<string, unknown>): { mode: PageMode } => ({
    mode: search.mode === 'edit' ? 'edit' : 'read',
  }),
  component: PageRoute,
});
