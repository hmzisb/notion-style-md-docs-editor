/**
 * Reference-style links (`[text][id]` with a `[id]: url` definition) have no editor
 * representation, so they are rewritten inline on the way in and come back out as
 * ordinary links: a `reformat`, never a drop (docs/05 section 4).
 */

/** The mdast shape this pass touches. The tree is remark's, and is mutated in place. */
interface MdNode {
  type: string;
  children?: MdNode[];
  identifier?: string;
  url?: string;
  title?: string | null;
  alt?: string | null;
  value?: string;
}

function definitionsOf(node: MdNode, into: Map<string, MdNode>): Map<string, MdNode> {
  if (node.type === 'definition' && node.identifier !== undefined) into.set(node.identifier, node);
  for (const child of node.children ?? []) definitionsOf(child, into);
  return into;
}

function inline(node: MdNode, defs: Map<string, MdNode>): void {
  if (!node.children) return;
  const kept: MdNode[] = [];
  for (const child of node.children) {
    inline(child, defs);
    if (child.type === 'definition') continue;
    if (child.type !== 'linkReference' && child.type !== 'imageReference') {
      kept.push(child);
      continue;
    }
    const target = child.identifier === undefined ? undefined : defs.get(child.identifier);
    if (!target) {
      // A reference with no definition is not a link at all: keep the words, drop the syntax.
      if (child.type === 'linkReference') kept.push(...(child.children ?? []));
      else if (child.alt) kept.push({ type: 'text', value: child.alt });
      continue;
    }
    kept.push(
      child.type === 'linkReference'
        ? {
            children: child.children ?? [],
            title: target.title ?? null,
            type: 'link',
            url: target.url,
          }
        : { alt: child.alt ?? null, title: target.title ?? null, type: 'image', url: target.url },
    );
  }
  node.children = kept;
}

/** Remark plugin. Runs on parse only: serialization never sees a reference to resolve. */
export function remarkInlineRefs(): (tree: unknown) => void {
  return (tree) => {
    const root = tree as MdNode;
    inline(root, definitionsOf(root, new Map()));
  };
}
