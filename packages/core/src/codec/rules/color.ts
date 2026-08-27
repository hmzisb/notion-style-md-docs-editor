import {
  convertChildrenDeserialize,
  type MdRules,
  type SerializeMdOptions,
} from '@platejs/markdown';

/** `mdast-util-to-markdown`'s handler map, reached through the package that depends on it. */
type Handlers = NonNullable<NonNullable<SerializeMdOptions['remarkStringifyOptions']>['handlers']>;
type Handle = NonNullable<Handlers['paragraph']>;

/**
 * Text colour (DEV-034). Markdown has no colour of its own, so a coloured run is
 * the one span every Markdown renderer already understands, and the file stays readable
 * outside this module (D-02):
 *
 * ```
 * <span data-color="red" style="color: #d44c47">words</span>
 * ```
 *
 * The hex is what a reader outside the app sees; `data-color` is what the app reads back, so
 * the same page can paint the colour from a theme variable in dark mode. Only this exact
 * shape is folded back into a mark - a span written by hand stays raw HTML and survives byte
 * for byte through the `html` rule (DEV-003), which is what keeps this rule non-destructive.
 */

/** The leaf property, and the rule key. */
export const COLOR_KEY = 'color';

/**
 * The palette the toolbar offers, in the order it offers it. Notion's text colours: nine
 * that read on both a white and a near-black ground, which is what makes them safe to write
 * into a file that a host may render in either theme.
 */
export const TEXT_COLORS = {
  gray: '#787774',
  brown: '#9f6b53',
  orange: '#d9730d',
  yellow: '#cb912f',
  green: '#448361',
  blue: '#337ea9',
  purple: '#9065b0',
  pink: '#c14c8a',
  red: '#d44c47',
} as const;

export type TextColor = keyof typeof TEXT_COLORS;

export const TEXT_COLOR_NAMES = Object.keys(TEXT_COLORS) as TextColor[];

export const isTextColor = (value: unknown): value is TextColor =>
  typeof value === 'string' && value in TEXT_COLORS;

/** mdast, as this file walks it. */
interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

interface MdColor extends MdNode {
  type: 'color';
  color: TextColor;
  children: MdNode[];
}

/**
 * The mdast type one colour writes. The name is part of it because `mdast-util-to-markdown`
 * is handed one node per leaf, and Plate's serializer merges two adjacent nodes of the same
 * type into one - which is what a run of leaves that share a colour should do, and what two
 * runs of different colours must not.
 */
const typeFor = (color: TextColor): string => `docsColor_${color}`;

/** The tag pair, with the run inside it serialized by the same stringifier as its neighbours. */
const handlerFor =
  (color: TextColor): Handle =>
  (node, _parent, state, info) =>
    `<span data-color="${color}" style="color: ${TEXT_COLORS[color]}">` +
    `${state.containerPhrasing(node as never, { ...info, after: '<', before: '>' })}</span>`;

/**
 * `remark-stringify` handlers for the synthetic nodes above. Merged into the stringify
 * options by `createBaseKit`: without them the serializer has no way to write a node type
 * mdast does not define.
 */
export const colorHandlers: Handlers = Object.fromEntries(
  TEXT_COLOR_NAMES.map((color) => [typeFor(color), handlerFor(color)]),
);

const OPEN = /^<span data-color="([a-z]+)" style="color: #[0-9a-f]{6}">$/;

/** The palette name of an opening tag this rule wrote, or null for HTML it leaves alone. */
function openColor(node: MdNode | undefined): TextColor | null {
  if (node?.type !== 'html') return null;
  const name = OPEN.exec(node.value ?? '')?.[1];
  return name !== undefined && isTextColor(name) ? name : null;
}

const closes = (node: MdNode | undefined): boolean =>
  node?.type === 'html' && node.value === '</span>';

function fold(nodes: MdNode[]): MdNode[] {
  const out: MdNode[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node === undefined) continue;
    const color = openColor(node);
    // No closing tag in the same parent is HTML this rule cannot put back together.
    const end = color === null ? -1 : nodes.findIndex((other, at) => at > i && closes(other));
    if (color === null || end === -1) {
      out.push(node);
      continue;
    }
    const folded: MdColor = { children: nodes.slice(i + 1, end), color, type: 'color' };
    out.push(folded);
    i = end;
  }
  return out;
}

function walk(nodes: MdNode[]): MdNode[] {
  const folded = fold(nodes);
  for (const node of folded) if (node.children !== undefined) node.children = walk(node.children);
  return folded;
}

/**
 * Remark plugin. Runs on parse only: writing goes through the handlers above, because a rule
 * is handed one leaf at a time and a coloured run is usually several.
 */
export function remarkColors(): (tree: unknown) => void {
  return (tree) => {
    const root = tree as MdNode;
    root.children = walk(root.children ?? []);
  };
}

export const colorRules: MdRules = {
  /**
   * One key for both directions: `mark: true` puts `color` in the list of leaf properties the
   * serializer composes, and the synthetic node `remarkColors` leaves behind carries the same
   * name, so the deserializer is reached by node type.
   */
  [COLOR_KEY]: {
    mark: true,
    deserialize: (node: MdColor, deco, options) =>
      // Through the decoration rather than onto one leaf: a run can hold a bold word or a
      // code span, and every text under it is the same colour.
      convertChildrenDeserialize(
        node.children as never,
        { [COLOR_KEY]: node.color, ...deco },
        options,
      ),
    // The children are the leaf's own text, put there by the serializer around this call, and
    // the mark is applied innermost - so bold and italic wrap the span from the outside.
    serialize: (node: { color?: string }) =>
      isTextColor(node.color) ? { type: typeFor(node.color) } : { type: 'text', value: '' },
  },
};
