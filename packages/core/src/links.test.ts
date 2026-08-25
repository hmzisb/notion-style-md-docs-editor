import { describe, expect, it } from 'vitest';
import { buildIndex } from './tree.js';
import { normalizeRelative, parseHref, resolvePageLink } from './links.js';
import type { NodeId, NodeKind, TreeNode } from './model.js';

const node = (id: string, kind: NodeKind, path: string, childIds: string[] = []): TreeNode => ({
  id,
  kind,
  title: id,
  path,
  parentId: null,
  childIds,
});

/** Root index, a folder with an index page and a sibling page, a nested README folder. */
const index = buildIndex({
  version: 'v1',
  nodes: [
    node('p_home', 'page', 'index.md'),
    node('f_guides', 'folder', 'guides', ['p_guides_index', 'p_auth', 'f_api']),
    node('p_guides_index', 'page', 'guides/index.md'),
    node('p_auth', 'page', 'guides/auth.md'),
    node('f_api', 'folder', 'guides/api', ['p_api_readme', 'p_rate']),
    node('p_api_readme', 'page', 'guides/api/README.md'),
    node('p_rate', 'page', 'guides/api/rate limits.md'),
    node('f_notes', 'folder', 'notes', ['p_cafe']),
    node('p_cafe', 'page', 'notes/café.md'),
  ],
});

describe('resolvePageLink', () => {
  const rows: [label: string, from: string, href: string, expected: NodeId | null][] = [
    // relative
    ['explicit relative', 'guides/index.md', './auth.md', 'p_auth'],
    ['bare relative', 'guides/index.md', 'auth.md', 'p_auth'],
    ['extension omitted', 'guides/index.md', 'auth', 'p_auth'],
    ['sibling from sibling', 'guides/auth.md', './index.md', 'p_guides_index'],
    ['descending', 'index.md', 'guides/auth.md', 'p_auth'],
    ['descending, extension omitted', 'index.md', 'guides/auth', 'p_auth'],
    // parent
    ['parent file', 'guides/auth.md', '../index.md', 'p_home'],
    ['parent directory', 'guides/api/rate limits.md', '..', 'f_guides'],
    ['two levels up', 'guides/api/rate limits.md', '../../index.md', 'p_home'],
    ['current directory', 'guides/auth.md', './', 'f_guides'],
    ['current directory, no slash', 'guides/auth.md', '.', 'f_guides'],
    // dir form
    ['trailing slash on a page', 'guides/index.md', 'auth/', 'p_auth'],
    ['folder path', 'index.md', 'guides/api', 'f_api'],
    ['folder path with slash', 'index.md', 'guides/api/', 'f_api'],
    ['README index of a folder', 'guides/index.md', './api/README.md', 'p_api_readme'],
    // root-absolute
    ['root-absolute file', 'guides/api/rate limits.md', '/guides/auth.md', 'p_auth'],
    ['root-absolute folder', 'guides/auth.md', '/guides/api', 'f_api'],
    ['root itself', 'guides/auth.md', '/', 'p_home'],
    ['root index', 'guides/auth.md', '/index.md', 'p_home'],
    // fragments and queries
    ['fragment only', 'guides/auth.md', '#tokens', 'p_auth'],
    ['query only', 'guides/auth.md', '?v=2', 'p_auth'],
    ['path with fragment', 'guides/index.md', 'auth.md#tokens', 'p_auth'],
    ['path with query', 'guides/index.md', 'auth.md?v=2', 'p_auth'],
    ['path with query and fragment', 'guides/index.md', 'auth.md?v=2#tokens', 'p_auth'],
    ['folder with fragment', 'index.md', 'guides/api/#limits', 'f_api'],
    // percent-encoding
    ['encoded space', 'guides/api/README.md', 'rate%20limits.md', 'p_rate'],
    ['encoded non-ascii', 'index.md', 'notes/caf%C3%A9.md', 'p_cafe'],
    ['literal non-ascii', 'index.md', 'notes/café.md', 'p_cafe'],
    ['malformed encoding is kept literal', 'guides/index.md', 'auth%zz.md', null],
    // schemes and protocol-relative
    ['https', 'guides/auth.md', 'https://example.com/guides/auth.md', null],
    ['http', 'guides/auth.md', 'http://example.com', null],
    ['mailto', 'guides/auth.md', 'mailto:someone@example.com', null],
    ['tel', 'guides/auth.md', 'tel:+15551234', null],
    ['data', 'guides/auth.md', 'data:text/plain,hi', null],
    ['protocol-relative', 'guides/auth.md', '//example.com/guides/auth.md', null],
    // rejected
    ['traversal above root', 'guides/auth.md', '../../../etc/passwd', null],
    ['unknown page', 'guides/index.md', 'missing.md', null],
    ['empty href', 'guides/auth.md', '', null],
    ['parent of a root page', 'index.md', '../index.md', null],
  ];

  for (const [label, from, href, expected] of rows) {
    it(`${label}: ${href || '(empty)'} from ${from}`, () => {
      expect(resolvePageLink(from, href, index.idByPath)).toBe(expected);
    });
  }
});

describe('parseHref', () => {
  it('splits query and fragment', () => {
    expect(parseHref('auth.md?v=2#tokens')).toEqual({
      path: 'auth.md',
      query: 'v=2',
      fragment: 'tokens',
      external: false,
    });
  });

  it('returns the fragment for a same-page link', () => {
    expect(parseHref('#section-1')).toEqual({
      path: '',
      query: null,
      fragment: 'section-1',
      external: false,
    });
  });

  it('decodes the fragment and each path segment', () => {
    const parsed = parseHref('a%20b/caf%C3%A9.md#a%20b');
    expect(parsed.path).toBe('a b/café.md');
    expect(parsed.fragment).toBe('a b');
  });

  it('keeps a malformed percent sequence literal', () => {
    expect(parseHref('a%zz.md').path).toBe('a%zz.md');
  });

  it('flags schemes and protocol-relative hrefs without decoding them', () => {
    expect(parseHref('https://example.com/a%20b').external).toBe(true);
    expect(parseHref('//example.com/a%20b').external).toBe(true);
    expect(parseHref('mailto:a@b.com').external).toBe(true);
    expect(parseHref('./a.md').external).toBe(false);
  });

  it('treats a fragment before a question mark as part of the fragment', () => {
    expect(parseHref('a.md#frag?notquery')).toEqual({
      path: 'a.md',
      query: null,
      fragment: 'frag?notquery',
      external: false,
    });
  });
});

describe('normalizeRelative', () => {
  const rows: [from: string, href: string, expected: string | null][] = [
    ['guides/index.md', './auth.md', 'guides/auth.md'],
    ['guides/auth.md', '../index.md', 'index.md'],
    ['guides/auth.md', '/guides/api/', 'guides/api'],
    ['guides/auth.md', '#tokens', 'guides/auth.md'],
    ['guides/auth.md', 'https://example.com', null],
    ['index.md', '../x.md', null],
  ];
  for (const [from, href, expected] of rows) {
    it(`${href} from ${from}`, () => {
      expect(normalizeRelative(from, href)).toBe(expected);
    });
  }
});
