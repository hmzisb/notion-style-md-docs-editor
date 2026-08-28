import type { DocumentProvider } from '@hmzisb/notion-docs-core';
import {
  createFileSystemProvider,
  exportToDirectory,
  getOpfsRoot,
  importFromDirectory,
  pickDirectory,
} from '@hmzisb/notion-docs-react/adapters/filesystem';
import { createHttpProvider } from '@hmzisb/notion-docs-react/adapters/http';
import { createMemoryProvider } from '@hmzisb/notion-docs-react/adapters/memory';

/** Demo mode is the corpus, bundled as text at build time (docs/09 P1-T05). */
const CORPUS_PREFIX = '../../../fixtures/corpus/';

const corpus = import.meta.glob<string>('../../../fixtures/corpus/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** The images the corpus links to, inlined by Vite so they need no server of their own. */
const assets = import.meta.glob<string>(
  '../../../fixtures/corpus/**/*.{png,svg,jpg,jpeg,gif,webp}',
  {
    query: '?inline',
    import: 'default',
    eager: true,
  },
);

const demoFiles: Record<string, string | Uint8Array> = {
  ...Object.fromEntries(
    Object.entries(corpus).map(([path, text]) => [path.slice(CORPUS_PREFIX.length), text]),
  ),
  ...Object.fromEntries(
    Object.entries(assets).map(([path, url]) => [path.slice(CORPUS_PREFIX.length), bytesOf(url)]),
  ),
};

/** `?inline` gives a data URL; the store wants the bytes behind it. */
function bytesOf(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  const head = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const text = head.endsWith(';base64') ? atob(body) : decodeURIComponent(body);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
  return bytes;
}

/* --------------------------------------------------------------------------- modes */

/** docs/01 section 5.7: the four ways into the playground. */
export type Mode = 'demo' | 'folder' | 'opfs' | 'remote';

export const OPFS_DIR = 'workspace';

/**
 * What survives a reload. `folder.slot` is the picker id the handle is filed under: a new
 * slot per pick is what keeps two folders of the same name in two cache namespaces, and
 * `opfsEpoch` does the same for an import, which replaces the workspace wholesale.
 */
export interface WorkspaceSettings {
  /** `null` until the user picks one, which is what puts the landing first on a first visit. */
  mode: Mode | null;
  baseUrl: string;
  folder: { slot: number; name: string } | null;
  opfsEpoch: number;
}

const SETTINGS_KEY = 'playground:workspace';

const DEFAULTS: WorkspaceSettings = { mode: null, baseUrl: '', folder: null, opfsEpoch: 0 };

export function readSettings(): WorkspaceSettings {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    if (raw === null || typeof raw !== 'object') return DEFAULTS;
    const saved = raw as Partial<WorkspaceSettings>;
    return {
      mode: isMode(saved.mode) ? saved.mode : null,
      baseUrl: typeof saved.baseUrl === 'string' ? saved.baseUrl : '',
      folder: isFolder(saved.folder) ? saved.folder : null,
      opfsEpoch: typeof saved.opfsEpoch === 'number' ? saved.opfsEpoch : 0,
    };
  } catch {
    // A corrupt or blocked store must not keep the app off the landing.
    return DEFAULTS;
  }
}

export function writeSettings(settings: WorkspaceSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Private mode: the playground still works, it just forgets the choice.
  }
}

const isMode = (value: unknown): value is Mode =>
  value === 'demo' || value === 'folder' || value === 'opfs' || value === 'remote';

const isFolder = (value: unknown): value is { slot: number; name: string } =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { slot?: unknown }).slot === 'number' &&
  typeof (value as { name?: unknown }).name === 'string';

/* ----------------------------------------------------------------------- providers */

/** One instance per browser session: a fresh memory provider would drop every demo edit. */
let demo: DocumentProvider | null = null;

export function demoProvider(): DocumentProvider {
  demo ??= createMemoryProvider({ files: demoFiles });
  return demo;
}

export const folderSupported = (): boolean =>
  typeof window !== 'undefined' && 'showDirectoryPicker' in window;

// `navigator.storage` is the part that can be missing, not just `getDirectory`: WebKit does not
// expose it on Linux at all, and reading through it there threw where the landing renders. The
// DOM lib declares it as always present, which is why this asks with `in` rather than `?.`.
export const opfsSupported = (): boolean =>
  typeof navigator !== 'undefined' &&
  'storage' in navigator &&
  typeof navigator.storage.getDirectory === 'function';

/**
 * Reuses the handle saved under the current slot, which only costs a permission prompt on
 * the gesture that called this. `fresh` takes the next slot instead, so the picker opens and
 * the new folder gets a cache namespace of its own.
 */
export async function openFolder(
  settings: WorkspaceSettings,
  fresh: boolean,
): Promise<{ provider: DocumentProvider; settings: WorkspaceSettings } | null> {
  const slot = fresh ? (settings.folder?.slot ?? -1) + 1 : (settings.folder?.slot ?? 0);
  const handle = await pickDirectory({ mode: 'readwrite', id: `playground-${String(slot)}` });
  if (handle === null) return null;

  return {
    provider: createFileSystemProvider(handle, {
      key: `fs:${String(slot)}:${handle.name}`,
      title: handle.name,
      indexCache: true,
      watch: true,
    }),
    settings: { ...settings, mode: 'folder', folder: { slot, name: handle.name } },
  };
}

export async function openOpfs(settings: WorkspaceSettings): Promise<DocumentProvider> {
  const root = await getOpfsRoot(OPFS_DIR);
  return createFileSystemProvider(root, {
    // The epoch changes on import, which is a different workspace behind the same folder.
    key: `opfs:${OPFS_DIR}:${String(settings.opfsEpoch)}`,
    title: 'Browser storage',
    indexCache: true,
    // Another tab writes to the same OPFS folder, and an import writes to it from this one.
    watch: true,
  });
}

export function openRemote(baseUrl: string): DocumentProvider {
  return createHttpProvider({ baseUrl });
}

/** Copies the browser workspace out to a folder the user picks. */
export async function exportOpfs(): Promise<string | null> {
  const target = await pickDirectory({ mode: 'readwrite' });
  if (target === null) return null;
  await exportToDirectory(await getOpfsRoot(OPFS_DIR), target);
  return target.name;
}

/** Replaces the browser workspace with a folder the user picks. Destructive, so it confirms. */
export async function importOpfs(): Promise<string | null> {
  const source = await pickDirectory({ mode: 'read' });
  if (source === null) return null;
  await importFromDirectory(source, await getOpfsRoot(OPFS_DIR), { clear: true });
  return source.name;
}

/* ---------------------------------------------------------------------------- bench */

const BENCH_FANOUT = 10;
/** A hostile `?bench=` must not hang the tab; nothing needs more than this to measure. */
const BENCH_MAX = 20_000;

/**
 * docs/10 section 5 budgets the tree on a 5,000-node fixture. This is the shape
 * `fixtures/perf/gen.ts` writes to disk - ten children per level, index pages down to depth
 * three - built in memory instead, because the browser cannot read that corpus off disk.
 */
export function benchFiles(nodes: number): Record<string, string> {
  const page = (title: string, order: number): string =>
    `---\ntitle: ${title}\norder: ${String(order)}\n---\n\n# ${title}\n\nGenerated page.\n`;

  const files: Record<string, string> = { 'index.md': page('Perf corpus', 10) };
  let written = 1;
  const queue: [rel: string, depth: number][] = [['', 0]];
  for (let head = 0; head < queue.length && written < nodes; head += 1) {
    const entry = queue[head];
    if (entry === undefined) break;
    const [parent, depth] = entry;
    for (let i = 1; i <= BENCH_FANOUT && written < nodes; i += 1) {
      const slug = `${depth === 0 ? 'section' : 'topic'}-${String(i)}`;
      const rel = parent === '' ? slug : `${parent}/${slug}`;
      if (depth < 3) {
        files[`${rel}/index.md`] = page(`Section ${rel}`, i * 10);
        queue.push([rel, depth + 1]);
      } else {
        files[`${rel}.md`] = page(`Page ${rel}`, i * 10);
      }
      written += 1;
    }
  }
  return files;
}

/** `?bench=<nodes>` opens a generated workspace of that size. Not a mode: nothing is saved. */
export function benchSize(search: string): number | null {
  const raw = new URLSearchParams(search).get('bench');
  if (raw === null) return null;
  const nodes = Number(raw);
  return Number.isFinite(nodes) && nodes > 0 ? Math.min(Math.floor(nodes), BENCH_MAX) : null;
}

export function benchProvider(nodes: number): DocumentProvider {
  return createMemoryProvider({ files: benchFiles(nodes) }, { key: `bench:${String(nodes)}` });
}
