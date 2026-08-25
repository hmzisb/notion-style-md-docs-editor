import { describe, expect, it } from 'vitest';
import {
  MIN_ORDER_GAP,
  ORDER_STEP,
  compareNatural,
  compareSiblings,
  midpointOrder,
  nextOrder,
  renumber,
  sortSiblings,
  type Sortable,
} from './ordering.js';

const page = (name: string, order?: number): Sortable => ({ name, kind: 'page', order });
const folder = (name: string, order?: number): Sortable => ({ name, kind: 'folder', order });

describe('compareNatural', () => {
  it('sorts digit runs numerically', () => {
    expect(['page-10.md', 'page-2.md', 'page-1.md'].sort(compareNatural)).toEqual([
      'page-1.md',
      'page-2.md',
      'page-10.md',
    ]);
  });

  it('is case-insensitive but stable', () => {
    expect(compareNatural('Auth.md', 'auth.md')).not.toBe(0);
    expect(['b.md', 'A.md', 'a.md'].sort(compareNatural)).toEqual(['A.md', 'a.md', 'b.md']);
  });

  it('handles multiple digit runs', () => {
    expect(['v1-part10.md', 'v1-part9.md', 'v2-part1.md'].sort(compareNatural)).toEqual([
      'v1-part9.md',
      'v1-part10.md',
      'v2-part1.md',
    ]);
  });
});

describe('compareSiblings', () => {
  it('ranks an ordered node ahead of an unordered one', () => {
    expect(compareSiblings(page('b.md'), page('a.md', 5))).toBeGreaterThan(0);
    expect(compareSiblings(page('a.md', 5), page('b.md'))).toBeLessThan(0);
  });

  it('puts ordered nodes before unordered ones', () => {
    expect(sortSiblings([page('b.md'), page('a.md', 5)]).map((n) => n.name)).toEqual([
      'a.md',
      'b.md',
    ]);
  });

  it('sorts ordered nodes by order, ties by natural name', () => {
    expect(
      sortSiblings([page('z.md', 1), page('a.md', 2), page('b.md', 1)]).map((n) => n.name),
    ).toEqual(['b.md', 'z.md', 'a.md']);
  });

  it('puts folders after pages within the unordered group', () => {
    expect(
      sortSiblings([folder('a-folder'), page('z.md'), page('m.md')]).map((n) => n.name),
    ).toEqual(['m.md', 'z.md', 'a-folder']);
  });

  it('lets an ordered folder outrank an unordered page', () => {
    expect(sortSiblings([page('a.md'), folder('zz', 1)]).map((n) => n.name)).toEqual(['zz', 'a.md']);
  });

  it('ignores a non-finite order', () => {
    expect(sortSiblings([page('a.md', Number.NaN), page('b.md', 1)]).map((n) => n.name)).toEqual([
      'b.md',
      'a.md',
    ]);
  });
});

describe('nextOrder', () => {
  it('starts at the step and grows past the largest order', () => {
    expect(nextOrder([])).toBe(ORDER_STEP);
    expect(nextOrder([undefined, undefined])).toBe(ORDER_STEP);
    expect(nextOrder([10, 30, 20])).toBe(40);
    expect(nextOrder([-5])).toBe(5);
  });
});

describe('midpointOrder', () => {
  it('steps by 10 at the ends', () => {
    expect(midpointOrder(undefined, undefined)).toEqual({ order: 10, needsRenumber: false });
    expect(midpointOrder(20, undefined)).toEqual({ order: 30, needsRenumber: false });
    expect(midpointOrder(undefined, 20)).toEqual({ order: 10, needsRenumber: false });
  });

  it('splits the gap between two siblings', () => {
    expect(midpointOrder(10, 20)).toEqual({ order: 15, needsRenumber: false });
    expect(midpointOrder(0, 1)).toEqual({ order: 0.5, needsRenumber: false });
  });

  it('flags precision loss instead of producing a tie', () => {
    expect(midpointOrder(10, 10).needsRenumber).toBe(true);
    expect(midpointOrder(10, 10 + MIN_ORDER_GAP / 2).needsRenumber).toBe(true);
    expect(midpointOrder(1, 1 + Number.EPSILON).needsRenumber).toBe(true);
  });

  it('survives repeated halving until it asks for a renumber', () => {
    let low = 0;
    const high = 10;
    let renumbered = false;
    for (let i = 0; i < 200; i++) {
      const result = midpointOrder(low, high);
      if (result.needsRenumber) {
        renumbered = true;
        break;
      }
      expect(result.order).toBeGreaterThan(low);
      expect(result.order).toBeLessThan(high);
      low = result.order;
    }
    expect(renumbered).toBe(true);
  });
});

describe('renumber', () => {
  it('emits fresh steps of 10', () => {
    expect(renumber(3)).toEqual([10, 20, 30]);
    expect(renumber(0)).toEqual([]);
  });
});
