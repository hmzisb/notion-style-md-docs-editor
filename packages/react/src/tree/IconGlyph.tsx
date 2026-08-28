import type { NodeKind, PageIcon } from '@hmzisb/notion-docs-core';
import { FileText, Folder } from 'lucide-react';
import { Suspense, lazy } from 'react';
import { cn } from '@/lib/utils';

/**
 * Lucide's dynamic import map is ~14 kB gz of thunks plus one chunk per icon. It is loaded
 * only when a page actually carries a `lucide:` icon, so a workspace of emoji and default
 * icons never pays for it (docs/09 P1-T06).
 */
const DynamicIcon = lazy(async () => {
  const { DynamicIcon: Icon } = await import('lucide-react/dynamic');
  return { default: Icon };
});

export interface IconGlyphProps {
  icon: PageIcon | undefined;
  kind: NodeKind;
  className?: string;
}

/** docs/06 section 5: emoji at `text-base`, Lucide at `size-4`, otherwise the kind default. */
export function IconGlyph({ icon, kind, className }: IconGlyphProps): React.JSX.Element {
  if (icon?.kind === 'emoji') {
    return (
      <span aria-hidden="true" className={cn('text-base leading-none', className)}>
        {icon.value}
      </span>
    );
  }

  if (icon?.kind === 'lucide') {
    const fallback = (): React.JSX.Element => <DefaultGlyph kind={kind} className={className} />;
    return (
      <Suspense fallback={fallback()}>
        <DynamicIcon
          // Frontmatter is free text: an unknown name renders the default glyph instead.
          name={icon.name as React.ComponentProps<typeof DynamicIcon>['name']}
          aria-hidden="true"
          className={cn('size-4', className)}
          fallback={fallback}
        />
      </Suspense>
    );
  }

  return <DefaultGlyph kind={kind} className={className} />;
}

function DefaultGlyph({ kind, className }: Omit<IconGlyphProps, 'icon'>): React.JSX.Element {
  const Glyph = kind === 'folder' ? Folder : FileText;
  return <Glyph aria-hidden="true" className={cn('size-4 text-muted-foreground/60', className)} />;
}
