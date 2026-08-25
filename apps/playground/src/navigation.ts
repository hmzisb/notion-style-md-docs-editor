import type { DocsNavigation } from '@docs/react';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useMemo } from 'react';

/** docs/08 section 8.1: the router is the host's, the module only asks to be moved. */
export function useDocsNavigation(): DocsNavigation {
  const navigate = useNavigate();
  const { pageId } = useParams({ strict: false });
  const { mode } = useSearch({ strict: false });

  return useMemo(
    () => ({
      activePageId: pageId ?? null,
      mode: mode ?? 'read',
      navigate: (to, opts) => {
        if (to.pageId === null) {
          void navigate({ to: '/', replace: opts?.replace });
          return;
        }
        void navigate({
          to: '/p/$pageId',
          params: { pageId: to.pageId },
          search: { mode: to.mode ?? 'read' },
          replace: opts?.replace,
        });
      },
      href: (to) => `/p/${to.pageId}?mode=${to.mode ?? 'read'}`,
    }),
    [navigate, pageId, mode],
  );
}
