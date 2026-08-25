import { describe, expect, it } from 'vitest';
import { classifyFidelity } from './fidelity.js';
import { createCodec, defaultCodec, markdownToValue } from './codec.js';
import { splitFrontmatter } from '../frontmatter.js';
import { loadCorpus } from '../testing/fixtures.js';

const corpus = await loadCorpus();

const bodyOf = (path: string): string => splitFrontmatter(corpus.read(path)).body;
const classify = (body: string): ReturnType<typeof classifyFidelity> =>
  classifyFidelity(body, markdownToValue(body));

describe('corpus', () => {
  it.each(corpus.manifest.pages.map((page) => [page.path, page.fidelity] as const))(
    'classifies %s as the manifest declares',
    (path, fidelity) => {
      expect(classify(bodyOf(path))).toEqual({
        ...fidelity,
        reasons: [...fidelity.reasons].sort(),
      });
    },
  );
});

describe('levels', () => {
  it('calls a byte-identical round trip exact, whitespace aside', () => {
    expect(classify('# Title\n\nBody.\n')).toEqual({ level: 'exact', reasons: [] });
    // Trailing whitespace, CRLF and a missing final newline are not a rewrite.
    expect(classify('# Title\r\n\r\nBody.  ')).toEqual({ level: 'exact', reasons: [] });
  });

  it('calls a pure restyle a reformat with no reasons', () => {
    // Stars for bullets and underscores for emphasis, both pinned to the other choice.
    expect(classify('* one\n* two\n')).toEqual({ level: 'reformat', reasons: [] });
    expect(classify('_word_\n')).toEqual({ level: 'reformat', reasons: [] });
  });

  it('clamps a heading below h3 and says so', () => {
    expect(classify('#### Deep\n')).toEqual({
      level: 'reformat',
      reasons: ['heading_level_clamped'],
    });
    // An h3 is the last supported level, so nothing is clamped.
    expect(classify('### Deep\n')).toEqual({ level: 'exact', reasons: [] });
  });

  it('reports reference links as a reformat, definition and all', () => {
    const body = 'See [the notes][n].\n\n[n]: ./notes.md\n';
    expect(classify(body)).toEqual({ level: 'reformat', reasons: ['definition'] });
  });

  it('reports a footnote as lossy: nothing in the v1 kit renders one', () => {
    // The continuation line comes back indented, which is what takes this off `exact`.
    expect(classify('Text[^a].\n\n[^a]: The note,\nwrapped.\n')).toEqual({
      level: 'lossy',
      reasons: ['footnoteDefinition'],
    });
  });

  it('still calls a footnote exact when the file comes back byte for byte', () => {
    // Step 1 of docs/05 section 4 wins: fidelity is about the file, not about what the
    // editor can render. A save is a no-op here, so there is nothing to warn about.
    expect(classify('Text[^a].\n\n[^a]: The note.\n')).toEqual({ level: 'exact', reasons: [] });
  });

  it('collects every reason on a page that has more than one', () => {
    const body = '#### Deep\n\nSee [n][n].\n\n[n]: ./n.md\n';
    expect(classify(body)).toEqual({
      level: 'reformat',
      reasons: ['definition', 'heading_level_clamped'],
    });
  });
});

describe('raw HTML', () => {
  it('is exact under the default codec, which keeps it byte for byte (DEV-003)', () => {
    expect(classify('<details>\n<summary>More</summary>\n\nText.\n\n</details>\n')).toEqual({
      level: 'exact',
      reasons: [],
    });
  });

  it('is lossy under a codec whose rules drop it', () => {
    // A host may override the html rule; the classifier judges the codec it is given.
    const codec = createCodec({ rules: { html: { deserialize: () => [] } } });
    const body = '#### Deep\n\n<!-- a note -->\n';
    const fidelity = classifyFidelity(body, codec.toValue(body), codec);
    expect(fidelity).toEqual({ level: 'lossy', reasons: ['heading_level_clamped', 'html'] });
  });
});

describe('unexplained differences', () => {
  it('names an unknown node type that the round trip drops', () => {
    // A rule that flattens a blockquote into a paragraph stands in for a node type no
    // plugin in the kit knows about: the text survives, the node type does not.
    const codec = createCodec({
      rules: {
        blockquote: { deserialize: () => ({ children: [{ text: 'Quoted.' }], type: 'p' }) },
      },
    });
    const body = '> Quoted.\n';
    expect(classifyFidelity(body, codec.toValue(body), codec)).toEqual({
      level: 'lossy',
      reasons: ['unknown_node:blockquote'],
    });
  });

  it('falls back to content_changed when the trees differ and nothing named it', () => {
    // A rule that rewrites text keeps every node type, so only the comparison catches it.
    const codec = createCodec({
      rules: { text: { deserialize: (node: { value: string }) => ({ text: `${node.value}!` }) } },
    });
    const body = 'Hello\n';
    expect(classifyFidelity(body, codec.toValue(body), codec)).toEqual({
      level: 'lossy',
      reasons: ['content_changed'],
    });
  });
});

describe('codec argument', () => {
  it('defaults to the shared codec', () => {
    const body = '#### Deep\n';
    expect(classifyFidelity(body, defaultCodec.toValue(body))).toEqual(
      classifyFidelity(body, defaultCodec.toValue(body), defaultCodec),
    );
  });
});
