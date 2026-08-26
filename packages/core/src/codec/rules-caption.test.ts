import { describe, expect, it } from 'vitest';
import { KEYS, type TElement, type Value } from 'platejs';
import { markdownToValue, valueToMarkdown } from './codec.js';
import { classifyFidelity } from './fidelity.js';
import { splitFrontmatter } from '../frontmatter.js';
import { loadCorpus } from '../testing/fixtures.js';

/**
 * docs/05 section 5: an image with a caption is `![alt](src)` and an italic paragraph after
 * it, and the alt text is never the caption. Both halves are tested through the codec: the
 * rule is a remark pass and a value pass rather than one pair of functions.
 */

const corpus = await loadCorpus();
const fixture = splitFrontmatter(corpus.read('rules/image-caption.md')).body;

const roundTrip = (body: string): string => valueToMarkdown(markdownToValue(body));
const blocks = (body: string): TElement[] => markdownToValue(body);

const image = (alt: string, caption?: string): TElement => ({
  children: [{ text: '' }],
  type: KEYS.img,
  url: '../assets/diagram.png',
  ...(alt === '' ? {} : { alt }),
  ...(caption === undefined ? {} : { caption: [{ text: caption }] }),
});

describe('the image caption rule (docs/05 section 5)', () => {
  it('reads the corpus fixture back byte for byte', () => {
    expect(roundTrip(fixture)).toBe(fixture);
    // Idempotence: a second save of a page nobody edited has to be a no-op.
    expect(roundTrip(roundTrip(fixture))).toBe(fixture);
    expect(classifyFidelity(fixture, markdownToValue(fixture)).level).toBe('exact');
  });

  it('takes the caption off the italic paragraph and leaves the alt text alone', () => {
    const value = blocks(fixture);
    expect(value[1]).toEqual(
      image(
        'A diagram of the flow',
        'The caption is the italic-only paragraph directly after the image.',
      ),
    );
    expect(value[2]).toEqual(
      image('Alt text is never overwritten by the caption', 'A second caption.'),
    );
    // The third image has no italic paragraph after it, so it has no caption at all.
    expect(value[3]).toEqual(image('An image with no caption'));
    expect(value[4]).toMatchObject({ type: KEYS.p });
  });

  it.each([
    ['an image with no caption', '![Alt](a.png)\n'],
    ['an image with no alt text', '![](a.png)\n'],
    ['a caption', '![Alt](a.png)\n\n*The caption.*\n'],
    ['a caption with no alt text', '![](a.png)\n\n*The caption.*\n'],
    ['a title as well', '![Alt](a.png "The title")\n\n*The caption.*\n'],
    [
      'an image inside a toggle',
      '<details>\n<summary>More</summary>\n\n![Alt](a.png)\n\n*The caption.*\n\n</details>\n',
    ],
    ['two captioned images in a row', '![One](a.png)\n\n*First.*\n\n![Two](b.png)\n\n*Second.*\n'],
  ])('round trips %s', (_name, body) => {
    expect(roundTrip(body)).toBe(body);
    expect(roundTrip(roundTrip(body))).toBe(body);
  });

  it.each([
    ['a paragraph that is not italic', '![Alt](a.png)\n\nOrdinary prose.\n'],
    ['an italic run with something else beside it', '![Alt](a.png)\n\n*Italic* and more.\n'],
    ['an emphasis that is not plain text', '![Alt](a.png)\n\n*A **bold** caption.*\n'],
    ['an italic paragraph after prose', 'Words.\n\n*Just italic prose.*\n'],
  ])('leaves %s where it is', (_name, body) => {
    expect(
      blocks(body).some((block) => block.type === KEYS.img && block.caption !== undefined),
    ).toBe(false);
    expect(roundTrip(body)).toBe(body);
  });

  it('writes the caption the image block was given, and nothing for an empty one', () => {
    expect(valueToMarkdown([image('Alt', 'A caption.')])).toBe(
      '![Alt](../assets/diagram.png)\n\n*A caption.*\n',
    );
    expect(valueToMarkdown([image('Alt', '')])).toBe('![Alt](../assets/diagram.png)\n');
  });

  it('escapes a caption that would otherwise end its own emphasis', () => {
    const out = valueToMarkdown([image('Alt', 'a * b _ c')]);
    // The escape has to survive its own round trip, or every save would double it.
    expect(roundTrip(out)).toBe(out);
    expect(blocks(out)[0]).toEqual(image('Alt', 'a * b _ c'));
  });

  it('keeps a captioned image inside the toggle that holds it', () => {
    const value: Value = [
      { children: [{ text: 'More' }], type: KEYS.toggle },
      { ...image('Alt', 'A caption.'), indent: 1 },
    ];
    expect(valueToMarkdown(value)).toBe(
      '<details>\n<summary>More</summary>\n\n![Alt](../assets/diagram.png)\n\n*A caption.*\n\n</details>\n',
    );
  });
});
