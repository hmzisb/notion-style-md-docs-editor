import { ancestorsOf, type NodeId, type TreeIndex, type TreeNode } from '@hmzisb/notion-docs-core';
import { MoreHorizontal } from 'lucide-react';
import { Suspense, lazy, useState } from 'react';
import { useDocs } from '@/data/context.js';
import { cn } from '@/lib/utils';
import { IconGlyph } from '@/tree/IconGlyph.js';
import { Button } from '@/ui/button';

/** More ancestors than this and the middle ones move into the overflow menu (docs/06 §6). */
const MAX_ANCESTORS = 3;

const Overflow = lazy(async () => {
  const { BreadcrumbOverflow } = await import('./breadcrumb-overflow.js');
  return { default: BreadcrumbOverflow };
});

export interface BreadcrumbsProps {
  index: TreeIndex;
  pageId: NodeId;
  onOpen: (id: NodeId) => void;
  /** Below 768 px the header keeps the open page only (docs/06 §4). */
  compact?: boolean;
  className?: string;
}

export function Breadcrumbs({
  index,
  pageId,
  onOpen,
  compact = false,
  className,
}: BreadcrumbsProps): React.JSX.Element | null {
  const { strings } = useDocs();
  const trail = [...ancestorsOf(index, pageId), pageId]
    .map((id) => index.byId[id])
    .filter((node): node is TreeNode => node !== undefined);

  const current = trail.at(-1);
  if (current === undefined) return null;

  // The open page is always shown; only its ancestors collapse into the overflow menu.
  const ancestors = compact ? [] : trail.slice(0, -1);
  const overflow = ancestors.length > MAX_ANCESTORS;
  const leading = overflow ? ancestors.slice(0, 1) : ancestors;
  const hidden = overflow ? ancestors.slice(1, -2) : [];
  const trailing = overflow ? ancestors.slice(-2) : [];

  return (
    <nav aria-label={strings['header.breadcrumb']} className={cn('min-w-0', className)}>
      <ol className="flex min-w-0 items-center text-sm">
        {leading.map((node) => (
          <Crumb key={node.id} node={node} onOpen={onOpen} />
        ))}
        {hidden.length > 0 && (
          <li className="flex items-center">
            <More nodes={hidden} onOpen={onOpen} label={strings['header.breadcrumbMore']} />
            <Separator />
          </li>
        )}
        {trailing.map((node) => (
          <Crumb key={node.id} node={node} onOpen={onOpen} />
        ))}
        <li className="flex min-w-0 items-center gap-1.5 px-1.5">
          <IconGlyph icon={current.icon} kind={current.kind} />
          <span aria-current="page" className="max-w-[160px] truncate text-foreground">
            {current.title}
          </span>
        </li>
      </ol>
    </nav>
  );
}

/**
 * A button and nothing else until it is pressed: the menu behind it is a chunk of its own,
 * and the press is what fetches it - already open.
 */
function More({
  nodes,
  label,
  onOpen,
}: {
  nodes: TreeNode[];
  label: string;
  onOpen: (id: NodeId) => void;
}): React.JSX.Element {
  const [armed, setArmed] = useState(false);

  const button = (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-haspopup="menu"
      className="text-muted-foreground"
      // Pointer and keyboard both arrive here; the second call of a mouse press is a no-op.
      onPointerDown={() => {
        setArmed(true);
      }}
      onClick={() => {
        setArmed(true);
      }}
    >
      <MoreHorizontal aria-hidden="true" />
    </Button>
  );

  if (!armed) return button;
  return (
    <Suspense fallback={button}>
      <Overflow nodes={nodes} label={label} onOpen={onOpen} />
    </Suspense>
  );
}

function Crumb({
  node,
  onOpen,
}: {
  node: TreeNode;
  onOpen: (id: NodeId) => void;
}): React.JSX.Element {
  return (
    <li className="flex min-w-0 items-center">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 max-w-[160px] gap-1.5 px-1.5 font-normal text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() => {
          onOpen(node.id);
        }}
        title={node.title}
      >
        <IconGlyph icon={node.icon} kind={node.kind} />
        <span className="truncate">{node.title}</span>
      </Button>
      <Separator />
    </li>
  );
}

function Separator(): React.JSX.Element {
  return (
    <span aria-hidden="true" className="px-0.5 text-muted-foreground/50">
      /
    </span>
  );
}
