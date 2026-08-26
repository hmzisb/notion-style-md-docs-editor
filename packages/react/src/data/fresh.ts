import { generateId, type NodeId } from '@docs/core';

/**
 * docs/01 section 5.3: a new page is in the tree and open in the editor before the provider has
 * answered, so it needs an id for that moment. Neither `generateId` nor the path hashes can
 * produce this shape, so a temporary id can never be mistaken for one the provider gave.
 */
export const newTempId = (): NodeId => `tmp_${generateId()}`;

export const isTempId = (id: NodeId): boolean => id.startsWith('tmp_');

interface Fresh {
  /** The temporary id the page was created under. */
  alias: NodeId;
  /** The provider's id, once it has answered. */
  id: NodeId | null;
  /** Set by the first title commit, which is the one that renames the file. */
  named: boolean;
}

/**
 * The page created last in each namespace. Deliberately not React state: every reader asks
 * inside a callback or a render another change already scheduled, and a store here would
 * re-render the whole shell on the very swap this exists to make invisible (docs/04 section 4).
 */
const fresh = new Map<string, Fresh>();

const entryFor = (ns: string, id: NodeId): Fresh | undefined => {
  const entry = fresh.get(ns);
  return entry !== undefined && (entry.alias === id || entry.id === id) ? entry : undefined;
};

/** The optimistic insert: the row is in the tree, the provider has not answered yet. */
export function markFresh(ns: string, alias: NodeId): void {
  fresh.set(ns, { alias, id: null, named: false });
}

/** The provider answered: the same page, under the id everything else uses from now on. */
export function settleFresh(ns: string, alias: NodeId, id: NodeId): void {
  const entry = fresh.get(ns);
  if (entry?.alias !== alias) return;
  entry.id = id;
}

/** The provider refused: there is no such page, and the row is on its way out. */
export function dropFresh(ns: string, alias: NodeId): void {
  if (fresh.get(ns)?.alias === alias) fresh.delete(ns);
}

/** The title landed. The alias stays: it is still this page's React key (docs/09 P3-T01). */
export function namedFresh(ns: string, id: NodeId): void {
  const entry = entryFor(ns, id);
  if (entry !== undefined) entry.named = true;
}

/**
 * A page created in this session whose file is still `untitled*.md`, so its first title commit
 * takes the file name with it (docs/03 section 4.7).
 */
export function isFresh(ns: string, id: NodeId): boolean {
  const entry = entryFor(ns, id);
  return entry !== undefined && !entry.named;
}

/**
 * The page's other id while the swap is in flight: the tree holds the provider's id a render
 * before the host has moved onto it, and both name the same page (docs/04 section 4).
 */
export function freshTwin(ns: string, id: NodeId): NodeId | null {
  const entry = entryFor(ns, id);
  if (entry === undefined) return null;
  return entry.alias === id ? entry.id : entry.alias;
}

/**
 * The identity the canvas and the editor are keyed on. A page created in this session keeps the
 * id it was created under, so replacing that id with the provider's swaps the data without
 * remounting the editor the user is already typing in (docs/04 section 4).
 */
export function canvasKey(ns: string, id: NodeId): NodeId {
  return entryFor(ns, id)?.alias ?? id;
}
