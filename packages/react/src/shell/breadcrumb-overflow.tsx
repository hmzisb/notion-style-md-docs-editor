import type { NodeId, TreeNode } from '@hmzisb/notion-docs-core';
import { MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { IconGlyph } from '@/tree/IconGlyph.js';
import { Button } from '@/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu';

export interface BreadcrumbOverflowProps {
  nodes: TreeNode[];
  label: string;
  onOpen: (id: NodeId) => void;
}

/**
 * The middle of a deep trail (docs/06 section 6). A chunk of its own because the Radix menu
 * stack behind it is the largest thing the shell entry pulls in, and a page fewer than four
 * levels down never shows this control at all (docs/02 section 7).
 */
export function BreadcrumbOverflow({
  nodes,
  label,
  onOpen,
}: BreadcrumbOverflowProps): React.JSX.Element {
  // The press is what mounted this, so the press is what it opens on.
  const [open, setOpen] = useState(true);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} className="text-muted-foreground">
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {nodes.map((node) => (
          <DropdownMenuItem
            key={node.id}
            onSelect={() => {
              onOpen(node.id);
            }}
          >
            <IconGlyph icon={node.icon} kind={node.kind} />
            <span className="truncate">{node.title}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
