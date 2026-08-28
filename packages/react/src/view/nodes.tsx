import { COLOR_KEY, isTextColor } from '@hmzisb/notion-docs-core';
import { isOrderedList } from '@platejs/list';
import { Check, ChevronRight, Copy } from 'lucide-react';
import {
  KEYS,
  NodeApi,
  type NodeComponents,
  type Path,
  type RenderStaticNodeWrapper,
  type TCodeBlockElement,
  type TElement,
  type TCaptionProps,
  type TImageElement,
  type TListProps,
  type Value,
} from 'platejs';
import {
  SlateElement,
  SlateLeaf,
  type SlateElementProps,
  type SlateLeafProps,
  type SlateRenderElementProps,
} from 'platejs/static';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { blockStyles } from '@/lib/block-styles.js';
import { CALLOUT_VARIANTS, calloutVariantOf } from '@/lib/callout.js';
import { useDocs } from '@/data/context.js';
import { codeLanguageLabel } from '@/lib/code-languages';
import { copyText } from '@/lib/clipboard.js';
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
 * A list item spends its first indent step on its marker, so a list after a toggle is not
 * inside it - the same correction Plate's own toggle index makes (docs/05 section 5).
 */
function enclosedIndent(node: TElement): number {
  const { indent = 0, listStyleType } = node as BlockProps;
  return listStyleType !== undefined && indent > 0 ? indent - 1 : indent;
}

/**
 * The toggle each top-level block sits inside, by index, or -1: a block belongs to the toggle
 * above it while it is indented deeper than that toggle (docs/05 section 5).
 */
function toggleOwners(value: Value): number[] {
  const owners: number[] = [];
  const open: { index: number; level: number }[] = [];
  value.forEach((node, index) => {
    const level = enclosedIndent(node);
    // A toggle holds what is indented deeper than it, so anything else closes it.
    while ((open.at(-1)?.level ?? -1) >= level) open.pop();
    owners.push(open.at(-1)?.index ?? -1);
    if (node.type === KEYS.toggle) open.push({ index, level });
  });
  return owners;
}

interface FoldState {
  /** Whether the toggle at this index is open. */
  isOpen: (index: number) => boolean;
  /** Whether a folded toggle above this block is hiding it. */
  isHidden: (index: number) => boolean;
  fold: (index: number) => void;
}

/** Nothing folded, which is what a component rendered outside {@link DocumentView} gets. */
const FoldContext = createContext<FoldState>({
  fold: () => undefined,
  isHidden: () => false,
  isOpen: () => true,
});

const NONE: ReadonlySet<number> = new Set();

/**
 * docs/05 section 7: a toggle folds in read mode too, in local state. The blocks it hides are
 * the ones after it rather than its children, so what is hidden is worked out over the whole
 * value at once, and the reader's folds are dropped when a different page arrives.
 */
export function useFoldState(value: Value): FoldState {
  const [folds, setFolds] = useState<{ open: ReadonlySet<number>; value: Value }>({
    open: NONE,
    value,
  });
  const open = folds.value === value ? folds.open : NONE;
  const owners = useMemo(() => toggleOwners(value), [value]);

  return useMemo<FoldState>(
    () => ({
      fold: (index) => {
        const next = new Set(open);
        if (!next.delete(index)) next.add(index);
        setFolds({ open: next, value });
      },
      isHidden: (index) => {
        for (let owner = owners[index] ?? -1; owner !== -1; owner = owners[owner] ?? -1)
          if (!open.has(owner)) return true;
        return false;
      },
      isOpen: (index) => open.has(index),
    }),
    [open, owners, value],
  );
}

export const FoldProvider = FoldContext.Provider;

/**
 * Every block that can sit at the top level renders through this, because that is where a
 * folded toggle hides one: a block nested inside another is gone with its parent already.
 */
function foldable<P extends { path: Path }>(
  Component: (props: P) => React.JSX.Element,
): (props: P) => ReactNode {
  return function Foldable(props: P): ReactNode {
    const { isHidden } = useContext(FoldContext);
    if (props.path.length === 1 && isHidden(props.path[0] ?? 0)) return null;
    return <Component {...props} />;
  };
}

/**
 * docs/06 section 7: the chevron is the whole control, and the blocks it hides are the
 * indented siblings after it, which {@link useFoldState} works out.
 */
function ToggleStatic(props: SlateElementProps): React.JSX.Element {
  const { strings } = useDocs();
  const { fold, isOpen } = useContext(FoldContext);
  const index = props.path[0] ?? 0;
  const open = isOpen(index);

  return (
    <SlateElement {...props} className={blockStyles.toggle} style={indentStyle(props.element)}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={strings['editor.toggleBlocks']}
        className="mt-0.5 shrink-0 rounded-sm p-px select-none hover:bg-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        onClick={() => {
          fold(index);
        }}
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(blockStyles.toggleChevron, open && 'rotate-90')}
        />
      </button>
      <div className="w-full min-w-0">{props.children}</div>
    </SlateElement>
  );
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

/** docs/06 section 7: the variant tints the icon, and nothing else about the box. */
function CalloutStatic(props: SlateElementProps): React.JSX.Element {
  const { Icon, tint } = CALLOUT_VARIANTS[calloutVariantOf(props.element.variant)];
  return (
    <SlateElement {...props} className={blockStyles.callout}>
      <span contentEditable={false}>
        <Icon aria-hidden="true" className={cn(blockStyles.calloutIcon, tint)} />
      </span>
      <div className="w-full min-w-0">{props.children}</div>
    </SlateElement>
  );
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
        {/* `bg-muted`, the block's own colour: a long line scrolls under the label rather
            than through it. */}
        <div className="absolute top-1 right-1 flex items-center gap-1 rounded-md bg-muted pl-1">
          {lang !== undefined && lang !== '' && (
            <span className="px-1 text-xs text-muted-foreground select-none">
              {codeLanguageLabel(lang)}
            </span>
          )}
          <CopyButton text={code} />
        </div>
        {/* `pr-10`: the same room the editor keeps for the language label, so a long first
            line wraps identically in both modes and never runs under it. */}
        <pre className="overflow-x-auto px-4 py-3 pr-10 font-mono text-sm leading-6">
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
        void copyText(text).then(setCopied);
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
 * Void: `url` is the path as written, `alt` the Markdown alt text, and `caption` the visible
 * caption of docs/05 section 5 - the italic paragraph after the image. They are two different
 * strings and the codec keeps them apart, so a caption is drawn and the alt text is not.
 */
function ImageStatic(props: SlateElementProps<TImageElement & TCaptionProps>): React.JSX.Element {
  const { node } = useView();
  const { caption, url } = props.element;
  const title = props.element.title as string | undefined;
  const alt = typeof props.element.alt === 'string' ? props.element.alt : '';
  const [line] = caption ?? [];
  const text = line === undefined ? '' : NodeApi.string(line);

  return (
    <SlateElement {...props} className={blockStyles.image} style={indentStyle(props.element)}>
      <figure className={blockStyles.figure}>
        <AssetImage src={url} alt={alt} title={title} node={node} />
        {text !== '' && <figcaption className={blockStyles.caption}>{text}</figcaption>}
      </figure>
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

/** DEV-034: the same variable the editor's leaf paints from, so both modes agree. */
function ColorStatic(props: SlateLeafProps): React.JSX.Element {
  const { color } = props.leaf as { color?: unknown };
  return (
    <SlateLeaf
      {...props}
      style={isTextColor(color) ? { color: `var(--docs-text-${color})` } : undefined}
    />
  );
}

/** Keyed by plugin key, which is how `override.components` reaches the static renderer. */
export const viewComponents: NodeComponents = {
  [KEYS.blockquote]: foldable(BlockquoteStatic),
  [KEYS.callout]: foldable(CalloutStatic),
  [KEYS.bold]: BoldStatic,
  [KEYS.code]: CodeLeafStatic,
  [KEYS.codeBlock]: foldable(CodeBlockStatic),
  [KEYS.codeLine]: CodeLineStatic,
  [COLOR_KEY]: ColorStatic,
  [KEYS.h1]: foldable(H1Static),
  [KEYS.h2]: foldable(H2Static),
  [KEYS.h3]: foldable(H3Static),
  [KEYS.hr]: foldable(HrStatic),
  [KEYS.img]: foldable(ImageStatic),
  [KEYS.italic]: ItalicStatic,
  [KEYS.link]: LinkStatic,
  [KEYS.p]: foldable(ParagraphStatic),
  [KEYS.strikethrough]: StrikethroughStatic,
  [KEYS.table]: foldable(TableStatic),
  [KEYS.td]: TableCellStatic,
  [KEYS.th]: TableHeaderCellStatic,
  [KEYS.toggle]: foldable(ToggleStatic),
  [KEYS.tr]: TableRowStatic,
  [RAW_HTML_KEY]: RawHtmlStatic,
};
