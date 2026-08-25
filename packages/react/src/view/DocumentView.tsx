import {
  BaseKit,
  createCodec,
  defaultCodec,
  type NodeId,
  type PageDocument,
  type TreeNode,
} from '@docs/core';
import { BaseListPlugin } from '@platejs/list';
import { createSlatePlugin, type Value } from 'platejs';
import { PlateView, usePlateViewEditor } from 'platejs/react';
import { useMemo } from 'react';
import { createLru, valueCacheKey } from '@/data/cache/value-cache.js';
import { useDocs } from '@/data/context.js';
import { useTreeIndex } from '@/data/queries.js';
import { cn } from '@/lib/utils';
import { ViewContext, type ViewContextValue } from './context.js';
import { RAW_HTML_KEY, listBelowNodes, viewComponents } from './nodes.js';

export interface DocumentViewProps {
  page: PageDocument;
  /** The page's tree node: the base for its relative links and images. */
  node: TreeNode;
  /** The subtree the host shows, so a link resolves against what the reader can reach. */
  rootId?: NodeId;
  className?: string;
}

/**
 * L3 (docs/04 section 1): the same page bytes parse once. Keyed by namespace, id and
 * version, so two instances and two versions of a page never share an entry.
 */
const values = createLru<Value>();

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
  const { ns, options } = useDocs();
  const { data: index } = useTreeIndex(rootId);

  const codec = useMemo(
    () => (options.codec === undefined ? defaultCodec : createCodec(options.codec)),
    [options.codec],
  );
  const value = useMemo(
    () =>
      values.getOrCreate(valueCacheKey(ns, page.id, page.version), () => codec.toValue(page.body)),
    [codec, ns, page.body, page.id, page.version],
  );

  const editor = usePlateViewEditor(
    { plugins: VIEW_PLUGINS, value, override: { components: viewComponents } },
    [value],
  );

  const context = useMemo<ViewContextValue>(
    () => ({ node, idByPath: index?.idByPath ?? {} }),
    [node, index],
  );

  return (
    <ViewContext.Provider value={context}>
      <PlateView editor={editor} className={cn('text-base leading-[1.65]', className)} />
    </ViewContext.Provider>
  );
}
