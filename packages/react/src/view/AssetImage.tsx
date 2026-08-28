import type { TreeNode } from '@hmzisb/notion-docs-core';
import { ImageOff } from 'lucide-react';
import { useState } from 'react';
import { useAssetUrl } from '@/data/assets.js';
import { useDocs } from '@/data/context.js';
import { format } from '@/data/strings.js';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/ui/skeleton';

export interface AssetImageProps {
  /** `src` as the Markdown wrote it: relative to the page, absolute, or a data URL. */
  src: string;
  alt: string;
  title?: string | undefined;
  /** The page the `src` is relative to, which is not always the open one. */
  node: TreeNode;
  className?: string;
}

/**
 * docs/05 sections 6 and 11: the URL comes from {@link useAssetUrl}, which is what the editor
 * resolves with too. A skeleton holds the space until it lands; a failure names the path
 * (docs/06 section 7).
 */
export function AssetImage({
  src,
  alt,
  title,
  node,
  className,
}: AssetImageProps): React.JSX.Element {
  const { strings } = useDocs();
  const { url, failed } = useAssetUrl(src, node);
  // Which `src` the browser refused, so a page that changes it gets another go.
  const [broken, setBroken] = useState<string | null>(null);

  if (failed || broken === src) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-sm text-muted-foreground">
        <ImageOff aria-hidden="true" className="size-4 shrink-0" />
        {format(strings['editor.imageMissing'], { path: src })}
      </span>
    );
  }

  if (url === null) return <Skeleton className="aspect-video w-full rounded-md" />;

  return (
    <img
      src={url}
      alt={alt}
      title={title}
      className={cn('max-w-full rounded-md', className)}
      onError={() => {
        setBroken(src);
      }}
    />
  );
}
