import { convertNodesDeserialize, type MdRules } from '@platejs/markdown';
import {
  ElementApi,
  getPluginType,
  KEYS,
  TextApi,
  type Descendant,
  type SlateEditor,
  type TElement,
  type Value,
} from 'platejs';

/**
 * `<details>` blocks (docs/05 section 5). Markdown has no toggle, so a toggle is the raw HTML
 * GitHub renders as a disclosure, and that is where the two halves of this rule part company:
 * remark hands the open tag, the body and the close tag over as three siblings, and a rule
 * only ever sees one node. Reading, the tree is put back together first (`remarkToggles`) and
 * the rule then reads one `details` node. Writing, the value is taken apart first
 * (`foldToggles`), because the body of a toggle is the blocks after it, not its children.
 */

/** The plugin key is the node type unless a host renamed the plugin. */
const typeOf = (options: { editor?: SlateEditor }, key: string): string =>
  options.editor ? getPluginType(options.editor, key) : key;

/** mdast, as this file walks it: only `html` nodes are read, the rest are carried. */
interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

interface MdDetails extends MdNode {
  type: 'details';
  summary: string;
  children: MdNode[];
}

/**
 * No attributes: `<details open>` would be written back without the `open`, so it stays raw
 * HTML instead. The summary has to be a line of its own, which is how remark hands over a
 * `<details>` block whose content is separated by a blank line - anything else is HTML this
 * rule cannot take apart and put back byte for byte.
 */
const OPEN = /^<details>$/;
const CLOSE = /^<\/details>$/;
const SUMMARY = /^<summary>([\s\S]*)<\/summary>$/;

const linesOf = (node: MdNode | undefined): string[] =>
  node?.type === 'html' ? (node.value ?? '').split('\n') : [];

/** Counted rather than matched, so a nested `<details open>` still closes the right block. */
const opens = (node: MdNode | undefined): boolean =>
  linesOf(node)[0]?.startsWith('<details') === true;
const closes = (node: MdNode | undefined): boolean => {
  const lines = linesOf(node);
  return lines.length === 1 && CLOSE.test(lines[0] ?? '');
};

/** The summary of a `<details>` this rule can handle, or `null` for HTML it leaves alone. */
function readOpen(node: MdNode | undefined): string | null {
  const lines = linesOf(node);
  const [first, second, ...rest] = lines;
  if (first === undefined || !OPEN.test(first)) return null;
  if (second === undefined) return '';
  if (rest.length > 0) return null;
  return SUMMARY.exec(second)?.[1] ?? null;
}

function findClose(nodes: MdNode[], start: number): number {
  let depth = 1;
  for (let i = start + 1; i < nodes.length; i += 1) {
    if (opens(nodes[i])) depth += 1;
    else if (closes(nodes[i])) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function fold(nodes: MdNode[]): MdNode[] {
  const out: MdNode[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node === undefined) continue;
    const summary = readOpen(node);
    const end = summary === null ? -1 : findClose(nodes, i);
    if (summary === null || end === -1) {
      out.push(node);
      continue;
    }
    const details: MdDetails = {
      children: fold(nodes.slice(i + 1, end)),
      summary,
      type: 'details',
    };
    out.push(details);
    i = end;
  }
  return out;
}

/**
 * Remark plugin. Runs on parse only: `foldToggles` is the other direction, and it works on
 * the value because the serializer never sees the tree as a whole.
 */
export function remarkToggles(): (tree: unknown) => void {
  return (tree) => {
    const root = tree as MdNode;
    root.children = fold(root.children ?? []);
  };
}

const indentOf = (node: Descendant | undefined): number =>
  node !== undefined && ElementApi.isElement(node) ? Number(node[KEYS.indent] ?? 0) : 0;

/**
 * A list item spends its first indent step on the marker, so a top-level list sits at indent
 * 1 with nothing enclosing it. Plate's own toggle index makes the same correction before it
 * decides what a toggle holds, and a list after a toggle is not inside it.
 */
const enclosedIndentOf = (node: Descendant | undefined): number => {
  const indent = indentOf(node);
  const listed =
    node !== undefined && ElementApi.isElement(node) && node.listStyleType !== undefined;
  return listed && indent > 0 ? indent - 1 : indent;
};

const withIndent = (node: Descendant, indent: number): Descendant =>
  indent > 0 ? { ...node, [KEYS.indent]: indent } : omitIndent(node);

function omitIndent(node: Descendant): Descendant {
  if (!ElementApi.isElement(node) || node[KEYS.indent] === undefined) return node;
  const { [KEYS.indent]: _indent, ...rest } = node;
  return rest;
}

/** The plain text of a block: a toggle's summary is one line, never marked up. */
const textOf = (node: TElement): string =>
  node.children.map((child) => (TextApi.isText(child) ? child.text : '')).join('');

/** `<` and `>` only: a summary that carried `&lt;` in the file keeps those bytes. */
const escapeSummary = (text: string): string =>
  text.replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** The exact shape docs/05 section 5 pins, and the one `remarkToggles` reads back. */
function detailsBlock(summary: string, body: string): string {
  const lines = ['<details>'];
  if (summary !== '') lines.push(`<summary>${escapeSummary(summary)}</summary>`);
  lines.push('');
  if (body !== '') lines.push(body.replace(/\n+$/, ''), '');
  lines.push('</details>');
  return lines.join('\n');
}

/** Raw HTML survives as its own bytes through the `html` mark of the fidelity rules. */
const rawHtml = (value: string): TElement => ({
  children: [{ html: true, text: value }],
  type: KEYS.p,
});

/**
 * Value -> value, run before serialization: every toggle and the blocks indented under it
 * become one raw `<details>` block, with the body rendered by the same codec one level out.
 */
export function foldToggles(value: Value, render: (blocks: Value) => string): Value {
  if (!value.some((node) => ElementApi.isElement(node) && node.type === KEYS.toggle)) return value;

  const out: Value = [];
  for (let i = 0; i < value.length; i += 1) {
    const node = value[i];
    if (node === undefined) continue;
    if (node.type !== KEYS.toggle) {
      out.push(node);
      continue;
    }
    const level = enclosedIndentOf(node);
    let end = i + 1;
    while (end < value.length && enclosedIndentOf(value[end]) > level) end += 1;
    const body = value
      .slice(i + 1, end)
      .map((child) => withIndent(child, indentOf(child) - level - 1)) as Value;
    out.push(rawHtml(detailsBlock(textOf(node), body.length === 0 ? '' : render(body))));
    i = end - 1;
  }
  return out;
}

export const toggleRules: MdRules = {
  /** The synthetic node `remarkToggles` leaves behind; mdast has no `details` of its own. */
  details: {
    deserialize: (node: MdDetails, deco, options) => [
      { children: [{ text: node.summary }], type: typeOf(options, KEYS.toggle) },
      // The body is not the toggle's children: Plate reads it off the indent of the blocks
      // after it, so one level is added here and taken off again on the way out.
      ...convertNodesDeserialize(node.children as never, deco, options).map((child: Descendant) =>
        withIndent(child, indentOf(child) + 1),
      ),
    ],
  },
  [KEYS.toggle]: {
    /**
     * A toggle only reaches the serializer when nothing folded it - `serializeMd` called
     * directly, or a value built by hand. Its summary still has to survive.
     */
    serialize: (node: TElement) => ({ type: 'html', value: detailsBlock(textOf(node), '') }),
  },
};
