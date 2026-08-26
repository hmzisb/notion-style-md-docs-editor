import { KEYS, type TElement, type Value } from 'platejs';
import { describe, expect, it } from 'vitest';
import { markdownToValue, valueToMarkdown } from './codec.js';
import { loadCorpus } from '../testing/fixtures.js';

/**
 * docs/05 section 5: a GFM alert is the only callout Markdown has, so the rule pair is judged
 * on the fixture that holds every variant of one - what the file says goes into the element,
 * and what the element says goes back into the same bytes.
 */

const corpus = await loadCorpus();
const body = corpus.read('rules/callout.md');

const callouts = (value: Value): TElement[] => value.filter((node) => node.type === KEYS.callout);

/** The words a block holds, which is what the marker line must no longer be part of. */
const textOf = (node: TElement): string =>
  node.children.map((child) => ('text' in child ? String(child.text) : textOf(child))).join('');

describe('the callout rule (docs/05 section 5)', () => {
  const value = markdownToValue(body);

  it('reads every alert variant as a callout with its icon', () => {
    expect(
      callouts(value).map((node) => ({ variant: node.variant, icon: node.icon })),
    ).toStrictEqual([
      { variant: 'note', icon: 'info' },
      { variant: 'tip', icon: 'lightbulb' },
      { variant: 'important', icon: 'megaphone' },
      { variant: 'warning', icon: 'triangle-alert' },
      { variant: 'caution', icon: 'octagon-alert' },
    ]);
  });

  it('drops the marker line and keeps the rest of the block', () => {
    const [note] = callouts(value);
    expect(note).toBeDefined();
    expect(textOf(note!)).toBe('A note keeps its variant and drops the marker line.');
    // The marker is not text anywhere on the page: it is the variant now.
    expect(value.map(textOf).join('\n')).not.toContain('[!');
  });

  it('keeps a multi-paragraph callout as paragraphs', () => {
    const important = callouts(value)[2];
    expect(important?.children.map((child) => (child as TElement).type)).toStrictEqual([
      KEYS.p,
      KEYS.p,
    ]);
    expect(textOf(important!)).toBe(
      'Multi-paragraph callouts keep their paragraphs.Second paragraph.',
    );
  });

  it('leaves a plain blockquote alone', () => {
    const quotes = value.filter((node) => node.type === KEYS.blockquote);
    expect(quotes.map(textOf)).toStrictEqual(['A plain blockquote is not a callout.']);
  });

  it('writes the fixture back byte for byte', () => {
    expect(valueToMarkdown(value)).toBe(body);
  });

  it('is idempotent: parse, serialize, parse', () => {
    expect(markdownToValue(valueToMarkdown(value))).toStrictEqual(value);
  });
});

describe('what is not an alert', () => {
  it.each([
    // GitHub gives the marker a line of its own; these are the near misses that get one.
    ['a marker that shares its line', '> [!NOTE] Not on its own line.\n'],
    ['a marker below the first line', '> Quoted.\n> [!NOTE]\n'],
    ['a variant GitHub does not have', '> [!HINT]\n> Made up.\n'],
  ])('%s stays a blockquote', (_name, markdown) => {
    expect(markdownToValue(markdown)[0]?.type).toBe(KEYS.blockquote);
  });

  it('leaves the bytes of a marker it did not take alone', () => {
    // D-02: the marker is still syntax, and escaping it would rewrite a line nobody touched.
    const markdown = '> [!NOTE] Not on its own line.\n';
    expect(valueToMarkdown(markdownToValue(markdown))).toBe(markdown);
  });
});

describe('a callout the editor made', () => {
  const editorCallout = (props: Record<string, unknown>): Value => [
    { type: KEYS.callout, children: [{ text: 'Heads up.' }], ...props },
  ];

  it('serializes text children as the alert body', () => {
    expect(valueToMarkdown(editorCallout({ variant: 'warning' }))).toBe(
      '> [!WARNING]\n> Heads up.\n',
    );
  });

  it('falls back to the default variant when it has none', () => {
    expect(valueToMarkdown(editorCallout({}))).toBe('> [!NOTE]\n> Heads up.\n');
  });

  it('does not write a custom emoji icon back', () => {
    // docs/05 section 5: the icon follows the variant, so an emoji has nowhere to live.
    expect(valueToMarkdown(editorCallout({ variant: 'tip', icon: '🚀' }))).toBe(
      '> [!TIP]\n> Heads up.\n',
    );
  });

  it('keeps a block that is not a paragraph under the marker', () => {
    const markdown = valueToMarkdown([
      {
        type: KEYS.callout,
        variant: 'caution',
        children: [
          { type: KEYS.p, children: [{ text: 'Item' }], indent: 1, listStyleType: KEYS.ul },
        ],
      },
    ]);
    expect(markdown).toBe('> [!CAUTION]\n>\n> - Item\n');
    expect(markdownToValue(markdown)[0]).toMatchObject({ type: KEYS.callout, variant: 'caution' });
  });
});
