import { useState, type ReactNode } from 'react';
import { folderSupported, opfsSupported } from './providers.js';
import type { Workspace } from './workspace.js';

/** docs/01 section 5.7: Demo, Open folder, Browser storage, Remote. */
export function Landing({ workspace }: { workspace: Workspace }): React.JSX.Element {
  const { settings, status, error, notice } = workspace;
  const busy = status === 'opening';
  const saved = settings.folder;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Choose a workspace</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        The playground keeps your choice, so the next visit opens the same place.
      </p>

      <p aria-live="polite" className="mt-4 min-h-5 text-sm">
        {error !== null && <span className="text-destructive">{error}</span>}
        {error === null && notice !== null && (
          <span className="text-muted-foreground">{notice}</span>
        )}
      </p>

      <ul className="mt-2 grid gap-4 sm:grid-cols-2">
        <Card title="Demo" body="The bundled corpus, in memory. Edits last until you reload.">
          <Action
            label="Open demo"
            busy={busy}
            onClick={() => {
              workspace.open('demo');
            }}
          />
        </Card>

        {folderSupported() && (
          <Card
            title="Open folder"
            body="A folder on this computer, through the File System Access API."
          >
            {saved !== null && (
              <Action
                label={`Reopen ${saved.name}`}
                busy={busy}
                onClick={() => {
                  workspace.open('folder');
                }}
              />
            )}
            <Action
              label={saved === null ? 'Choose folder' : 'Choose another folder'}
              variant={saved === null ? 'primary' : 'secondary'}
              busy={busy}
              onClick={() => {
                workspace.open('folder', { fresh: true });
              }}
            />
          </Card>
        )}

        {opfsSupported() && (
          <Card
            title="Browser storage"
            body="A private workspace in this browser. Import a folder into it, or export it back out."
          >
            <Action
              label="Open browser storage"
              busy={busy}
              onClick={() => {
                workspace.open('opfs');
              }}
            />
            {folderSupported() && (
              <>
                <Action
                  label="Import folder"
                  variant="secondary"
                  busy={busy}
                  onClick={() => {
                    if (window.confirm('Importing replaces everything in browser storage.')) {
                      workspace.transfer('import');
                    }
                  }}
                />
                <Action
                  label="Export folder"
                  variant="secondary"
                  busy={busy}
                  onClick={() => {
                    workspace.transfer('export');
                  }}
                />
              </>
            )}
          </Card>
        )}

        <RemoteCard workspace={workspace} />
      </ul>
    </div>
  );
}

function RemoteCard({ workspace }: { workspace: Workspace }): React.JSX.Element {
  const [baseUrl, setBaseUrl] = useState(workspace.settings.baseUrl);

  return (
    <Card title="Remote" body="Any backend that answers the docs HTTP contract.">
      <form
        className="flex w-full flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          workspace.open('remote', { baseUrl });
        }}
      >
        <label className="flex flex-col gap-1 text-xs font-medium">
          Base URL
          <input
            type="url"
            name="baseUrl"
            required
            placeholder="https://example.com/api/docs"
            className="rounded border bg-background px-2 py-1.5 text-sm font-normal max-md:h-11"
            value={baseUrl}
            onChange={(event) => {
              setBaseUrl(event.target.value);
            }}
          />
        </label>
        <button
          type="submit"
          disabled={workspace.status === 'opening'}
          className="h-8 rounded bg-primary px-3 text-sm font-medium text-primary-foreground max-md:h-11 disabled:opacity-50"
        >
          Connect
        </button>
      </form>
    </Card>
  );
}

function Card({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <li className="flex flex-col rounded-lg border p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 flex-1 text-sm text-muted-foreground">{body}</p>
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </li>
  );
}

function Action({
  label,
  onClick,
  busy,
  variant = 'primary',
}: {
  label: string;
  onClick: () => void;
  busy: boolean;
  variant?: 'primary' | 'secondary';
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={
        variant === 'primary'
          ? 'h-8 rounded bg-primary px-3 text-sm font-medium text-primary-foreground max-md:h-11 disabled:opacity-50'
          : 'h-8 rounded border px-3 text-sm font-medium max-md:h-11 disabled:opacity-50'
      }
    >
      {label}
    </button>
  );
}
