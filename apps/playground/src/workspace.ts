import type { DocumentProvider } from '@docs/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  benchProvider,
  benchSize,
  demoProvider,
  exportOpfs,
  importOpfs,
  openFolder,
  openOpfs,
  openRemote,
  readSettings,
  writeSettings,
  type Mode,
  type WorkspaceSettings,
} from './providers.js';

export type WorkspaceStatus = 'landing' | 'opening' | 'ready' | 'error';

export interface Workspace {
  settings: WorkspaceSettings;
  status: WorkspaceStatus;
  provider: DocumentProvider | null;
  error: string | null;
  /** Result of the last import or export, for the status line under the OPFS card. */
  notice: string | null;
  open: (mode: Mode, opts?: { fresh?: boolean; baseUrl?: string }) => void;
  leave: () => void;
  transfer: (direction: 'import' | 'export') => void;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * docs/01 section 5.7: the mode the user picked, the provider behind it, and the landing in
 * between. A folder is never reopened without a gesture, because the permission prompt needs
 * one; every other mode restores itself on load.
 */
export function useWorkspace(): Workspace {
  const [settings, setSettings] = useState<WorkspaceSettings>(readSettings);
  const [status, setStatus] = useState<WorkspaceStatus>('landing');
  const [provider, setProvider] = useState<DocumentProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Only the newest attempt may install a provider: a slow OPFS open must not land on top of
  // a demo the user picked while waiting.
  const attempt = useRef(0);
  const install = useCallback((next: DocumentProvider | null, token: number): boolean => {
    if (token !== attempt.current) {
      next?.dispose?.();
      return false;
    }
    setProvider((current) => {
      if (current !== next) current?.dispose?.();
      return next;
    });
    return true;
  }, []);

  const open = useCallback(
    (mode: Mode, opts: { fresh?: boolean; baseUrl?: string } = {}) => {
      attempt.current += 1;
      const token = attempt.current;
      setError(null);
      setNotice(null);
      setStatus('opening');

      const run = async (): Promise<void> => {
        const current = readSettings();
        if (mode === 'demo') {
          if (install(demoProvider(), token)) save({ ...current, mode });
          return;
        }
        if (mode === 'opfs') {
          if (install(await openOpfs(current), token)) save({ ...current, mode });
          return;
        }
        if (mode === 'remote') {
          const baseUrl = (opts.baseUrl ?? current.baseUrl).trim().replace(/\/+$/, '');
          if (baseUrl === '') throw new Error('Enter the base URL of the docs API.');
          const remote = openRemote(baseUrl);
          // The handshake is what tells the user the URL is wrong, so it happens here.
          await remote.getMeta();
          if (install(remote, token)) save({ ...current, mode, baseUrl });
          return;
        }

        const picked = await openFolder(current, opts.fresh ?? false);
        if (picked === null) {
          // Cancelled, or no picker in this browser: stay where the user was.
          if (token === attempt.current) setStatus(provider === null ? 'landing' : 'ready');
          return;
        }
        if (install(picked.provider, token)) save(picked.settings);
        else picked.provider.dispose?.();
      };

      const save = (next: WorkspaceSettings): void => {
        writeSettings(next);
        setSettings(next);
        setStatus('ready');
      };

      void run().catch((reason: unknown) => {
        if (token !== attempt.current) return;
        setError(messageOf(reason));
        setStatus('error');
      });
    },
    [install, provider],
  );

  const leave = useCallback(() => {
    attempt.current += 1;
    setProvider((current) => {
      current?.dispose?.();
      return null;
    });
    setError(null);
    setNotice(null);
    setStatus('landing');
  }, []);

  /**
   * An import replaces the whole workspace, so it takes the next epoch: the new content
   * arrives under a cache namespace that never held the old pages.
   */
  const transfer = useCallback(
    (direction: 'import' | 'export') => {
      setError(null);
      setNotice(null);
      const run = async (): Promise<void> => {
        if (direction === 'export') {
          const name = await exportOpfs();
          setNotice(name === null ? null : `Exported to ${name}.`);
          return;
        }
        const name = await importOpfs();
        if (name === null) return;
        const next = { ...readSettings(), opfsEpoch: readSettings().opfsEpoch + 1 };
        writeSettings(next);
        setSettings(next);
        attempt.current += 1;
        const token = attempt.current;
        install(await openOpfs(next), token);
        setNotice(`Imported ${name}.`);
      };
      void run().catch((reason: unknown) => {
        setError(messageOf(reason));
      });
    },
    [install],
  );

  // Restores the saved mode once, on load. A folder waits for its gesture.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    // `?bench=<nodes>` is how `e2e/perf.spec.ts` gets the 5,000-node tree of docs/10 section 5.
    // It stands in for the saved workspace without replacing it, so a reload without the
    // parameter is back to whatever the user had.
    // The host owns its URL; the rule this suppresses exists to keep `packages/` off it.
    // eslint-disable-next-line no-restricted-syntax
    const bench = benchSize(window.location.search);
    if (bench !== null) {
      attempt.current += 1;
      if (install(benchProvider(bench), attempt.current)) setStatus('ready');
      return;
    }
    const saved = readSettings();
    // Nothing chosen yet, or a folder, whose permission prompt needs a gesture.
    if (saved.mode === null || saved.mode === 'folder') return;
    if (saved.mode === 'remote' && saved.baseUrl === '') return;
    open(saved.mode);
  }, [open, install]);

  return { settings, status, provider, error, notice, open, leave, transfer };
}
