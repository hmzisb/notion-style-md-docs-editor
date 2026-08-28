import type { PageIcon } from '../model.js';

/**
 * Loader for `fixtures/corpus` (docs/10 section 6). The manifest is the spec: tests
 * assert against it, and a new page means a new entry rather than a re-frozen baseline.
 *
 * Node built-ins are imported lazily so that `@hmzisb/notion-docs-core/testing` stays loadable in a
 * browser test environment, where the conformance suite runs and this loader does not.
 */

export type { FidelityLevel } from '../codec/fidelity.js';
import type { FidelityLevel } from '../codec/fidelity.js';

export interface CorpusFidelity {
  level: FidelityLevel;
  /** Declared cause for a non-`exact` level; empty when the level needs no explanation. */
  reasons: string[];
}

export interface CorpusPage {
  path: string;
  kind: 'page';
  title: string;
  /** Path of the owning node: an index page's file path, or a folder's directory path. */
  parentPath: string | null;
  order: number | null;
  icon: PageIcon | null;
  hasFrontmatter: boolean;
  eol: 'lf' | 'crlf';
  bytes: number;
  fidelity: CorpusFidelity;
  exactRoundTrip: boolean;
  /** Feature tags, so a test can prove the corpus still covers a requirement. */
  covers: string[];
}

export interface CorpusFolder {
  path: string;
  kind: 'folder';
  title: string;
  parentPath: string | null;
}

export interface CorpusManifest {
  version: number;
  description: string;
  counts: { pages: number; folders: number; assets: number; ignored: number; rules: number };
  pages: CorpusPage[];
  folders: CorpusFolder[];
  assets: string[];
  ignored: string[];
  rules: string[];
}

export interface Corpus {
  /** Absolute path of `fixtures/corpus`. */
  root: string;
  manifest: CorpusManifest;
  /** Raw text of every page and rule fixture, keyed by corpus-relative path. Line endings are as stored. */
  files: ReadonlyMap<string, string>;
  /** Raw bytes of every non-Markdown asset, keyed by corpus-relative path. */
  assets: ReadonlyMap<string, Uint8Array>;
  /** Text of one page or rule fixture. Throws on an unknown path rather than returning undefined. */
  read(path: string): string;
}

export interface LoadCorpusOptions {
  /** Absolute path of a corpus directory. Defaults to `fixtures/corpus` in this repo. */
  root?: string;
}

async function defaultRoot(): Promise<string> {
  const url = await import('node:url');
  const path = await import('node:path');
  // Not `new URL('...', import.meta.url)`: Vite rewrites that pattern into an asset URL, which
  // under jsdom comes back as `http://localhost/@fs/...` instead of a path (docs/10 section 1).
  return path.resolve(
    path.dirname(url.fileURLToPath(import.meta.url)),
    '../../../../fixtures/corpus',
  );
}

export async function loadCorpus(opts: LoadCorpusOptions = {}): Promise<Corpus> {
  const { readFile } = await import('node:fs/promises');
  const root = opts.root ?? (await defaultRoot());

  const readText = async (rel: string): Promise<string> => readFile(`${root}/${rel}`, 'utf8');

  const manifest = JSON.parse(await readText('manifest.json')) as CorpusManifest;

  const textPaths = [
    ...manifest.pages.map((page) => page.path),
    ...manifest.rules.map((r) => `rules/${r}`),
  ];
  const files = new Map<string, string>(
    await Promise.all(textPaths.map(async (rel) => [rel, await readText(rel)] as const)),
  );
  const assets = new Map<string, Uint8Array>(
    await Promise.all(
      manifest.assets.map(
        async (rel) => [rel, new Uint8Array(await readFile(`${root}/${rel}`))] as const,
      ),
    ),
  );

  return {
    root,
    manifest,
    files,
    assets,
    read(path: string): string {
      const text = files.get(path);
      if (text === undefined) throw new Error(`corpus: no fixture at ${path}`);
      return text;
    },
  };
}
