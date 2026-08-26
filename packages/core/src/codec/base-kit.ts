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
  type MdHtml,
  type MdParagraph,
  type MdRules,
  type SerializeMdOptions,
} from '@platejs/markdown';
import { BaseImagePlugin } from '@platejs/media';
import { BaseTablePlugin } from '@platejs/table';
import { BaseTogglePlugin } from '@platejs/toggle';
import { getPluginType, KEYS, type AnySlatePlugin } from 'platejs';
import remarkGfm from 'remark-gfm';
import { remarkInlineRefs } from './inline-refs.js';
import { calloutRules } from './rules/callout.js';
import { remarkToggles, toggleRules } from './rules/toggle.js';

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
 * Three fixes to the stock rules, all of them about not rewriting a file the user did not
 * touch (D-02). Each replaces one default; anything not named here stays Plate's. The
 * blockquote pair lives with the callout rule it shares a block with.
 */
const FIDELITY_RULES: MdRules = {
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
  /**
   * The void node the slash menu opens in. It carries no text - the query lives in the menu's
   * own input - but an autosave can catch a page while the menu is up, and with no rule the
   * serializer warns to a console that has to stay clean (docs/10 section 4).
   */
  [KEYS.slashInput]: { serialize: () => ({ type: 'text', value: '' }) },
  p: {
    serialize: (node, options) => ({
      children: convertNodesSerialize(node.children, options) as MdParagraph['children'],
      type: 'paragraph',
    }),
  },
};

/** The editor is optional on the options, and its plugin key is the type either way. */
const headingType = (options: DeserializeMdOptions, depth: number): string =>
  options.editor ? getPluginType(options.editor, `h${depth}`) : `h${depth}`;

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
        remarkPlugins: [remarkGfm, remarkInlineRefs, remarkToggles],
        remarkStringifyOptions: { ...DEFAULT_STRINGIFY_OPTIONS, ...opts.remarkStringifyOptions },
        rules: { ...FIDELITY_RULES, ...calloutRules, ...toggleRules, ...opts.rules },
      },
    }),
  ];
}

/** The kit as the module configures it: what static rendering and `defaultCodec` use. */
export const BaseKit: AnySlatePlugin[] = createBaseKit();
