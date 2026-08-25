import { describe, expect, it } from 'vitest';
import {
  MAX_SLUG_LENGTH,
  assetBaseFor,
  basename,
  dirPathFor,
  dirname,
  extname,
  humanize,
  isHidden,
  isIndex,
  isMarkdown,
  joinPath,
  normalizePath,
  pagePathFor,
  slugify,
  stem,
  titleFromPath,
  uniqueSlug,
} from './paths.js';

describe('path primitives', () => {
  const cases: [path: string, dir: string, base: string, ext: string, stem: string][] = [
    ['a.md', '', 'a.md', '.md', 'a'],
    ['guides/auth.md', 'guides', 'auth.md', '.md', 'auth'],
    ['guides/auth/index.md', 'guides/auth', 'index.md', '.md', 'index'],
    ['assets/logo.png', 'assets', 'logo.png', '.png', 'logo'],
    ['.hidden', '', '.hidden', '', '.hidden'],
    ['a/b/c.tar.gz', 'a/b', 'c.tar.gz', '.gz', 'c.tar'],
  ];
  for (const [path, dir, base, ext, st] of cases) {
    it(`splits ${path}`, () => {
      expect(dirname(path)).toBe(dir);
      expect(basename(path)).toBe(base);
      expect(extname(path)).toBe(ext);
      expect(stem(path)).toBe(st);
    });
  }

  it('joins skipping empty segments', () => {
    expect(joinPath('', 'a.md')).toBe('a.md');
    expect(joinPath('guides', 'auth', 'index.md')).toBe('guides/auth/index.md');
  });

  it('classifies markdown, index and hidden entries', () => {
    expect(isMarkdown('a.MD')).toBe(true);
    expect(isMarkdown('a.mdx')).toBe(false);
    expect(isIndex('a/index.md')).toBe(true);
    expect(isIndex('a/README.md')).toBe(true);
    expect(isIndex('a/readme.md')).toBe(false);
    expect(isHidden('.git/config')).toBe(true);
    expect(isHidden('a/node_modules/b.md')).toBe(true);
    expect(isHidden('a/b.md')).toBe(false);
  });
});

describe('normalizePath', () => {
  const rows: [input: string, expected: string | null][] = [
    ['a/b.md', 'a/b.md'],
    ['./a/b.md', 'a/b.md'],
    ['a//b.md', 'a/b.md'],
    ['a/./b.md', 'a/b.md'],
    ['a/c/../b.md', 'a/b.md'],
    ['a/b/../../c.md', 'c.md'],
    ['../secret.md', null],
    ['a/../../secret.md', null],
    ['', ''],
  ];
  for (const [input, expected] of rows) {
    it(`normalizes ${input || '(empty)'}`, () => {
      expect(normalizePath(input)).toBe(expected);
    });
  }
});

describe('slugify', () => {
  const rows: [title: string, slug: string][] = [
    ['Getting Started', 'getting-started'],
    ['Auth & Billing', 'auth-billing'],
    ['  spaced  out  ', 'spaced-out'],
    ['Ünïcodé Földing', 'unicode-folding'],
    ['Café Crème', 'cafe-creme'],
    ['ÅNGSTRÖM', 'angstrom'],
    ['中文标题', 'untitled'],
    ['🧠', 'untitled'],
    ['', 'untitled'],
    ['---', 'untitled'],
    ['C++ / C#', 'c-c'],
    ['v1.2.3 release', 'v1-2-3-release'],
    ['Ligature ﬁle', 'ligature-file'],
    ['Full-width ＡＢＣ', 'full-width-abc'],
  ];
  for (const [title, slug] of rows) {
    it(`slugs "${title}"`, () => {
      expect(slugify(title)).toBe(slug);
    });
  }

  it('caps at 64 characters without a trailing dash', () => {
    const slug = slugify('word '.repeat(40));
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('uniqueSlug', () => {
  it('returns the slug when free', () => {
    expect(uniqueSlug('auth', new Set())).toBe('auth');
  });

  it('suffixes on collision', () => {
    expect(uniqueSlug('auth', new Set(['auth']))).toBe('auth-2');
    expect(uniqueSlug('auth', new Set(['auth', 'auth-2', 'auth-3']))).toBe('auth-4');
  });

  it('keeps the suffixed slug within the length cap', () => {
    const long = 'a'.repeat(MAX_SLUG_LENGTH);
    const result = uniqueSlug(long, new Set([long]));
    expect(result.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(result.endsWith('-2')).toBe(true);
  });
});

describe('page paths', () => {
  it('builds a page path at the root and in a directory', () => {
    expect(pagePathFor('', 'intro')).toBe('intro.md');
    expect(pagePathFor('guides/auth', 'tokens')).toBe('guides/auth/tokens.md');
  });

  it('maps a page to the directory it owns', () => {
    expect(dirPathFor('guides/auth/index.md')).toBe('guides/auth');
    expect(dirPathFor('guides/auth/README.md')).toBe('guides/auth');
    expect(dirPathFor('guides/intro.md')).toBe('guides/intro');
    expect(dirPathFor('index.md')).toBe('');
  });

  it('resolves assets against the file directory', () => {
    expect(assetBaseFor('guides/auth/index.md')).toBe('guides/auth');
    expect(assetBaseFor('guides/intro.md')).toBe('guides');
  });
});

describe('titles', () => {
  it('humanizes separators and capitalises only the first word', () => {
    expect(humanize('auth-flow')).toBe('Auth flow');
    expect(humanize('meeting_notes')).toBe('Meeting notes');
    expect(humanize('API')).toBe('API');
    expect(humanize('')).toBe('');
  });

  it('uses the directory name for an index file', () => {
    expect(titleFromPath('guides/auth/index.md')).toBe('Auth');
    expect(titleFromPath('guides/auth/README.md')).toBe('Auth');
    expect(titleFromPath('guides/rest-api.md')).toBe('Rest api');
    expect(titleFromPath('index.md')).toBe('Index');
  });
});
