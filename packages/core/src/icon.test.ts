import { describe, expect, it } from 'vitest';
import { formatIcon, parseIcon } from './icon.js';
import type { PageIcon } from './model.js';

describe('parseIcon', () => {
  const rows: [input: unknown, expected: PageIcon | undefined][] = [
    ['lucide:book-open', { kind: 'lucide', name: 'book-open' }],
    ['lucide:file', { kind: 'lucide', name: 'file' }],
    ['  lucide:file  ', { kind: 'lucide', name: 'file' }],
    ['lucide:Book_Open', undefined],
    ['lucide:', undefined],
    ['lucide:-leading', undefined],
    ['\u{1F9E0}', { kind: 'emoji', value: '\u{1F9E0}' }],
    ['\u{1F468}‍\u{1F4BB}', { kind: 'emoji', value: '\u{1F468}‍\u{1F4BB}' }],
    ['A', { kind: 'emoji', value: 'A' }],
    ['', undefined],
    ['   ', undefined],
    ['a whole sentence that is clearly not an icon', undefined],
    [42, undefined],
    [null, undefined],
    [undefined, undefined],
    [{ kind: 'emoji' }, undefined],
  ];

  for (const [input, expected] of rows) {
    it(`parses ${JSON.stringify(input)}`, () => {
      expect(parseIcon(input)).toEqual(expected);
    });
  }
});

describe('formatIcon', () => {
  it('round-trips both kinds', () => {
    for (const value of ['lucide:book-open', '\u{1F510}']) {
      const icon = parseIcon(value);
      expect(icon).toBeDefined();
      if (icon) expect(formatIcon(icon)).toBe(value);
    }
  });
});
