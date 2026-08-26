import { BaseKit, type NodeId, type PageDocument, type TreeNode } from '@docs/core';
import { BaseListPlugin } from '@platejs/list';
import { createSlatePlugin } from 'platejs';
import { PlateView, usePlateViewEditor } from 'platejs/react';
import { useMemo } from 'react';
import { useTreeIndex } from '@/data/queries.js';
import { usePageValue } from '@/data/use-page-value.js';
import { cn } from '@/lib/utils';
import { ViewContext, type ViewContextValue } from './context.js';
import {
  FoldProvider,
  RAW_HTML_KEY,
  listBelowNodes,
  useFoldState,
  viewComponents,
} from './nodes.js';

export interface DocumentViewProps {
  page: PageDocument;
  /** The page's tree node: the base for its relative links and images. */
  node: TreeNode;
  /** The subtree the host shows, so a link resolves against what the reader can reach. */
  rootId?: NodeId;
  className?: string;
}

/**
 * The raw-HTML mark has no plugin in the codec's kit - it is a Markdown rule, not a block -
 * so the static renderer needs one here to reach {@link RAW_HTML_KEY}'s component.
 */
const RawHtmlPlugin = createSlatePlugin({ key: RAW_HTML_KEY, node: { isLeaf: true } });

/** The list plugin's own wrapper cannot draw a task marker, so the view supplies one. */
const ListView = BaseListPlugin.configure({ render: { belowNodes: listBelowNodes } });

const VIEW_PLUGINS = [
  ...BaseKit.map((plugin) => (plugin.key === ListView.key ? ListView : plugin)),
  RawHtmlPlugin,
];

/**
 * Read-only rendering (docs/05 section 7): `PlateView` over the same `BaseKit` the codec
 * parses with, so a page reads the same whether or not the editor chunk ever loads.
 */
export function DocumentView({
  page,
  node,
  rootId,
  className,
}: DocumentViewProps): React.JSX.Element {
  const { data: index } = useTreeIndex(rootId);
  const value = usePageValue(page);

  const editor = usePlateViewEditor(
    { plugins: VIEW_PLUGINS, value, override: { components: viewComponents } },
    [value],
  );

  const folds = useFoldState(value);

  const context = useMemo<ViewContextValue>(
    () => ({ node, idByPath: index?.idByPath ?? {} }),
    [node, index],
  );

  return (
    <ViewContext.Provider value={context}>
      <FoldProvider value={folds}>
        <PlateView editor={editor} className={cn('text-base leading-[1.65]', className)} />
      </FoldProvider>
    </ViewContext.Provider>
  );
}
