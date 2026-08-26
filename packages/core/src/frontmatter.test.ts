import { describe, expect, it } from 'vitest';
import { ProviderError } from './errors.js';
import {
  MAX_FRONTMATTER_BYTES,
  applyEol,
  detectEol,
  joinFrontmatter,
  setMetaKey,
  splitFrontmatter,
  toLf,
} from './frontmatter.js';

/** Every variant round-trips: split then join must reproduce the file byte for byte. */
const ROUND_TRIP: [name: string, file: string][] = [
  ['minimal', '---\ntitle: Hello\n---\n\n# Hello\n'],
  ['no frontmatter', '# Hello\n\nBody.\n'],
  ['empty frontmatter', '---\n---\n\nBody.\n'],
  [
    'all known keys',
    '---\nid: 01J0000000000000000000000\ntitle: Auth\nicon: "🧠"\norder: 3\n---\n\nBody.\n',
  ],
  ['lucide icon', '---\ntitle: API\nicon: lucide:book-open\n---\n\nBody.\n'],
  ['unknown keys preserved', '---\ntitle: A\ntags:\n  - one\n  - two\ndraft: true\n---\n\nBody.\n'],
  ['key order preserved', '---\nzeta: 1\ntitle: A\nalpha: 2\n---\n\nBody.\n'],
  ['nested object', '---\ntitle: A\nseo:\n  description: Hi\n  noindex: false\n---\n\nBody.\n'],
  [
    'array of objects',
    '---\ntitle: A\nauthors:\n  - name: Ada\n    email: ada@example.com\n---\n\nBody.\n',
  ],
  ['quoted string with colon', '---\ntitle: "A: B"\n---\n\nBody.\n'],
  ['date stays a string', '---\ntitle: A\nupdated: 2026-01-31\n---\n\nBody.\n'],
  ['number and boolean', '---\norder: 12\ndraft: false\n---\n\nBody.\n'],
  ['null value', '---\ntitle: A\nicon: null\n---\n\nBody.\n'],
  ['empty body', '---\ntitle: A\n---\n'],
  ['body starting with a rule', '---\ntitle: A\n---\n\n---\n\nBody.\n'],
  ['body containing delimiters', '---\ntitle: A\n---\n\nBefore.\n\n---\n\nAfter.\n'],
  ['unicode title', '---\ntitle: Ünïcodé — 中文 🧠\n---\n\nBody.\n'],
  ['long value not folded', `---\ntitle: ${'x'.repeat(200)}\n---\n\nBody.\n`],
  ['multiline block scalar', '---\ntitle: A\nsummary: |-\n  line one\n  line two\n---\n\nBody.\n'],
  ['deep mixed structure', '---\ntitle: A\nmatrix:\n  - - 1\n    - 2\n  - k: v\n---\n\nBody.\n'],
];

describe('splitFrontmatter / joinFrontmatter round trip', () => {
  for (const [name, file] of ROUND_TRIP) {
    it(`round-trips: ${name}`, () => {
      const source = splitFrontmatter(file);
      expect(joinFrontmatter(source.meta, source.body, source.eol, { source })).toBe(file);
    });

    it(`is idempotent: ${name}`, () => {
      const once = splitFrontmatter(file);
      const rendered = joinFrontmatter(once.meta, once.body, once.eol, { source: once });
      const twice = splitFrontmatter(rendered);
      expect(joinFrontmatter(twice.meta, twice.body, twice.eol, { source: twice })).toBe(rendered);
    });
  }
});

describe('splitFrontmatter', () => {
  it('separates meta from body', () => {
    const result = splitFrontmatter('---\ntitle: Hello\norder: 2\n---\n\n# Hello\n');
    expect(result.meta).toEqual({ title: 'Hello', order: 2 });
    expect(result.body).toBe('\n# Hello\n');
    expect(result.hasFrontmatter).toBe(true);
  });

  it('preserves unknown keys in their original order', () => {
    const result = splitFrontmatter('---\nzeta: 1\ntitle: A\nalpha: 2\n---\nBody\n');
    expect(Object.keys(result.meta)).toEqual(['zeta', 'title', 'alpha']);
  });

  it('reports the original line endings and normalises the body to LF', () => {
    const crlf = '---\r\ntitle: A\r\n---\r\n\r\n# H\r\n';
    const result = splitFrontmatter(crlf);
    expect(result.eol).toBe('crlf');
    expect(result.body).toBe('\n# H\n');
    expect(joinFrontmatter(result.meta, result.body, result.eol)).toBe(crlf);
  });

  it('treats an unterminated opening delimiter as body', () => {
    const result = splitFrontmatter('---\nnot really frontmatter\n\n# H\n');
    expect(result.hasFrontmatter).toBe(false);
    expect(result.meta).toEqual({});
    expect(result.body).toBe('---\nnot really frontmatter\n\n# H\n');
  });

  it('strips a BOM', () => {
    expect(splitFrontmatter('﻿---\ntitle: A\n---\nB\n').meta).toEqual({ title: 'A' });
  });

  it('rejects malformed YAML with a validation error', () => {
    expect(() => splitFrontmatter('---\ntitle: [unclosed\n---\nBody\n')).toThrow(ProviderError);
    try {
      splitFrontmatter('---\ntitle: [unclosed\n---\nBody\n');
    } catch (error) {
      expect((error as ProviderError).code).toBe('validation');
    }
  });

  it('rejects a non-mapping document', () => {
    expect(() => splitFrontmatter('---\n- a\n- b\n---\nBody\n')).toThrow(/mapping/);
  });

  it('rejects frontmatter above the size cap', () => {
    const huge = `---\nbig: ${'x'.repeat(MAX_FRONTMATTER_BYTES + 10)}\n---\nBody\n`;
    expect(() => splitFrontmatter(huge)).toThrow(/larger than/);
  });

  it('does not treat a mid-file delimiter as the opening one', () => {
    const result = splitFrontmatter('# H\n\n---\ntitle: A\n---\n');
    expect(result.hasFrontmatter).toBe(false);
  });
});

describe('joinFrontmatter', () => {
  it('writes body only when there is no meta', () => {
    expect(joinFrontmatter({}, '# H\n')).toBe('# H\n');
  });

  it('prepends frontmatter to a file that had none', () => {
    const source = splitFrontmatter('# Hello\n');
    const next = joinFrontmatter(setMetaKey(source.meta, 'id', 'abc'), source.body, source.eol, {
      source,
    });
    expect(next).toBe('---\nid: abc\n---\n\n# Hello\n');
  });

  it('keeps quoting and comments when only one key changes', () => {
    const file = '---\n# owner block\ntitle: "A: B"\nicon: "🧠"\n---\n\nBody.\n';
    const source = splitFrontmatter(file);
    const next = joinFrontmatter(setMetaKey(source.meta, 'id', 'abc'), source.body, source.eol, {
      source,
    });
    expect(next).toBe('---\n# owner block\ntitle: "A: B"\nicon: "🧠"\nid: abc\n---\n\nBody.\n');
  });

  it('leaves a value it did not change laid out the way the author wrote it', () => {
    // docs/03 section 4.5: the first write adds the id and touches nothing else. Re-emitting
    // the document would return `[ ada, grace ]` and drop the quotes around `done`.
    const file = "---\nattendees: [ada, grace]\nstatus: 'done'\n---\n\nBody.\n";
    const source = splitFrontmatter(file);
    const next = joinFrontmatter(setMetaKey(source.meta, 'id', 'abc'), source.body, source.eol, {
      source,
    });
    expect(next).toBe("---\nattendees: [ada, grace]\nstatus: 'done'\nid: abc\n---\n\nBody.\n");
  });

  it('keeps an empty block the author wrote', () => {
    const source = splitFrontmatter('---\n---\n\nBody.\n');
    expect(joinFrontmatter(source.meta, source.body, source.eol, { source })).toBe(
      '---\n---\n\nBody.\n',
    );
  });

  it('drops a key that was removed from the meta', () => {
    const source = splitFrontmatter('---\ntitle: A\ndraft: true\n---\n\nBody.\n');
    const { draft: _draft, ...rest } = source.meta;
    expect(joinFrontmatter(rest, source.body, source.eol, { source })).toBe(
      '---\ntitle: A\n---\n\nBody.\n',
    );
  });

  it('keeps the body verbatim apart from the EOL style', () => {
    const body = '\ntext with  double  spaces\nand\ttabs\n';
    const rendered = joinFrontmatter({ title: 'A' }, body);
    expect(rendered.endsWith(body)).toBe(true);
  });
});

describe('setMetaKey', () => {
  it('keeps the position of an existing key', () => {
    const meta = { zeta: 1, title: 'A', alpha: 2 };
    expect(Object.keys(setMetaKey(meta, 'title', 'B'))).toEqual(['zeta', 'title', 'alpha']);
  });

  it("appends a new known key after the author's own keys", () => {
    expect(Object.keys(setMetaKey({ zeta: 1 }, 'id', 'x'))).toEqual(['zeta', 'id']);
  });

  it('drops a key when the value is undefined', () => {
    expect(setMetaKey({ title: 'A', order: 1 }, 'order', undefined)).toEqual({ title: 'A' });
  });
});

describe('eol helpers', () => {
  it('detects and applies line endings', () => {
    expect(detectEol('a\r\nb')).toBe('crlf');
    expect(detectEol('a\nb')).toBe('lf');
    expect(toLf('a\r\nb')).toBe('a\nb');
    expect(applyEol('a\nb', 'crlf')).toBe('a\r\nb');
    expect(applyEol('a\nb', 'lf')).toBe('a\nb');
  });
});
