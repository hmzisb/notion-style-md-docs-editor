import { deserializeMd, markdownToAstProcessor, serializeMd, type MdRoot } from '@platejs/markdown';
import {
  createSlateEditor,
  ElementApi,
  KEYS,
  TextApi,
  type Descendant,
  type SlateEditor,
  type Value,
} from 'platejs';
import { createBaseKit, type BaseKitOptions } from './base-kit.js';

/**
 * Markdown <-> Plate value (docs/05 section 3). Markdown is canonical (D-02): the value is
 * transient, so every option that decides how bytes come back out is pinned in one place.
 */

export interface CodecOptions extends BaseKitOptions {
  /** Reserved. `remark-math` and the equation blocks are not part of v1 (docs/05 section 2). */
  math?: boolean;
}

export interface Codec {
  /** Parse a page body. `onError` receives a per-node failure; the rest of the page survives. */
  toValue: (body: string, onError?: (error: Error) => void) => Value;
  toMarkdown: (value: Value) => string;
  /**
   * `body` as mdast, under the same remark stack the codec parses with. Parse only:
   * the transformers (`remarkInlineRefs`) do not run, so the tree still holds the
   * reference links and definitions the deserializer rewrites. The fidelity
   * classifier needs that untouched view (docs/05 section 4).
   */
  toAst: (body: string) => MdRoot;
}

export function createCodec(opts: CodecOptions = {}): Codec {
  if (opts.math === true) {
    throw new Error('createCodec: math is not supported in v1; remark-math is not installed.');
  }

  // Building the editor costs more than most pages, and a read-only host may never
  // deserialize at all, so the first call pays for it (docs/05 section 3).
  let editor: SlateEditor | undefined;
  const ready = (): SlateEditor => (editor ??= createSlateEditor({ plugins: createBaseKit(opts) }));

  return {
    toValue: (body, onError) =>
      deserializeMd(ready(), body, { onError, preserveEmptyParagraphs: true, withoutMdx: true }),
    toMarkdown: (value) => serializeMd(ready(), { value: marked(withoutTrailingBlanks(value)) }),
    toAst: (body) => markdownToAstProcessor(ready(), body, { withoutMdx: true }),
  };
}

/** An empty paragraph, which is what the editor's trailing block and a blank line both are. */
const isBlankParagraph = (node: Descendant): boolean => {
  if (!ElementApi.isElement(node) || node.type !== KEYS.p) return false;
  const [child, ...rest] = node.children;
  return rest.length === 0 && child !== undefined && TextApi.isText(child) && child.text === '';
};

/**
 * Plate's marker for an empty paragraph: Markdown has no way to spell a blank block, so one
 * would be lost on the way out. Only top-level blocks get it. A table cell is a paragraph too
 * and an empty one is written `|  |`, so marking it there would rewrite bytes the user never
 * touched (D-02).
 */
const marked = (value: Value): Value =>
  value.map((node) =>
    isBlankParagraph(node) ? { ...node, children: [{ text: '\u200b' }] } : node,
  );

/**
 * docs/05 section 6 keeps an empty paragraph after the last block so the user can click below
 * the content. It is furniture, not content: written out it would be a `\u200b` line (the
 * marker an empty paragraph serializes to), so every save of a page ending in a heading, a
 * table or a code fence would grow one. Blank lines between blocks are left alone.
 */
const withoutTrailingBlanks = (value: Value): Value => {
  let end = value.length;
  while (end > 0) {
    const node = value[end - 1];
    if (node === undefined || !isBlankParagraph(node)) break;
    end -= 1;
  }
  return end === value.length ? value : value.slice(0, end);
};

/**
 * The comparison behind `exact` (docs/05 section 4): same text, ignoring line endings,
 * trailing whitespace, and the blank line a frontmatter block leaves at the top of a body.
 */
export function normalizeMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  return `${lines
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/^\n+|\n+$/g, '')}\n`;
}

export const defaultCodec: Codec = createCodec();
export const markdownToValue = defaultCodec.toValue;
export const valueToMarkdown = defaultCodec.toMarkdown;
