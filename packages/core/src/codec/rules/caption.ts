import type { MdImage, MdParagraph, MdRules } from '@platejs/markdown';
import {
  ElementApi,
  getPluginType,
  KEYS,
  NodeApi,
  type Descendant,
  type SlateEditor,
  type TElement,
  type Value,
} from 'platejs';

/**
 * Image captions (docs/05 section 5). Markdown has no caption, so one is written as the
 * italic paragraph after the image - which means the rule spans two blocks and neither half
 * fits in a rule alone. Reading, `remarkCaptions` moves that paragraph onto the image node
 * before the rules run; writing, `unfoldCaptions` puts it back as its own block.
 *
 * The alt text is the other half of this task: Plate's stock image rule keeps it in
 * `caption`, which docs/05 section 5 forbids once a caption is a caption - the two are
 * different strings and one may never overwrite the other. `alt` is therefore its own
 * property on the node, and `caption` holds only what the caption UI edits.
 */

/** The plugin key is the node type unless a host renamed the plugin. */
const typeOf = (options: { editor?: SlateEditor }, key: string): string =>
  options.editor ? getPluginType(options.editor, key) : key;

/** mdast, as this file walks it. `caption` is left behind by the remark pass below. */
interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

interface CaptionedImage extends MdNode {
  type: 'image';
  url: string;
  alt?: string | null;
  title?: string | null;
  caption?: string;
}

/** A paragraph holding one image and nothing else, which is how a block image is written. */
const imageOf = (node: MdNode | undefined): CaptionedImage | undefined => {
  if (node?.type !== 'paragraph' || node.children?.length !== 1) return undefined;
  const [only] = node.children;
  return only?.type === 'image' ? (only as CaptionedImage) : undefined;
};

/**
 * `*text*` alone in its paragraph. Only plain text inside it: a caption is one string on the
 * node, so an emphasis holding a link or a bold run would lose those bytes on the way back
 * out - such a paragraph stays a paragraph.
 */
const captionOf = (node: MdNode | undefined): string | undefined => {
  if (node?.type !== 'paragraph' || node.children?.length !== 1) return undefined;
  const [only] = node.children;
  if (only?.type !== 'emphasis') return undefined;
  const parts = only.children ?? [];
  if (parts.length === 0 || !parts.every((part) => part.type === 'text')) return undefined;
  return parts.map((part) => part.value ?? '').join('');
};

function attach(nodes: MdNode[]): MdNode[] {
  const out: MdNode[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node === undefined) continue;
    out.push(node);
    const image = imageOf(node);
    if (image === undefined) continue;
    const caption = captionOf(nodes[i + 1]);
    if (caption === undefined) continue;
    image.caption = caption;
    i += 1;
  }
  return out;
}

/**
 * Remark plugin. Runs on parse only, and at the top level only: an image in a table cell or
 * a list item has no room for a block after it, and `remarkToggles` has not folded anything
 * yet, so an image inside a `<details>` block is still a sibling here.
 */
export function remarkCaptions(): (tree: unknown) => void {
  return (tree) => {
    const root = tree as MdNode;
    root.children = attach(root.children ?? []);
  };
}

/** What the caption UI edits: one text node, which is what `CaptionTextarea` writes. */
const captionText = (node: Descendant): string => {
  if (!ElementApi.isElement(node) || node.type !== KEYS.img) return '';
  const caption = node.caption as Descendant[] | undefined;
  const [first] = caption ?? [];
  return first === undefined ? '' : NodeApi.string(first);
};

/**
 * Value -> value, run before serialization: every image with a caption grows the italic
 * paragraph that carries it, at the image's own indent so that a captioned image inside a
 * toggle keeps both blocks inside it (docs/05 section 5).
 */
export function unfoldCaptions(value: Value): Value {
  if (!value.some((node) => captionText(node) !== '')) return value;
  return value.flatMap((node) => {
    const text = captionText(node);
    if (text === '') return [node];
    const { caption: _caption, ...image } = node;
    const indent = image[KEYS.indent];
    return [
      image,
      {
        children: [{ [KEYS.italic]: true, text }],
        type: KEYS.p,
        ...(indent === undefined ? {} : { [KEYS.indent]: indent }),
      },
    ];
  });
}

export const captionRules: MdRules = {
  [KEYS.img]: {
    /**
     * Plate's stock rule reads the alt text into `caption` and writes it back from there.
     * Here they are two properties, so that editing one cannot rewrite the other.
     */
    deserialize: (node: CaptionedImage, _deco, options) => ({
      children: [{ text: '' }],
      type: typeOf(options, KEYS.img),
      url: node.url,
      ...(node.alt === undefined || node.alt === null || node.alt === '' ? {} : { alt: node.alt }),
      ...(typeof node.title === 'string' ? { title: node.title } : {}),
      ...(node.caption === undefined ? {} : { caption: [{ text: node.caption }] }),
    }),
    serialize: (node: TElement): MdImage => {
      const image: MdImage = {
        alt: typeof node.alt === 'string' && node.alt !== '' ? node.alt : undefined,
        title: typeof node.title === 'string' ? node.title : undefined,
        type: 'image',
        url: typeof node.url === 'string' ? node.url : '',
      };
      const paragraph: MdParagraph = { children: [image], type: 'paragraph' };
      // A block image is a paragraph holding one image, which is what Plate's own rule
      // returns here; the declared type says `image`, and the serializer follows the
      // behaviour rather than the type.
      return paragraph as unknown as MdImage;
    },
  },
};
