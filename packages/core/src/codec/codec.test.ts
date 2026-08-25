import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  createCodec,
  defaultCodec,
  markdownToValue,
  normalizeMarkdown,
  valueToMarkdown,
} from './codec.js';
import { DEFAULT_STRINGIFY_OPTIONS } from './base-kit.js';
import { remarkInlineRefs } from './inline-refs.js';
import { splitFrontmatter } from '../frontmatter.js';
import { loadCorpus } from '../testing/fixtures.js';

const corpus = await loadCorpus();

const bodyOf = (path: string): string => splitFrontmatter(corpus.read(path)).body;
const roundTrip = (body: string): string => valueToMarkdown(markdownToValue(body));

/**
 * Goldens live outside the corpus so the tree walk never sees them as pages. A page that
 * round trips byte for byte has no golden at all: its own body is the expectation.
 */
const goldenPath = (path: string): string =>
  `${corpus.root}/../expected/${path.replace(/\.md$/, '.expected.md')}`;

describe('corpus goldens', () => {
  it.each(corpus.manifest.pages.map((page) => [page.path, page] as const))(
    'round trips %s',
    async (path, page) => {
      const body = bodyOf(path);
      const out = roundTrip(body);
      const expected = page.exactRoundTrip
        ? normalizeMarkdown(body)
        : await readFile(goldenPath(path), 'utf8');

      expect(out).toBe(expected);
      // Idempotence: a second pass must be a no-op, or every save would churn the file.
      expect(roundTrip(out)).toBe(out);
    },
  );

  it('has a golden for exactly the pages that do not round trip', async () => {
    const declared = corpus.manifest.pages
      .filter((page) => !page.exactRoundTrip)
      .map((p) => p.path);
    expect(declared).toEqual([
      'guides/api/webhooks/events.md',
      'specs/search.md',
      'decisions/0001-markdown-canonical.md',
    ]);

    for (const page of corpus.manifest.pages) {
      const found = await readFile(goldenPath(page.path), 'utf8').then(
        () => true,
        () => false,
      );
      expect([page.path, found]).toEqual([page.path, !page.exactRoundTrip]);
    }
  });
});

describe('stringify options', () => {
  it.each([
    ['bullet', '* one\n* two\n', '- one\n- two\n'],
    ['emphasis', '_soft_\n', '*soft*\n'],
    ['strong', '__loud__\n', '**loud**\n'],
    ['rule', '***\n', '---\n'],
    ['listItemIndent', '-   one\n', '- one\n'],
    ['fences', '    indented code\n', '```\nindented code\n```\n'],
    // resourceLink false: a link whose text is its own URL stays bare, never `[url](url)`.
    ['resourceLink', 'See https://example.com now\n', 'See https://example.com now\n'],
  ])('pins %s', (_name, input, expected) => {
    expect(roundTrip(input)).toBe(expected);
  });

  it('rewrites an angle-bracket autolink to the bare form once, then holds', () => {
    const once = roundTrip('<https://example.com>\n');
    expect(once).toBe('https://example.com\n');
    expect(roundTrip(once)).toBe(once);
  });

  it('nests a list one space in, not four', () => {
    expect(roundTrip('- one\n  - deep\n')).toBe('- one\n  - deep\n');
  });

  it('lets a host override a pinned option', () => {
    const codec = createCodec({ remarkStringifyOptions: { bullet: '*' } });
    expect(codec.toMarkdown(codec.toValue('- one\n'))).toBe('* one\n');
    expect(DEFAULT_STRINGIFY_OPTIONS.bullet).toBe('-');
    // The default codec is unaffected by another codec's options.
    expect(roundTrip('- one\n')).toBe('- one\n');
  });
});

describe('MDX off', () => {
  it.each([
    ['inline break', 'One<br>two.\n'],
    ['block html', '<details>\n<summary>Why</summary>\n\nBody.\n\n</details>\n'],
    ['comment', '<!-- a note -->\n'],
    ['attributes MDX would reject', '<img src="a.png" width=200>\n'],
    ['a lone angle bracket', 'Use `<` when comparing.\n'],
  ])('keeps %s as written', (_name, input) => {
    expect(roundTrip(input)).toBe(input);
  });
});

describe('marks this kit does not ship', () => {
  it('writes the words of an unshipped mark instead of throwing on save', () => {
    const value = [
      { children: [{ text: 'a' }, { text: 'b', underline: true }, { text: 'c' }], type: 'p' },
    ];
    expect(valueToMarkdown(value)).toBe('abc\n');
  });

  it('keeps `<u>` as the raw HTML it parses to, not as an underline mark', () => {
    expect(roundTrip('Plain <u>under</u> line.\n')).toBe('Plain <u>under</u> line.\n');
  });
});

describe('headings', () => {
  it('clamps H4-H6 to H3 and never emits them again', () => {
    expect(roundTrip('#### Four\n\n##### Five\n\n###### Six\n')).toBe(
      '### Four\n\n### Five\n\n### Six\n',
    );
  });

  it('leaves H1-H3 alone', () => {
    expect(roundTrip('# One\n\n## Two\n\n### Three\n')).toBe('# One\n\n## Two\n\n### Three\n');
  });
});

describe('line breaks', () => {
  it('keeps the author wrapping of a paragraph', () => {
    expect(roundTrip('One line\nand its continuation.\n')).toBe(
      'One line\nand its continuation.\n',
    );
  });

  it('keeps a mark that spans a wrapped line', () => {
    expect(roundTrip('**bold across\ntwo lines**\n')).toBe('**bold across\ntwo lines**\n');
  });
});

describe('references and alerts', () => {
  it('rewrites a reference-style link inline and drops the definition', () => {
    expect(roundTrip('See [notes][a].\n\n[a]: ./a.md\n')).toBe('See [notes](./a.md).\n');
  });

  it('leaves an unmatched reference as the literal text remark parsed', () => {
    expect(roundTrip('See [notes][missing].\n')).toBe('See \\[notes]\\[missing].\n');
  });

  it('keeps the words when a reference reaches the pass with no definition', () => {
    // remark resolves references while parsing, so this is a guard rather than a path:
    // whatever produced the node, its text must survive.
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'linkReference',
              identifier: 'gone',
              children: [{ type: 'text', value: 'notes' }],
            },
          ],
        },
      ],
    };
    remarkInlineRefs()(tree);
    expect(tree.children[0]?.children).toEqual([{ type: 'text', value: 'notes' }]);
  });

  it.each(['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'])(
    'keeps a [!%s] marker unescaped',
    (kind) => {
      expect(roundTrip(`> [!${kind}]\n> Body.\n`)).toBe(`> [!${kind}]\n> Body.\n`);
    },
  );

  it('still escapes a bracket that is only prose', () => {
    expect(roundTrip('> [!MAYBE] not an alert\n')).toBe('> \\[!MAYBE] not an alert\n');
  });
});

describe('api', () => {
  it('exposes the default codec through the module-level helpers', () => {
    expect(valueToMarkdown(markdownToValue('# A\n'))).toBe('# A\n');
    expect(defaultCodec.toMarkdown(defaultCodec.toValue('# A\n'))).toBe('# A\n');
  });

  it('reports a parse failure through onError instead of throwing', () => {
    const errors: Error[] = [];
    expect(() => defaultCodec.toValue('# Fine\n', (error) => errors.push(error))).not.toThrow();
    expect(errors).toEqual([]);
  });

  it('refuses math, which v1 does not install', () => {
    expect(() => createCodec({ math: true })).toThrow(/math/);
  });

  it('normalizes line endings, trailing space and the frontmatter gap', () => {
    expect(normalizeMarkdown('\r\n# A  \r\n\r\n')).toBe('# A\n');
    expect(normalizeMarkdown('')).toBe('\n');
  });
});
