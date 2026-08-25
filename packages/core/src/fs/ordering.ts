import type { TreeNode } from '../model.js';

/**
 * Sibling ordering (docs/03 section 4.4). `order` is a sparse float written into
 * frontmatter so a move rewrites one file instead of renumbering a folder.
 */

export const ORDER_STEP = 10;
/** Below this gap a midpoint stops being reliably representable, so we renumber. */
export const MIN_ORDER_GAP = 1e-6;

export interface Sortable {
  /** Filename used for the natural-sort tiebreak. */
  name: string;
  order?: number | undefined;
  kind: TreeNode['kind'];
}

const NUMBER_RUN = /(\d+)/g;

/**
 * Natural sort: `page-2` before `page-10`. Compares digit runs numerically and the
 * rest case-insensitively, falling back to a stable byte compare.
 */
export function compareNatural(a: string, b: string): number {
  const left = a.toLowerCase().split(NUMBER_RUN);
  const right = b.toLowerCase().split(NUMBER_RUN);
  const length = Math.min(left.length, right.length);

  for (let i = 0; i < length; i++) {
    const l = left[i] ?? '';
    const r = right[i] ?? '';
    if (l === r) continue;
    // Odd indices are the captured digit runs.
    if (i % 2 === 1) {
      const diff = Number(l) - Number(r);
      if (diff !== 0) return diff < 0 ? -1 : 1;
      continue;
    }
    return l < r ? -1 : 1;
  }
  if (left.length !== right.length) return left.length - right.length;
  return a === b ? 0 : a < b ? -1 : 1;
}

/**
 * 1. Nodes with `order` ascending, ties by natural filename sort.
 * 2. Then nodes without `order`, natural filename sort, folders after pages.
 */
export function compareSiblings(a: Sortable, b: Sortable): number {
  const aHas = typeof a.order === 'number' && Number.isFinite(a.order);
  const bHas = typeof b.order === 'number' && Number.isFinite(b.order);

  if (aHas !== bHas) return aHas ? -1 : 1;
  if (aHas && bHas) {
    const diff = (a.order ?? 0) - (b.order ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
    return compareNatural(a.name, b.name);
  }

  if (a.kind !== b.kind) return a.kind === 'page' ? -1 : 1;
  return compareNatural(a.name, b.name);
}

export function sortSiblings<T extends Sortable>(nodes: readonly T[]): T[] {
  return [...nodes].sort(compareSiblings);
}

/** Next order value after the last ordered sibling. */
export function nextOrder(orders: readonly (number | undefined)[]): number {
  let max = 0;
  let seen = false;
  for (const order of orders) {
    if (typeof order === 'number' && Number.isFinite(order)) {
      if (!seen || order > max) max = order;
      seen = true;
    }
  }
  return seen ? max + ORDER_STEP : ORDER_STEP;
}

export interface MidpointResult {
  order: number;
  /** True when the gap collapsed and the caller must renumber the siblings. */
  needsRenumber: boolean;
}

/**
 * Order value that places a node between `prev` and `next`. Steps of 10 at the ends.
 * Reports `needsRenumber` when the gap is too small to split safely, rather than
 * silently producing a value that ties with a neighbour.
 */
export function midpointOrder(prev: number | undefined, next: number | undefined): MidpointResult {
  const low = typeof prev === 'number' && Number.isFinite(prev) ? prev : undefined;
  const high = typeof next === 'number' && Number.isFinite(next) ? next : undefined;

  if (high === undefined) {
    return { order: low === undefined ? ORDER_STEP : low + ORDER_STEP, needsRenumber: false };
  }
  if (low === undefined) return { order: high - ORDER_STEP, needsRenumber: false };
  if (high - low <= MIN_ORDER_GAP) return { order: low, needsRenumber: true };

  const mid = low + (high - low) / 2;
  // Floating point can land the midpoint on an endpoint once the gap is tiny.
  if (mid <= low || mid >= high) return { order: low, needsRenumber: true };
  return { order: mid, needsRenumber: false };
}

/** Fresh `order` values in steps of 10 for a whole sibling list. */
export function renumber(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * ORDER_STEP);
}
