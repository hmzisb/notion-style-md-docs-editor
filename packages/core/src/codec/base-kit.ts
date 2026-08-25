import {
  BaseBlockquotePlugin,
  BaseBoldPlugin,
  BaseCodePlugin,
  BaseH1Plugin,
  BaseH2Plugin,
  BaseH3Plugin,
  BaseHorizontalRulePlugin,
  BaseItalicPlugin,
  BaseStrikethroughPlugin,
} from '@platejs/basic-nodes';
import { BaseCalloutPlugin } from '@platejs/callout';
import { BaseCaptionPlugin } from '@platejs/caption';
import { BaseCodeBlockPlugin } from '@platejs/code-block';
import { BaseLinkPlugin } from '@platejs/link';
import { BaseListPlugin } from '@platejs/list';
import {
  MarkdownPlugin,
  convertChildrenDeserialize,
  convertNodesSerialize,
  type DeserializeMdOptions,
  type MdBlockquote,
  type MdHtml,
  type MdParagraph,
  type MdRules,
  type SerializeMdOptions,
} from '@platejs/markdown';
import { BaseImagePlugin } from '@platejs/media';
import { BaseTablePlugin } from '@platejs/table';
import { BaseTogglePlugin } from '@platejs/toggle';
import { getPluginType, type AnySlatePlugin, type Descendant } from 'platejs';
import remarkGfm from 'remark-gfm';
import { remarkInlineRefs } from './inline-refs.js';

/**
 * Headless plugin list for the v1 block set (docs/05 section 2), shared by the codec and
 * by static rendering. Root `@platejs/*` entries only: nothing here may import `/react`,
 * so that a page serializes identically in the editor, the viewer and Node.
 */

/** `remark-stringify` options, as the installed Markdown plugin types them. */
export type StringifyOptions = NonNullable<SerializeMdOptions['remarkStringifyOptions']>;

/**
 * Pinned so that a save never reflows a file the user did not touch (docs/05 section 3).
 * A host with its own markdownlint config overrides these through `createCodec`.
 */
export const DEFAULT_STRINGIFY_OPTIONS: StringifyOptions = {
  bullet: '-',
  emphasis: '*',
  fences: true,
  listItemIndent: 'one',
  resourceLink: false,
  rule: '-',
  strong: '*',
};

/**
 * Four fixes to the stock rules, all of them about not rewriting a file the user did not
 * touch (D-02). Each replaces one default; anything not named here stays Plate's.
 */
const FIDELITY_RULES: MdRules = {
  /** A GFM alert marker is syntax: escaped to `\[!NOTE]` it stops being an alert. */
  blockquote: {
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
  /**
   * H4-H6 are not in the block set, so they land on H3 rather than degrading to a
   * paragraph, and the serializer can never emit them back (`heading_level_clamped`).
   */
  heading: {
    deserialize: (node, deco, options) => ({
      children: convertChildrenDeserialize(node.children, deco, options),
      type: headingType(options, node.depth > 3 ? 3 : node.depth),
    }),
  },
  /**
   * Raw HTML survives as its own bytes instead of becoming escaped prose, which is what
   * Plate's default does to it (DEV-003). A text mark rather than an element, so that an
   * inline `<br>` or `<u>` stays inline; it is not editable, only preserved.
   */
  html: {
    mark: true,
    deserialize: (node: MdHtml) => ({ html: true, text: node.value }),
    serialize: (node: { text: string }) => ({ type: 'html', value: node.text }),
  },
  /**
   * A soft line break inside a paragraph stays a soft line break. Plate's default splits
   * the text on `\n` and emits a hard break, which puts a trailing `\` on every wrapped
   * line of every paragraph in the corpus and breaks marks that span a wrap.
   */
  p: {
    serialize: (node, options) => ({
      children: convertNodesSerialize(
        options.preserveEmptyParagraphs === false ? node.children : node.children.map(unempty),
        options,
      ) as MdParagraph['children'],
      type: 'paragraph',
    }),
  },
};

/** The editor is optional on the options, and its plugin key is the type either way. */
const headingType = (options: DeserializeMdOptions, depth: number): string =>
  options.editor ? getPluginType(options.editor, `h${depth}`) : `h${depth}`;

const ALERT_MARKER = /^\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)]/;

/** Splits a leading alert marker out of the first line so it serializes as raw bytes. */
function keepAlertMarker(first: MdBlockquote['children'][number] | undefined): void {
  if (first?.type !== 'paragraph') return;
  const [text] = first.children;
  if (text?.type !== 'text') return;
  const marker = ALERT_MARKER.exec(text.value)?.[0];
  if (marker === undefined) return;
  first.children = [
    { type: 'html', value: marker },
    { type: 'text', value: text.value.slice(marker.length) },
    ...first.children.slice(1),
  ];
}

/** Plate's marker for an empty paragraph: without it the blank block is lost on the way out. */
const unempty = (child: Descendant): Descendant =>
  'text' in child && child.text === '' ? { ...child, text: '\u200b' } : child;

export interface BaseKitOptions {
  /** Merged over {@link DEFAULT_STRINGIFY_OPTIONS}. */
  remarkStringifyOptions?: Partial<StringifyOptions>;
  /** Extra Markdown rules, merged over the fidelity rules above. */
  rules?: MdRules;
}

/**
 * Marks Plate knows about that this kit does not ship. Their stock rules serialize to MDX
 * JSX elements, which throws in non-MDX mode, so a value that carries one from anywhere
 * else would fail to save. As plain marks the styling is dropped and the words survive.
 */
const UNSHIPPED_MARKS = [
  'comment',
  'highlight',
  'kbd',
  'subscript',
  'suggestion',
  'superscript',
  'underline',
];

/**
 * Underline is not in the kit: `<u>` deserializes to raw HTML rather than to the mark, and
 * the mark serializes to an MDX JSX element that non-MDX stringify cannot handle (DEV-004).
 */
export function createBaseKit(opts: BaseKitOptions = {}): AnySlatePlugin[] {
  return [
    BaseH1Plugin,
    BaseH2Plugin,
    BaseH3Plugin,
    BaseBlockquotePlugin,
    BaseHorizontalRulePlugin,
    BaseBoldPlugin,
    BaseItalicPlugin,
    BaseStrikethroughPlugin,
    BaseCodePlugin,
    BaseListPlugin,
    BaseCodeBlockPlugin,
    BaseTablePlugin,
    BaseLinkPlugin,
    BaseImagePlugin,
    BaseCaptionPlugin,
    BaseCalloutPlugin,
    BaseTogglePlugin,
    MarkdownPlugin.configure({
      options: {
        plainMarks: UNSHIPPED_MARKS,
        remarkPlugins: [remarkGfm, remarkInlineRefs],
        remarkStringifyOptions: { ...DEFAULT_STRINGIFY_OPTIONS, ...opts.remarkStringifyOptions },
        rules: { ...FIDELITY_RULES, ...opts.rules },
      },
    }),
  ];
}

/** The kit as the module configures it: what static rendering and `defaultCodec` use. */
export const BaseKit: AnySlatePlugin[] = createBaseKit();
