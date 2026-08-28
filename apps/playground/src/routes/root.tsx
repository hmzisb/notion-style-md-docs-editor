import { DocsProvider } from '@hmzisb/notion-docs-react';
import { QueryClient } from '@tanstack/react-query';
import { Link, Outlet, createRootRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { recordEvent } from '../events.js';
import { Landing } from '../Landing.js';
import { useDocsNavigation } from '../navigation.js';
import { applyTheme, readTheme, watchSystemTheme, watchTheme, type Theme } from '../theme.js';
import { useWorkspace, type Workspace } from '../workspace.js';

const queryClient = new QueryClient();

const MODE_LABELS: Record<string, string> = {
  demo: 'Demo',
  folder: 'Folder',
  opfs: 'Browser storage',
  remote: 'Remote',
};

function ThemeSelect(): React.JSX.Element {
  const [theme, setTheme] = useState<Theme>(() => readTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  useEffect(() => watchSystemTheme(() => theme), [theme]);
  useEffect(
    () =>
      watchTheme(() => {
        setTheme(readTheme());
      }),
    [],
  );

  return (
    <label className="flex items-center gap-2 text-sm">
      Theme
      <select
        className="rounded border px-2 py-1 text-sm"
        value={theme}
        onChange={(event) => {
          setTheme(event.target.value as Theme);
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}

/** Back to the landing, which is where every mode is switched from. */
function WorkspaceButton({ workspace }: { workspace: Workspace }): React.JSX.Element | null {
  const navigate = useNavigate();
  const { settings, provider } = workspace;
  // On the landing there is nothing to leave, so the control is not there either.
  if (provider === null) return null;
  const label =
    settings.mode === 'folder'
      ? (settings.folder?.name ?? 'Folder')
      : (MODE_LABELS[settings.mode ?? ''] ?? 'none');

  return (
    <button
      type="button"
      className="rounded border px-2 py-1 text-sm"
      onClick={() => {
        void navigate({ to: '/' });
        workspace.leave();
      }}
    >
      Workspace: <span className="font-medium">{label}</span>
    </button>
  );
}

function RootLayout(): React.JSX.Element {
  const navigation = useDocsNavigation();
  const workspace = useWorkspace();

  return (
    <div className="docs-root flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-11 shrink-0 items-center justify-between border-b px-4">
        <Link to="/" className="text-sm font-medium">
          Docs playground
        </Link>
        <div className="flex items-center gap-3">
          <WorkspaceButton workspace={workspace} />
          <ThemeSelect />
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        {workspace.provider === null ? (
          <Landing workspace={workspace} />
        ) : (
          <DocsProvider
            provider={workspace.provider}
            navigation={navigation}
            queryClient={queryClient}
            onEvent={recordEvent}
          >
            <Outlet />
          </DocsProvider>
        )}
      </main>
    </div>
  );
}

export const rootRoute = createRootRoute({ component: RootLayout });
