import {
  convertNodesDeserialize,
  convertNodesSerialize,
  type MdBlockquote,
  type MdHtml,
  type MdParagraph,
  type MdRules,
} from '@platejs/markdown';
import { getPluginType, KEYS, TextApi, type Descendant, type SlateEditor } from 'platejs';

/**
 * GFM alerts (docs/05 section 5). A callout is an alert and nothing else: the variant is the
 * marker the file carries, so the icon follows from it rather than from the author, and a
 * custom emoji on a callout is not written back.
 */
export const CALLOUT_ICONS = {
  note: 'info',
  tip: 'lightbulb',
  important: 'megaphone',
  warning: 'triangle-alert',
  caution: 'octagon-alert',
} as const;

export type CalloutVariant = keyof typeof CALLOUT_ICONS;

/** What a callout with no variant of its own is: the one the editor inserts (docs/05 section 5). */
export const DEFAULT_CALLOUT_VARIANT: CalloutVariant = 'note';

export const isCalloutVariant = (value: unknown): value is CalloutVariant =>
  typeof value === 'string' && value in CALLOUT_ICONS;

/** GitHub gives the marker its own line; `> [!NOTE] text` is a blockquote, not an alert. */
const MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)](?:\n|$)/;

/** The plugin key is the node type unless a host renamed the plugin. */
const typeOf = (options: { editor?: SlateEditor }, key: string): string =>
  options.editor ? getPluginType(options.editor, key) : key;

interface Alert {
  variant: CalloutVariant;
  /** The blockquote's content with the marker line taken off it. */
  children: MdBlockquote['children'];
}

function readAlert(node: MdBlockquote): Alert | null {
  const [first, ...rest] = node.children;
  if (first?.type !== 'paragraph') return null;
  const [text, ...siblings] = first.children;
  if (text?.type !== 'text') return null;
  const match = MARKER.exec(text.value);
  if (match === null) return null;
  const variant = match[1]?.toLowerCase();
  if (!isCalloutVariant(variant)) return null;

  const value = text.value.slice(match[0].length);
  const head: MdParagraph['children'] =
    value === '' ? siblings : [{ type: 'text', value }, ...siblings];
  return {
    variant,
    // A marker on a line of its own leaves no paragraph behind, only the blocks under it.
    children: head.length === 0 ? rest : [{ children: head, type: 'paragraph' }, ...rest],
  };
}

/**
 * A callout the editor just inserted holds its text directly, the way a paragraph does; one
 * read from Markdown holds paragraphs. A blockquote can only hold blocks.
 */
const asBlocks = (children: Descendant[], options: { editor?: SlateEditor }): Descendant[] =>
  children.some((child) => TextApi.isText(child))
    ? [{ children, type: typeOf(options, KEYS.p) }]
    : children;

/**
 * `[!NOTE]` is syntax: as text `remark-stringify` escapes it to `\[!NOTE]` and it stops being
 * an alert. Raw HTML is the one node that passes through as its own bytes, and the newline
 * after it is the soft break that puts the content on the next `>` line.
 */
function withMarker(
  children: MdBlockquote['children'],
  variant: CalloutVariant,
): MdBlockquote['children'] {
  const marker: MdHtml = { type: 'html', value: `[!${variant.toUpperCase()}]` };
  const [first, ...rest] = children;
  if (first?.type !== 'paragraph') return [{ children: [marker], type: 'paragraph' }, ...children];
  return [
    { children: [marker, { type: 'text', value: '\n' }, ...first.children], type: 'paragraph' },
    ...rest,
  ];
}

/**
 * Kept for a blockquote the reader typed a marker into: it is still syntax, and escaping it
 * would rewrite a line the reader did not touch (D-02).
 */
function keepAlertMarker(first: MdBlockquote['children'][number] | undefined): void {
  if (first?.type !== 'paragraph') return;
  const [text] = first.children;
  if (text?.type !== 'text') return;
  const marker = /^\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)]/.exec(text.value)?.[0];
  if (marker === undefined) return;
  first.children = [
    { type: 'html', value: marker },
    { type: 'text', value: text.value.slice(marker.length) },
    ...first.children.slice(1),
  ];
}

/**
 * The rule pair of docs/05 section 5. `blockquote` owns both blocks on the way in, because
 * an alert is a blockquote until its first line has been read.
 */
export const calloutRules: MdRules = {
  blockquote: {
    deserialize: (node, deco, options) => {
      const alert = readAlert(node);
      if (alert === null) {
        return {
          children: convertNodesDeserialize(node.children, deco, options),
          type: typeOf(options, KEYS.blockquote),
        };
      }
      return {
        children: convertNodesDeserialize(alert.children, deco, options),
        icon: CALLOUT_ICONS[alert.variant],
        type: typeOf(options, KEYS.callout),
        variant: alert.variant,
      };
    },
    serialize: (node, options) => {
      const children = convertNodesSerialize(
        node.children,
        options,
        true,
      ) as MdBlockquote['children'];
      keepAlertMarker(children[0]);
      return { children, type: 'blockquote' };
    },
  },
  [KEYS.callout]: {
    serialize: (node, options) => {
      const children = convertNodesSerialize(
        asBlocks(node.children, options),
        options,
        true,
      ) as MdBlockquote['children'];
      const variant = isCalloutVariant(node.variant) ? node.variant : DEFAULT_CALLOUT_VARIANT;
      return { children: withMarker(children, variant), type: 'blockquote' };
    },
  },
};
