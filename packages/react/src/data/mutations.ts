import {
  applyMeta,
  buildIndex,
  isProviderError,
  parseIcon,
  type NodeId,
  type PageDocument,
  type PageMetaPatch,
  type TreeNode,
  type TreeSnapshot,
} from '@docs/core';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useDocs } from './context.js';

/**
 * docs/04 section 4: every mutation patches the cache with the pure `apply*` from core before
 * the provider is called, rolls that patch back if the call fails, and invalidates the tree on
 * settle so paths, order and anything the provider derived come back from the source of truth.
 */

export interface UpdateMetaVariables {
  id: NodeId;
  patch: PageMetaPatch;
  /** docs/03 section 4.7: only a fresh page's first title commit takes the file with it. */
  renameFile?: boolean;
}

/** What the cache held before the patch, so `onError` can put it back. */
interface MetaContext {
  tree: TreeSnapshot | undefined;
  page: PageDocument | undefined;
}

/** The tree is cached as a snapshot and indexed on read, so the patch goes back the same way. */
function patchTree(snapshot: TreeSnapshot, id: NodeId, patch: PageMetaPatch): TreeSnapshot {
  const next = applyMeta(buildIndex(snapshot), id, nodePatch(patch));
  // An id the tree does not hold, or a patch that changes nothing: `applyMeta` returns the
  // same index, and a version that did not move keeps `useTreeIndex` on its memoized index.
  if (next.version === snapshot.version) return snapshot;
  return { version: next.version, nodes: snapshot.nodes.map((node) => next.byId[node.id] ?? node) };
}

/** Frontmatter carries the icon as a string; a tree node carries it parsed (docs/03 section 5). */
function nodePatch(patch: PageMetaPatch): Partial<TreeNode> {
  return {
    ...(typeof patch.title === 'string' ? { title: patch.title } : {}),
    // `''` removes the icon, and `applyMeta` drops the key when the patch resolves to nothing.
    ...('icon' in patch ? { icon: parseIcon(patch.icon) } : {}),
  };
}

function patchPage(page: PageDocument, patch: PageMetaPatch): PageDocument {
  const meta = { ...page.meta, ...patch };
  if (patch.icon !== '') return { ...page, meta };
  const { icon: _icon, ...withoutIcon } = meta;
  return { ...page, meta: withoutIcon };
}

/**
 * Title and icon (docs/04 section 4). The open page and the tree row move together, so the
 * sidebar and the canvas never disagree while the write is in flight.
 */
export function useUpdateMeta(
  rootId?: NodeId,
): UseMutationResult<TreeNode, Error, UpdateMetaVariables, MetaContext> {
  const { keys, onEvent, provider } = useDocs();
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, patch, renameFile }: UpdateMetaVariables): Promise<TreeNode> =>
      provider.updateMeta(id, patch, renameFile === true ? { renameFile: true } : undefined),
    onMutate: async ({ id, patch }): Promise<MetaContext> => {
      const tree = keys.tree(rootId);
      const page = keys.page(id);
      // An in-flight read would land after the patch and undo it.
      await Promise.all([
        client.cancelQueries({ queryKey: tree }),
        client.cancelQueries({ queryKey: page }),
      ]);
      const context: MetaContext = {
        tree: client.getQueryData<TreeSnapshot>(tree),
        page: client.getQueryData<PageDocument>(page),
      };
      if (context.tree !== undefined) client.setQueryData(tree, patchTree(context.tree, id, patch));
      if (context.page !== undefined) client.setQueryData(page, patchPage(context.page, patch));
      return context;
    },
    onError: (error, { id }, context) => {
      if (context?.tree !== undefined) client.setQueryData(keys.tree(rootId), context.tree);
      if (context?.page !== undefined) client.setQueryData(keys.page(id), context.page);
      onEvent({ type: 'error', code: isProviderError(error) ? error.code : 'internal', id, error });
    },
    onSuccess: (_node, { id, patch }) => {
      if ('title' in patch) onEvent({ type: 'page:renamed', id });
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: keys.tree(rootId) });
    },
  });
}
