/**
 * What saving a page the reader never edited would do to the file (docs/05 section 4):
 * `exact` writes it back byte for byte, `reformat` changes bytes but not meaning,
 * `lossy` means the v1 block set cannot hold something the file says (D-16).
 */
import { defaultCodec, normalizeMarkdown, type Codec } from './codec.js';
import { remarkInlineRefs } from './inline-refs.js';
import type { Value } from 'platejs';

export type FidelityLevel = 'exact' | 'reformat' | 'lossy';

export interface Fidelity {
  level: FidelityLevel;
  /** Sorted and de-duplicated. Always empty for `exact`. */
  reasons: string[];
}

/** The mdast shape this file walks. Mutated in place, on a tree it parsed itself. */
interface AstNode {
  type: string;
  depth?: number;
  children?: AstNode[];
}

export const MAX_HEADING_DEPTH = 3;

/**
 * Reasons that follow from a node type being in the source at all, whether or not the
 * bytes survive: no plugin in the v1 kit renders these, so the reader cannot see or
 * edit what they say.
 */
const PRESENT_REASON: Record<string, string> = {
  definition: 'definition',
  footnoteDefinition: 'footnoteDefinition',
  footnoteReference: 'footnoteDefinition',
  'heading:deep': 'heading_level_clamped',
  imageReference: 'definition',
  inlineMath: 'math',
  linkReference: 'definition',
  math: 'math',
};

/** Every other node type is judged on survival. These are the ones with a better name. */
const DROP_REASON: Record<string, string> = { html: 'html' };

/** Reasons that change the bytes without dropping anything. Everything else is lossy. */
const REFORMAT_REASONS = new Set(['definition', 'heading_level_clamped']);

/**
 * One serialize and two parses. Cheap enough to run on open, but the caller decides
 * when: docs/05 section 4 puts it in idle time after the first paint.
 */
export function classifyFidelity(
  body: string,
  value: Value,
  codec: Codec = defaultCodec,
): Fidelity {
  const out = codec.toMarkdown(value);
  if (normalizeMarkdown(out) === normalizeMarkdown(body)) return { level: 'exact', reasons: [] };

  const source = codec.toAst(body) as AstNode;
  const result = codec.toAst(out) as AstNode;
  const before = census(source);
  const after = census(result);

  const reasons = new Set<string>();
  for (const [type, count] of before) {
    const present = PRESENT_REASON[type];
    if (present !== undefined) reasons.add(present);
    else if ((after.get(type) ?? 0) < count) {
      reasons.add(DROP_REASON[type] ?? `unknown_node:${type}`);
    }
  }

  if ([...reasons].some((reason) => !REFORMAT_REASONS.has(reason))) return lossy(reasons);
  // The reasons so far explain a byte difference, not a content one. Apply them to the
  // source and the two trees have to match, or something changed that nothing named.
  return same(normalize(source), result)
    ? { level: 'reformat', reasons: sorted(reasons) }
    : lossy(reasons.add('content_changed'));
}

const lossy = (reasons: Set<string>): Fidelity => ({ level: 'lossy', reasons: sorted(reasons) });

const sorted = (reasons: Set<string>): string[] => [...reasons].sort();

/** Node types by count. A heading below the last supported level counts as its own type. */
function census(node: AstNode, into = new Map<string, number>()): Map<string, number> {
  const type =
    node.type === 'heading' && (node.depth ?? 1) > MAX_HEADING_DEPTH ? 'heading:deep' : node.type;
  into.set(type, (into.get(type) ?? 0) + 1);
  for (const child of node.children ?? []) census(child, into);
  return into;
}

/** The two reformats, applied to the source so the comparison sees what the editor saw. */
function normalize(node: AstNode): AstNode {
  clampHeadings(node);
  remarkInlineRefs()(node);
  return node;
}

function clampHeadings(node: AstNode): void {
  if (node.type === 'heading' && (node.depth ?? 1) > MAX_HEADING_DEPTH) {
    node.depth = MAX_HEADING_DEPTH;
  }
  for (const child of node.children ?? []) clampHeadings(child);
}

/** Drops `position` and sorts keys, so this is structure only (docs/05 section 4 step 3). */
const stable = (key: string, val: unknown): unknown =>
  key === 'position'
    ? undefined
    : val !== null && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : 1)))
      : val;

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a, stable) === JSON.stringify(b, stable);
