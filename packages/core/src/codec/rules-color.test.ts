import { describe, expect, it } from 'vitest';
import { KEYS, type TElement } from 'platejs';
import { markdownToValue, valueToMarkdown } from './codec.js';
import { classifyFidelity } from './fidelity.js';
import { TEXT_COLORS } from './rules/color.js';

/**
 * DEV-034: a coloured run is a `<span data-color>`, and the rule only ever folds a
 * span this module wrote. Everything else is raw HTML and stays raw HTML (DEV-003), which is
 * what makes a colour safe to add to a format that has none.
 */

const roundTrip = (body: string): string => valueToMarkdown(markdownToValue(body));
const para = (body: string): TElement => markdownToValue(body)[0]!;

const RED = `<span data-color="red" style="color: ${TEXT_COLORS.red}">danger</span>`;

describe('the colour rule (DEV-034)', () => {
  it('reads a coloured run back as a mark on the leaf', () => {
    expect(para(`A ${RED} word\n`)).toEqual({
      children: [{ text: 'A ' }, { color: 'red', text: 'danger' }, { text: ' word' }],
      type: KEYS.p,
    });
  });

  it('writes the mark back byte for byte, and a second save changes nothing', () => {
    const body = `A ${RED} word\n`;
    expect(roundTrip(body)).toBe(body);
    expect(roundTrip(roundTrip(body))).toBe(body);
    expect(classifyFidelity(body, markdownToValue(body)).level).toBe('exact');
  });

  it.each(Object.keys(TEXT_COLORS))('round-trips %s', (name) => {
    const hex = TEXT_COLORS[name as keyof typeof TEXT_COLORS];
    const body = `<span data-color="${name}" style="color: ${hex}">word</span>\n`;
    expect(roundTrip(body)).toBe(body);
  });

  it('carries the colour across the marks inside the run', () => {
    const body = `<span data-color="blue" style="color: ${TEXT_COLORS.blue}">a **b** \`c\`</span>\n`;
    expect(para(body).children).toEqual([
      { color: 'blue', text: 'a ' },
      { bold: true, color: 'blue', text: 'b' },
      { color: 'blue', text: ' ' },
      { code: true, color: 'blue', text: 'c' },
    ]);
    expect(roundTrip(body)).toBe(body);
  });

  it('writes a mark that is both coloured and bold from the outside in', () => {
    const value: TElement[] = [
      { children: [{ bold: true, color: 'green', text: 'ok' }], type: KEYS.p },
    ];
    const body = valueToMarkdown(value);
    expect(body).toBe(
      `**<span data-color="green" style="color: ${TEXT_COLORS.green}">ok</span>**\n`,
    );
    expect(markdownToValue(body)).toEqual(value);
  });

  it('keeps the backticks a coloured code span needs', () => {
    const value: TElement[] = [
      { children: [{ code: true, color: 'red', text: 'rm -rf' }], type: KEYS.p },
    ];
    const body = valueToMarkdown(value);
    expect(body).toBe(
      `<span data-color="red" style="color: ${TEXT_COLORS.red}">\`rm -rf\`</span>\n`,
    );
    expect(markdownToValue(body)).toEqual(value);
  });

  it('escapes text that would otherwise be read as a tag of its own', () => {
    const value: TElement[] = [
      { children: [{ color: 'gray', text: 'a < b, <b> and &amp;' }], type: KEYS.p },
    ];
    const body = valueToMarkdown(value);
    // remark escapes `<` and `&` only where they could start a tag or a character reference,
    // which is exactly the pair that would otherwise cut the span short.
    expect(body).toContain('a < b, \\<b> and \\&amp;');
    expect(markdownToValue(body)).toEqual(value);
  });

  it('leaves a span nobody here wrote as the raw HTML it was', () => {
    const body = '<span style="color: red">hand written</span>\n';
    expect(roundTrip(body)).toBe(body);
    expect(para(body).children).toEqual([
      { html: true, text: '<span style="color: red">' },
      { text: 'hand written' },
      { html: true, text: '</span>' },
    ]);
  });

  it('leaves an opening tag with no closing tag alone', () => {
    const body = '<span data-color="red" style="color: #d44c47">open\n';
    expect(roundTrip(body)).toBe(body);
  });
});
