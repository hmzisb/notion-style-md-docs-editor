import { describe, expect, it } from 'vitest';
import { diffLines } from './line-diff.js';

const render = (before: string, after: string): string[] =>
  diffLines(before, after).map(
    (row) => `${row.kind === 'same' ? ' ' : row.kind === 'added' ? '+' : '-'}${row.text}`,
  );

describe('diffLines', () => {
  it('marks nothing when the texts are equal', () => {
    expect(render('a\nb\nc', 'a\nb\nc')).toEqual([' a', ' b', ' c']);
  });

  it('keeps the common head and tail and changes only the middle', () => {
    expect(render('a\nb\nc', 'a\nB\nc')).toEqual([' a', '-b', '+B', ' c']);
  });

  it('reports an insertion without touching the lines around it', () => {
    expect(render('a\nc', 'a\nb\nc')).toEqual([' a', '+b', ' c']);
  });

  it('reports a deletion the same way', () => {
    expect(render('a\nb\nc', 'a\nc')).toEqual([' a', '-b', ' c']);
  });

  it('numbers both sides by their own file', () => {
    const rows = diffLines('a\nb\nc', 'a\nc');
    expect(rows.map((row) => [row.kind, row.leftNo, row.rightNo])).toEqual([
      ['same', 1, 1],
      ['removed', 2, undefined],
      ['same', 3, 2],
    ]);
  });

  it('handles an empty side', () => {
    expect(render('', 'a\nb')).toEqual(['+a', '+b']);
    expect(render('a\nb', '')).toEqual(['-a', '-b']);
  });

  it('interleaves several changes in file order', () => {
    expect(render('one\ntwo\nthree\nfour', 'one\n2\nthree\n4\nfive')).toEqual([
      ' one',
      '-two',
      '+2',
      ' three',
      '-four',
      '+4',
      '+five',
    ]);
  });

  it('stays linear on a big page with one changed line', () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `line ${String(i)}`);
    const before = lines.join('\n');
    const after = [...lines.slice(0, 2500), 'changed', ...lines.slice(2501)].join('\n');

    const started = performance.now();
    const rows = diffLines(before, after);
    expect(performance.now() - started).toBeLessThan(100);
    expect(rows.filter((row) => row.kind !== 'same')).toEqual([
      { kind: 'removed', leftNo: 2501, text: 'line 2500' },
      { kind: 'added', rightNo: 2501, text: 'changed' },
    ]);
  });
});
