/**
 * A line diff for the draft compare dialog (docs/04 section 3.3), aligned into rows a
 * side-by-side view can render. Small enough not to be worth a dependency: the whole of it is
 * a common prefix, a common suffix and one LCS table over what is left.
 */

export interface DiffRow {
  /** `same` on both sides, `added` only on the right, `removed` only on the left. */
  kind: 'same' | 'added' | 'removed';
  /** 1-based line numbers, absent on the side the row is missing from. */
  leftNo?: number;
  rightNo?: number;
  text: string;
}

/**
 * ponytail: the LCS table is O(n×m) cells, so a page of a few thousand changed lines would
 * cost more memory than the dialog is worth. Past this many changed lines on either side the
 * diff degrades to "all of this went, all of that came", which is still readable side by side.
 */
const MAX_LCS_LINES = 1200;

const split = (text: string): string[] => (text === '' ? [] : text.split('\n'));

export function diffLines(before: string, after: string): DiffRow[] {
  const left = split(before);
  const right = split(after);

  let head = 0;
  while (head < left.length && head < right.length && left[head] === right[head]) head += 1;

  let tail = 0;
  while (
    tail < left.length - head &&
    tail < right.length - head &&
    left[left.length - 1 - tail] === right[right.length - 1 - tail]
  ) {
    tail += 1;
  }

  const rows: DiffRow[] = [];
  for (let i = 0; i < head; i += 1) {
    rows.push({ kind: 'same', leftNo: i + 1, rightNo: i + 1, text: left[i] ?? '' });
  }

  const midLeft = left.slice(head, left.length - tail);
  const midRight = right.slice(head, right.length - tail);
  for (const row of middle(midLeft, midRight, head)) rows.push(row);

  for (let i = 0; i < tail; i += 1) {
    const leftNo = left.length - tail + i + 1;
    rows.push({
      kind: 'same',
      leftNo,
      rightNo: right.length - tail + i + 1,
      text: left[leftNo - 1] ?? '',
    });
  }
  return rows;
}

/** The changed span, as rows: removed lines first, then the added ones, in file order. */
function middle(left: string[], right: string[], offset: number): DiffRow[] {
  if (left.length === 0 && right.length === 0) return [];
  if (left.length === 0 || right.length === 0 || left.length * right.length > MAX_LCS_LINES ** 2) {
    return [
      ...left.map((text, i): DiffRow => ({ kind: 'removed', leftNo: offset + i + 1, text })),
      ...right.map((text, i): DiffRow => ({ kind: 'added', rightNo: offset + i + 1, text })),
    ];
  }

  // Classic LCS lengths; `table[i][j]` is the longest common subsequence of the two suffixes.
  const table: number[][] = Array.from({ length: left.length + 1 }, () =>
    new Array<number>(right.length + 1).fill(0),
  );
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      const row = table[i] ?? [];
      const next = table[i + 1] ?? [];
      row[j] =
        left[i] === right[j] ? (next[j + 1] ?? 0) + 1 : Math.max(next[j] ?? 0, row[j + 1] ?? 0);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      rows.push({
        kind: 'same',
        leftNo: offset + i + 1,
        rightNo: offset + j + 1,
        text: left[i] ?? '',
      });
      i += 1;
      j += 1;
      continue;
    }
    const down = table[i + 1]?.[j] ?? 0;
    const across = table[i]?.[j + 1] ?? 0;
    if (down >= across) {
      rows.push({ kind: 'removed', leftNo: offset + i + 1, text: left[i] ?? '' });
      i += 1;
    } else {
      rows.push({ kind: 'added', rightNo: offset + j + 1, text: right[j] ?? '' });
      j += 1;
    }
  }
  for (; i < left.length; i += 1) {
    rows.push({ kind: 'removed', leftNo: offset + i + 1, text: left[i] ?? '' });
  }
  for (; j < right.length; j += 1) {
    rows.push({ kind: 'added', rightNo: offset + j + 1, text: right[j] ?? '' });
  }
  return rows;
}

/** Whether the two texts differ at all, without building the rows. */
export const hasDiff = (before: string, after: string): boolean => before !== after;
