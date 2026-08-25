import { DocsProvider } from '@docs/react';
import { QueryClient } from '@tanstack/react-query';
import { Link, Outlet, createRootRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useDocsNavigation } from '../navigation.js';
import { providerFor } from '../providers.js';
import { applyTheme, readTheme, watchSystemTheme, type Theme } from '../theme.js';

const queryClient = new QueryClient();
const provider = providerFor('demo');

function ThemeSelect(): React.JSX.Element {
  const [theme, setTheme] = useState<Theme>(() => readTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  useEffect(() => watchSystemTheme(() => theme), [theme]);

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

function RootLayout(): React.JSX.Element {
  const navigation = useDocsNavigation();

  return (
    <DocsProvider provider={provider} navigation={navigation} queryClient={queryClient}>
      <div className="docs-root flex min-h-dvh flex-col bg-background text-foreground">
        <header className="flex h-11 items-center justify-between border-b px-4">
          <Link to="/" className="text-sm font-medium">
            Docs playground
          </Link>
          <ThemeSelect />
        </header>
        <main className="min-h-0 flex-1">
          <Outlet />
        </main>
      </div>
    </DocsProvider>
  );
}

export const rootRoute = createRootRoute({ component: RootLayout });
