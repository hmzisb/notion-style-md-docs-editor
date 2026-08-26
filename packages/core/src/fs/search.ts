import type { SearchHit, TreeNode } from '../model.js';

/**
 * Content search over a file store (docs/01 section 6). Pure over a node list and a body
 * reader, so the memory store, a directory handle and a test fake all search the same way.
 *
 * Titles first, then bodies by how often the query appears in them. There is no index: a
 * corpus this size is faster to scan than to keep an inverted index of, and an index would
 * have to survive every external write. The caps are what keeps a scan bounded.
 */

/** Pages one query may read. */
export const SEARCH_FILE_CAP = 2000;
/** Bytes one query may read, across all of them. */
export const SEARCH_BYTE_CAP = 4 * 1024 * 1024;
/** Characters of context on either side of the match. */
const SNIPPET_PAD = 60;

export interface SearchPagesOptions {
  /** Page nodes in walk order, already scoped to the requested root. */
  nodes: readonly TreeNode[];
  /** The page's Markdown with the frontmatter off. */
  readBody: (node: TreeNode) => Promise<string>;
  query: string;
  limit: number;
}

function countOf(haystack: string, needle: string): number {
  let count = 0;
  for (
    let at = haystack.indexOf(needle);
    at !== -1;
    at = haystack.indexOf(needle, at + needle.length)
  ) {
    count += 1;
  }
  return count;
}

/** The match with its surroundings, on one line, with an ellipsis where the page continues. */
function snippetAt(body: string, at: number, length: number): string {
  const start = Math.max(0, at - SNIPPET_PAD);
  const end = Math.min(body.length, at + length + SNIPPET_PAD);
  const text = body.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${text}${end < body.length ? '…' : ''}`;
}

export async function searchPages({
  nodes,
  readBody,
  query,
  limit,
}: SearchPagesOptions): Promise<SearchHit[]> {
  const needle = query.trim().toLowerCase();
  if (needle === '' || limit <= 0) return [];

  const titled: { node: TreeNode; at: number }[] = [];
  const rest: TreeNode[] = [];
  for (const node of nodes) {
    if (node.kind !== 'page') continue;
    const at = node.title.toLowerCase().indexOf(needle);
    if (at === -1) rest.push(node);
    else titled.push({ node, at });
  }

  // Earliest match first, then the shortest title: "API" comes before "Legacy API notes".
  // The sort is stable, so pages that tie stay in walk order.
  titled.sort((a, b) => a.at - b.at || a.node.title.length - b.node.title.length);
  const hits: SearchHit[] = titled.map(({ node }) => ({ id: node.id, title: node.title }));
  // Nothing below can outrank a title match, so a full page of them is the answer already.
  if (hits.length >= limit) return hits.slice(0, limit);

  const found: { node: TreeNode; count: number; snippet: string }[] = [];
  let files = 0;
  let bytes = 0;
  // One page at a time: the caps bound the work, and reading a corpus in parallel is what
  // makes the tab stutter while someone is typing into the palette.
  for (const node of rest) {
    if (files >= SEARCH_FILE_CAP || bytes >= SEARCH_BYTE_CAP) break;
    const body = await readBody(node);
    files += 1;
    bytes += body.length;
    const lower = body.toLowerCase();
    const count = countOf(lower, needle);
    if (count === 0) continue;
    found.push({ node, count, snippet: snippetAt(body, lower.indexOf(needle), needle.length) });
  }

  found.sort((a, b) => b.count - a.count);
  for (const { node, snippet } of found) {
    if (hits.length >= limit) break;
    hits.push({ id: node.id, title: node.title, snippet });
  }
  return hits;
}
