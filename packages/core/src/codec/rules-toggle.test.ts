import { describe, expect, it } from 'vitest';
import { KEYS, type TElement, type Value } from 'platejs';
import { markdownToValue, valueToMarkdown } from './codec.js';
import { classifyFidelity } from './fidelity.js';
import { splitFrontmatter } from '../frontmatter.js';
import { loadCorpus } from '../testing/fixtures.js';

/**
 * docs/05 section 5: a toggle is a `<details>` block, and the body of one is the blocks
 * indented under it. Both halves are tested through the codec, because the rule is a remark
 * pass and a value pass rather than one pair of functions.
 */

const corpus = await loadCorpus();
const fixture = splitFrontmatter(corpus.read('rules/toggle.md')).body;

const roundTrip = (body: string): string => valueToMarkdown(markdownToValue(body));
const blocks = (body: string): TElement[] => markdownToValue(body);

const toggle = (summary: string): TElement => ({
  children: [{ text: summary }],
  type: KEYS.toggle,
});
const para = (text: string, indent?: number): TElement => ({
  children: [{ text }],
  type: KEYS.p,
  ...(indent === undefined ? {} : { indent }),
});

describe('the details rule (docs/05 section 5)', () => {
  it('reads the corpus fixture back byte for byte', () => {
    expect(roundTrip(fixture)).toBe(fixture);
    // Idempotence: a second save of a page nobody edited has to be a no-op.
    expect(roundTrip(roundTrip(fixture))).toBe(fixture);
    expect(classifyFidelity(fixture, markdownToValue(fixture)).level).toBe('exact');
  });

  it('puts the summary in the toggle and the body in the blocks under it', () => {
    const value = blocks(fixture);
    expect(value[1]).toEqual(toggle('With a summary'));
    // The body is a sibling at one more indent - Plate reads membership off that, not off
    // the children (`buildToggleIndex`).
    expect(value[2]).toMatchObject({ indent: 1, type: KEYS.p });
    // A list inside a toggle is a list block at its own indent on top of the toggle's.
    expect(value[3]).toMatchObject({ indent: 2, listStyleType: 'disc' });
    expect(value[6]).toMatchObject({ indent: 1, lang: 'ts', type: KEYS.codeBlock });
  });

  it.each([
    ['an empty toggle', '<details>\n<summary>Nothing here</summary>\n\n</details>\n'],
    ['a toggle with no summary', '<details>\n\nJust a body.\n\n</details>\n'],
    ['an empty toggle with no summary', '<details>\n\n</details>\n'],
    [
      'toggles inside toggles',
      '<details>\n<summary>Outer</summary>\n\n<details>\n<summary>Inner</summary>\n\nDeep.\n\n</details>\n\n</details>\n',
    ],
  ])('round trips %s', (_name, body) => {
    expect(roundTrip(body)).toBe(body);
    expect(roundTrip(roundTrip(body))).toBe(body);
  });

  it('indents a nested toggle and its body one step further', () => {
    const value = blocks(
      '<details>\n<summary>Outer</summary>\n\n<details>\n<summary>Inner</summary>\n\nDeep.\n\n</details>\n\n</details>\n',
    );
    expect(value).toEqual([toggle('Outer'), { ...toggle('Inner'), indent: 1 }, para('Deep.', 2)]);
  });

  it.each([
    [
      'an attribute this rule cannot write back',
      '<details open>\n<summary>Open</summary>\n\n</details>\n',
    ],
    ['a summary glued to the body', '<details>\n<summary>Glued</summary>\nBody\n</details>\n'],
    ['no closing tag', '<details>\n<summary>Unclosed</summary>\n\nBody.\n'],
    ['some other block of HTML', '<div class="note">\n\nRaw.\n\n</div>\n'],
  ])('leaves %s as raw HTML, with its bytes', (_name, body) => {
    expect(blocks(body).some((block) => block.type === KEYS.toggle)).toBe(false);
    expect(roundTrip(body)).toBe(body);
  });
});

describe('a toggle the editor made', () => {
  it('writes one with no body at all', () => {
    expect(valueToMarkdown([toggle('Empty')])).toBe(
      '<details>\n<summary>Empty</summary>\n\n</details>\n',
    );
  });

  it('writes the blocks the user indented under it, and nothing after them', () => {
    const value: Value = [toggle('Notes'), para('Inside', 1), para('Outside')];
    expect(valueToMarkdown(value)).toBe(
      '<details>\n<summary>Notes</summary>\n\nInside\n\n</details>\n\nOutside\n',
    );
  });

  it('escapes a summary that would otherwise close its own tag', () => {
    const out = valueToMarkdown([toggle('a < b </summary>')]);
    expect(out).toBe('<details>\n<summary>a &lt; b &lt;/summary&gt;</summary>\n\n</details>\n');
    // The escape has to survive its own round trip, or every save would double it.
    expect(roundTrip(out)).toBe(out);
  });
});
