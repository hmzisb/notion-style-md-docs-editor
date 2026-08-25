import { describe, expect, it } from 'vitest';
import { loadCorpus, type CorpusPage } from './fixtures.js';
import { detectEol, splitFrontmatter } from '../frontmatter.js';
import { basename, dirname, isIndex } from '../fs/paths.js';

const corpus = await loadCorpus();
const { manifest } = corpus;
const byPath = new Map<string, CorpusPage>(manifest.pages.map((page) => [page.path, page]));

describe('corpus manifest', () => {
  it('loads and matches its own counts', () => {
    expect(manifest.counts).toEqual({
      pages: manifest.pages.length,
      folders: manifest.folders.length,
      assets: manifest.assets.length,
      ignored: manifest.ignored.length,
      rules: manifest.rules.length,
    });
  });

  it('has the 30 nested pages the plan asks for, across four levels', () => {
    expect(manifest.pages.length).toBeGreaterThanOrEqual(30);
    const depth = (path: string): number => path.split('/').length;
    expect(Math.max(...manifest.pages.map((page) => depth(page.path)))).toBeGreaterThanOrEqual(4);
  });

  it('covers the top-level sections named in the plan', () => {
    const roots = new Set(manifest.pages.map((page) => page.path.split('/')[0]));
    for (const section of ['product', 'guides', 'specs', 'decisions', 'meeting-notes']) {
      expect(roots).toContain(section);
    }
    expect(manifest.assets.some((path) => path.startsWith('assets/'))).toBe(true);
  });

  it('lists every page and rule fixture as a readable file', () => {
    for (const page of manifest.pages) expect(corpus.files.has(page.path)).toBe(true);
    for (const rule of manifest.rules) expect(corpus.files.has(`rules/${rule}`)).toBe(true);
    for (const path of manifest.assets) expect(corpus.assets.get(path)?.length).toBeGreaterThan(0);
  });

  it('throws on an unknown fixture rather than returning undefined', () => {
    expect(() => corpus.read('nope.md')).toThrow(/no fixture/);
  });

  it('never lists a hidden or vendored entry as a node', () => {
    const nodePaths = new Set([...manifest.pages.map((p) => p.path), ...manifest.folders.map((f) => f.path)]);
    for (const path of manifest.ignored) expect(nodePaths.has(path)).toBe(false);
    expect(manifest.ignored).toContain('.hidden/secret.md');
    expect(manifest.ignored).toContain('node_modules/pkg/readme.md');
  });

  it('names a parent that exists, except for the root page and the root folder', () => {
    const nodePaths = new Set([...byPath.keys(), ...manifest.folders.map((f) => f.path)]);
    for (const page of manifest.pages) {
      if (page.parentPath === null) {
        expect(page.path).toBe('index.md');
        continue;
      }
      expect(nodePaths.has(page.parentPath)).toBe(true);
    }
  });
});

describe('corpus files match their manifest entries', () => {
  for (const page of manifest.pages) {
    it(page.path, () => {
      const raw = corpus.read(page.path);
      expect(Buffer.byteLength(raw, 'utf8')).toBe(page.bytes);
      expect(detectEol(raw)).toBe(page.eol);

      const split = splitFrontmatter(raw);
      expect(split.hasFrontmatter).toBe(page.hasFrontmatter);

      // docs/03 section 4.3: meta.title wins, then the first H1, then the humanised stem.
      if (typeof split.meta.title === 'string') expect(split.meta.title).toBe(page.title);
      expect(split.meta.order ?? null).toBe(page.order);

      const icon = typeof split.meta.icon === 'string' ? split.meta.icon : null;
      if (page.icon === null) {
        expect(icon).toBe(null);
      } else if (page.icon.kind === 'lucide') {
        expect(icon).toBe(`lucide:${page.icon.name}`);
      } else {
        expect(icon).toBe(page.icon.value);
      }

      // An index page owns its directory; a leaf page never sits at a directory path.
      if (isIndex(page.path)) expect(page.parentPath).not.toBe(dirname(page.path));
    });
  }
});

describe('corpus coverage', () => {
  const covers = new Set(manifest.pages.flatMap((page) => page.covers));
  const required = [
    'no-frontmatter',
    'order',
    'emoji-icon',
    'lucide-icon',
    'readme-as-index',
    'relative-links',
    'relative-image',
    'table',
    'task-list',
    'nested-list',
    'mixed-list',
    'blockquote',
    'gfm-alert',
    'details-block',
    'html-comment',
    'reference-links',
    'footnote',
    'crlf',
    'large-body',
    'folder-node',
  ];
  for (const tag of required) {
    it(`covers ${tag}`, () => {
      expect(covers).toContain(tag);
    });
  }

  it('has code blocks in six languages', () => {
    const langs = new Set<string>();
    for (const page of manifest.pages) {
      for (const match of corpus.read(page.path).matchAll(/^```(\w+)$/gm)) {
        if (match[1] !== undefined) langs.add(match[1]);
      }
    }
    expect(langs.size).toBeGreaterThanOrEqual(6);
  });

  it('has a page of at least 60 KB', () => {
    expect(Math.max(...manifest.pages.map((page) => page.bytes))).toBeGreaterThanOrEqual(60 * 1024);
  });

  it('declares every fidelity level, with reasons on the ones that need them', () => {
    const levels = new Set(manifest.pages.map((page) => page.fidelity.level));
    expect(levels).toEqual(new Set(['exact', 'reformat', 'lossy']));
    for (const page of manifest.pages) {
      expect(page.exactRoundTrip).toBe(page.fidelity.level === 'exact');
      if (page.fidelity.level === 'lossy') expect(page.fidelity.reasons.length).toBeGreaterThan(0);
    }
    const reasons = new Set(manifest.pages.flatMap((page) => page.fidelity.reasons));
    expect(reasons).toContain('html');
    expect(reasons).toContain('footnoteDefinition');
    expect(reasons).toContain('definition');
  });

  it('keeps a golden fixture for every custom serialization rule', () => {
    expect(manifest.rules).toEqual(['callout.md', 'image-caption.md', 'toggle.md']);
    expect(corpus.read('rules/callout.md')).toContain('[!CAUTION]');
    expect(corpus.read('rules/toggle.md')).toContain('<summary>');
    expect(corpus.read('rules/image-caption.md')).toContain('*The caption');
  });

  it('keeps README-as-index and a folder without one', () => {
    expect(byPath.has('guides/billing/README.md')).toBe(true);
    expect(manifest.folders.map((f) => f.path)).toContain('archive');
    for (const page of manifest.pages) {
      if (page.parentPath === 'archive') expect(basename(page.path)).not.toBe('index.md');
    }
  });
});

