import { isOrderedList } from '@platejs/list';
import { Check, Copy } from 'lucide-react';
import {
  KEYS,
  NodeApi,
  type NodeComponents,
  type RenderStaticNodeWrapper,
  type TCodeBlockElement,
  type TElement,
  type TCaptionProps,
  type TImageElement,
  type TListProps,
} from 'platejs';
import {
  SlateElement,
  SlateLeaf,
  type SlateElementProps,
  type SlateLeafProps,
  type SlateRenderElementProps,
} from 'platejs/static';
import { useEffect, useState, type ReactNode } from 'react';
import { blockStyles } from '@/lib/block-styles.js';
import { useDocs } from '@/data/context.js';
import { cn } from '@/lib/utils';
import { AssetImage } from './AssetImage.js';
import { useView } from './context.js';
import { LinkStatic } from './LinkStatic.js';

/**
 * Static components for the v1 block set (docs/05 section 2, docs/06 sections 3 and 7).
 * Read-only by construction: nothing here writes to the editor, and the only interactive
 * parts are the ones docs/05 section 7 keeps - link navigation and the code copy button.
 */

/** Plate keeps lists flat: indent, marker and checkbox all live on the block itself. */
const INDENT_STEP = 24;

/** The mark core's kit writes raw HTML into, rather than dropping the bytes (DEV-003). */
export const RAW_HTML_KEY = 'html';

type BlockProps = Partial<TListProps> & TElement;

/** The block's own left margin, which is also the column its list marker draws in. */
function indentStyle(element: TElement): { marginLeft?: string } {
  const { indent = 0 } = element as BlockProps;
  return indent > 0 ? { marginLeft: `${String(indent * INDENT_STEP)}px` } : {};
}

/**
 * Plate's own list wrapper (`BaseListPlugin.render.belowNodes`) draws `list-style-type: todo`,
 * which no browser has a marker for, and gives a task item no checkbox. This replaces it for
 * every list: one list per item, because that is how Plate models an indent list.
 */
export const listBelowNodes: RenderStaticNodeWrapper = ({ element }) =>
  (element as BlockProps).listStyleType === undefined ? undefined : ListWrapper;

/**
 * docs/06 section 7: a 24 px marker column. The block's own `indent * 24` margin is that
 * column, so the list adds no padding of its own: the marker draws in the gutter to the left
 * of the text, and a task row is pulled back into it so its text lands on the same column.
 */
function ListWrapper({ element, children }: SlateRenderElementProps): ReactNode {
  const { checked, listStart, listStyleType } = element as BlockProps;
  const todo = listStyleType === KEYS.listTodo;
  const List = !todo && isOrderedList(element) ? 'ol' : 'ul';
  return (
    <List
      style={{ listStyleType: todo ? 'none' : listStyleType, margin: 0, padding: 0 }}
      start={listStart}
    >
      {todo ? (
        <li className="-ms-6 flex list-none items-start gap-2">
          <input
            type="checkbox"
            checked={checked === true}
            disabled
            readOnly
            className="mt-[0.45em] size-4 shrink-0 rounded-[3px] border border-foreground/40 accent-primary"
          />
          <span
            className={cn(
              'min-w-0 flex-1',
              checked === true && 'text-muted-foreground line-through',
            )}
          >
            {children}
          </span>
        </li>
      ) : (
        <li>{children}</li>
      )}
    </List>
  );
}

/** Every block that can carry an indent or a list marker renders through this. */
function Block({
  as,
  className,
  props,
}: {
  as?: 'blockquote' | 'div' | 'h1' | 'h2' | 'h3';
  className?: string;
  props: SlateElementProps;
}): React.JSX.Element {
  return (
    <SlateElement {...props} as={as} className={className} style={indentStyle(props.element)}>
      {props.children}
    </SlateElement>
  );
}

function ParagraphStatic(props: SlateElementProps): React.JSX.Element {
  return <Block props={props} className={blockStyles.p} />;
}

function H1Static(props: SlateElementProps): React.JSX.Element {
  return <Block props={props} as="h1" className={blockStyles.h1} />;
}

function H2Static(props: SlateElementProps): React.JSX.Element {
  return <Block props={props} as="h2" className={blockStyles.h2} />;
}

function H3Static(props: SlateElementProps): React.JSX.Element {
  return <Block props={props} as="h3" className={blockStyles.h3} />;
}

function BlockquoteStatic(props: SlateElementProps): React.JSX.Element {
  return <Block props={props} as="blockquote" className={blockStyles.blockquote} />;
}

/** Void: the hairline is decoration, the empty text child still has to render. */
function HrStatic(props: SlateElementProps): React.JSX.Element {
  return (
    <SlateElement {...props}>
      {/* 12 px of hit area around a 1 px rule (docs/06 section 7). */}
      <div className={blockStyles.hrBox}>
        <hr className={blockStyles.hrRule} />
      </div>
      {props.children}
    </SlateElement>
  );
}

function CodeBlockStatic(props: SlateElementProps<TCodeBlockElement>): React.JSX.Element {
  const { lang } = props.element;
  // Lines are blocks of their own, so the copied text has to put the breaks back.
  const code = props.element.children.map((line) => NodeApi.string(line)).join('\n');

  return (
    <SlateElement {...props} className={blockStyles.codeBlock} style={indentStyle(props.element)}>
      <div className="group/code relative rounded-md bg-muted">
        <div className="absolute top-1 right-1 flex items-center gap-1">
          {lang !== undefined && lang !== '' && (
            <span className="px-1 text-xs text-muted-foreground select-none">{lang}</span>
          )}
          <CopyButton text={code} />
        </div>
        <pre className="overflow-x-auto px-4 py-3 font-mono text-sm leading-6">
          <code>{props.children}</code>
        </pre>
      </div>
    </SlateElement>
  );
}

function CodeLineStatic(props: SlateElementProps): React.JSX.Element {
  return <SlateElement {...props} />;
}

/** docs/06 section 7: `Copy` turns into `Check` for 1.5 s. */
function CopyButton({ text }: { text: string }): React.JSX.Element {
  const { strings } = useDocs();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => {
      setCopied(false);
    }, 1500);
    return () => {
      clearTimeout(timer);
    };
  }, [copied]);

  return (
    <button
      type="button"
      aria-label={copied ? strings['editor.copiedCode'] : strings['editor.copyCode']}
      className="flex size-6 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-accent focus-visible:opacity-100 group-hover/code:opacity-100"
      onClick={() => {
        void copy(text).then(setCopied);
      }}
    >
      {copied ? (
        <Check aria-hidden="true" className="size-3.5" />
      ) : (
        <Copy aria-hidden="true" className="size-3.5" />
      )}
    </button>
  );
}

/**
 * The DOM types promise a clipboard on every navigator, but an insecure context has none and
 * the user can refuse the write. Both end here, and the button simply stays on `Copy`.
 */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function TableStatic(props: SlateElementProps): React.JSX.Element {
  return (
    <SlateElement {...props} className={blockStyles.table}>
      <table className="w-full border-collapse border border-border text-sm">
        <tbody>{props.children}</tbody>
      </table>
    </SlateElement>
  );
}

function TableRowStatic(props: SlateElementProps): React.JSX.Element {
  return <SlateElement {...props} as="tr" />;
}

function TableCellStatic(props: SlateElementProps): React.JSX.Element {
  return <SlateElement {...props} as="td" className={blockStyles.td} />;
}

function TableHeaderCellStatic(props: SlateElementProps): React.JSX.Element {
  return <SlateElement {...props} as="th" className={blockStyles.th} />;
}

/**
 * Void: `caption` holds the Markdown alt text and `url` the path as written. The caption
 * repeats the alt text, so a screen reader is told once (docs/06 section 7).
 */
/**
 * The Markdown alt text lands in `caption`, which is where Plate keeps it and where the
 * serializer reads it back from. It is alternative text, not a visible caption: docs/05
 * section 5 gives an image a caption of its own from a following italic paragraph, and that
 * rule is P2, so nothing is drawn under the image here.
 */
function ImageStatic(props: SlateElementProps<TImageElement & TCaptionProps>): React.JSX.Element {
  const { node } = useView();
  const { caption, url } = props.element;
  const title = props.element.title as string | undefined;
  const alt = caption === undefined ? '' : caption.map((line) => NodeApi.string(line)).join(' ');

  return (
    <SlateElement {...props} className={blockStyles.image} style={indentStyle(props.element)}>
      <AssetImage src={url} alt={alt} title={title} node={node} />
      {props.children}
    </SlateElement>
  );
}

/**
 * Raw HTML is preserved in the value so that saving gives the bytes back (DEV-003), but
 * docs/05 section 11 never renders it: neither as markup nor as the tags themselves.
 */
function RawHtmlStatic(props: SlateLeafProps): React.JSX.Element {
  return <SlateLeaf {...props} attributes={{ ...props.attributes, hidden: true }} />;
}

/** docs/06 section 3. */
function CodeLeafStatic(props: SlateLeafProps): React.JSX.Element {
  return <SlateLeaf {...props} as="code" className={blockStyles.code} />;
}

function BoldStatic(props: SlateLeafProps): React.JSX.Element {
  return <SlateLeaf {...props} as="strong" />;
}

function ItalicStatic(props: SlateLeafProps): React.JSX.Element {
  return <SlateLeaf {...props} as="em" />;
}

function StrikethroughStatic(props: SlateLeafProps): React.JSX.Element {
  return <SlateLeaf {...props} as="s" />;
}

/** Keyed by plugin key, which is how `override.components` reaches the static renderer. */
export const viewComponents: NodeComponents = {
  [KEYS.blockquote]: BlockquoteStatic,
  [KEYS.bold]: BoldStatic,
  [KEYS.code]: CodeLeafStatic,
  [KEYS.codeBlock]: CodeBlockStatic,
  [KEYS.codeLine]: CodeLineStatic,
  [KEYS.h1]: H1Static,
  [KEYS.h2]: H2Static,
  [KEYS.h3]: H3Static,
  [KEYS.hr]: HrStatic,
  [KEYS.img]: ImageStatic,
  [KEYS.italic]: ItalicStatic,
  [KEYS.link]: LinkStatic,
  [KEYS.p]: ParagraphStatic,
  [KEYS.strikethrough]: StrikethroughStatic,
  [KEYS.table]: TableStatic,
  [KEYS.td]: TableCellStatic,
  [KEYS.th]: TableHeaderCellStatic,
  [KEYS.tr]: TableRowStatic,
  [RAW_HTML_KEY]: RawHtmlStatic,
};
