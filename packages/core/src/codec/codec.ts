import { deserializeMd, markdownToAstProcessor, serializeMd, type MdRoot } from '@platejs/markdown';
import { createSlateEditor, type SlateEditor, type Value } from 'platejs';
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
    toMarkdown: (value) => serializeMd(ready(), { preserveEmptyParagraphs: true, value }),
    toAst: (body) => markdownToAstProcessor(ready(), body, { withoutMdx: true }),
  };
}

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
