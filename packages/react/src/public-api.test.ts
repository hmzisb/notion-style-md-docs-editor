import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * docs/08 section 2 is the list a host reads before installing anything, and a list nobody runs
 * is a list that rots: it promised `useSearch` and four mutation hooks that the root entry did
 * not export. So it is parsed here and compared with what the entry points actually export -
 * `complete` for an entry small enough to write down whole, `headline` for `@hmzisb/notion-docs-core`, whose
 * 146 names would drown the page.
 */

/** Walked up rather than derived from `import.meta.url`, which is not a file URL under jsdom. */
function repoRoot(): string {
  let at = process.cwd();
  while (!existsSync(resolve(at, 'pnpm-workspace.yaml'))) {
    const up = dirname(at);
    if (up === at) throw new Error('no pnpm-workspace.yaml above the working directory');
    at = up;
  }
  return `${at}/`;
}

const ROOT = repoRoot();
const read = (path: string): string => readFileSync(ROOT + path, 'utf8');

/** Documented path -> source entry. The package `exports` map is checked against these keys. */
const ENTRIES: Record<string, string> = {
  '@hmzisb/notion-docs-core': 'packages/core/src/index.ts',
  '@hmzisb/notion-docs-core/testing': 'packages/core/src/testing/index.ts',
  '@hmzisb/notion-docs-react': 'packages/react/src/index.ts',
  '@hmzisb/notion-docs-react/tree': 'packages/react/src/tree/index.ts',
  '@hmzisb/notion-docs-react/editor': 'packages/react/src/editor/index.ts',
  '@hmzisb/notion-docs-react/view': 'packages/react/src/view/index.ts',
  '@hmzisb/notion-docs-react/shell': 'packages/react/src/shell/index.ts',
  '@hmzisb/notion-docs-react/adapters/http': 'packages/react/src/adapters/http.ts',
  '@hmzisb/notion-docs-react/adapters/filesystem': 'packages/react/src/adapters/filesystem.ts',
  '@hmzisb/notion-docs-react/adapters/memory': 'packages/react/src/adapters/memory.ts',
};

interface Documented {
  mode: 'complete' | 'headline';
  names: string[];
}

/** The fenced block between the markers: `<path>  <mode>` then its names, indented. */
function parseDocs(): Map<string, Documented> {
  const markdown = read('docs/08-PUBLIC-API.md');
  const between = markdown.split('<!-- exports:start -->')[1]?.split('<!-- exports:end -->')[0];
  if (between === undefined) throw new Error('docs/08 section 2 has lost its exports markers');
  // `[1]` is the fenced block, and its first line is the language tag.
  const fence = (between.split('```')[1] ?? '').split('\n').slice(1).join('\n');
  const out = new Map<string, Documented>();
  for (const block of fence.trim().split(/\n\s*\n/)) {
    const [head, ...rest] = block.split('\n');
    const [path, mode] = (head ?? '').trim().split(/\s+/);
    if (path === undefined || (mode !== 'complete' && mode !== 'headline')) {
      throw new Error(`docs/08 exports block has a bad header: ${String(head)}`);
    }
    out.set(path, {
      mode,
      names: rest
        .join(' ')
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name.length > 0),
    });
  }
  return out;
}

/** Every name an entry exports, types included, from the source rather than from a build. */
function actualExports(): Map<string, Set<string>> {
  const config = ts.readConfigFile(ROOT + 'tsconfig.base.json', (file) => ts.sys.readFile(file));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT);
  const files = Object.values(ENTRIES).map((file) => ROOT + file);
  const program = ts.createProgram(files, { ...parsed.options, noEmit: true });
  const checker = program.getTypeChecker();
  const out = new Map<string, Set<string>>();
  for (const [path, file] of Object.entries(ENTRIES)) {
    const source = program.getSourceFile(ROOT + file);
    const symbol = source === undefined ? undefined : checker.getSymbolAtLocation(source);
    if (symbol === undefined) throw new Error(`${path} has no module symbol: ${file}`);
    out.set(path, new Set(checker.getExportsOfModule(symbol).map((entry) => entry.getName())));
  }
  return out;
}

const documented = parseDocs();
const actual = actualExports();
/** The root entry re-exports core's types wholesale, and those are documented under core. */
const own = (path: string): Set<string> => {
  const names = actual.get(path) ?? new Set<string>();
  if (path !== '@hmzisb/notion-docs-react') return names;
  const core = actual.get('@hmzisb/notion-docs-core') ?? new Set<string>();
  return new Set([...names].filter((name) => !core.has(name)));
};

describe('docs/08 section 2 matches the entry points', () => {
  it.each([...documented.keys()])('%s exports what docs/08 says it does', (path) => {
    const doc = documented.get(path);
    expect(doc, 'documented entry').toBeDefined();
    if (doc === undefined) return;
    const names = own(path);
    expect(
      [...doc.names].filter((name) => !names.has(name)),
      'documented but not exported',
    ).toEqual([]);
    if (doc.mode === 'complete') {
      const undocumented = [...names].filter((name) => !doc.names.includes(name));
      expect(undocumented, 'exported but not documented').toEqual([]);
    }
  });

  it('re-exports the core types from the root entry', () => {
    const core = actual.get('@hmzisb/notion-docs-core') ?? new Set<string>();
    const root = actual.get('@hmzisb/notion-docs-react') ?? new Set<string>();
    expect(
      [...core].filter((name) => !root.has(name)),
      'lost from `export type *`',
    ).toEqual([]);
  });

  it.each([
    ['@hmzisb/notion-docs-core', 'packages/core/package.json'],
    ['@hmzisb/notion-docs-react', 'packages/react/package.json'],
  ])('%s has an exports map that matches the documented paths', (name, file) => {
    const map = JSON.parse(read(file)) as { exports: Record<string, unknown> };
    const published = Object.keys(map.exports)
      .filter((key) => key !== './package.json' && !key.endsWith('.css'))
      .map((key) => (key === '.' ? name : `${name}${key.slice(1)}`))
      .sort();
    const listed = [...documented.keys()]
      .filter((path) => path === name || path.startsWith(`${name}/`))
      .sort();
    expect(published).toEqual(listed);
  });
});
