import { parseHref, type TreeNode } from '@docs/core';
import { ImageOff } from 'lucide-react';
import { useEffect, useState } from 'react';
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

const HTTP = /^https?:/i;
const DATA_IMAGE = /^data:image\//i;

/**
 * docs/05 sections 6 and 11: a relative path becomes a URL through `assetUrl` (an object URL
 * for local stores), `http(s)` is used as written, and `data:` needs the host's permission.
 * A skeleton holds the space until the URL resolves; a failure names the path (docs/06 §7).
 */
export function AssetImage({
  src,
  alt,
  title,
  node,
  className,
}: AssetImageProps): React.JSX.Element {
  const { options, provider, strings } = useDocs();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const external = parseHref(src).external;
  const allowData = options.allowDataImages;

  useEffect(() => {
    if (external) {
      const allowed = HTTP.test(src) || (allowData && DATA_IMAGE.test(src));
      setUrl(allowed ? src : null);
      setFailed(!allowed);
      return;
    }

    let live = true;
    setUrl(null);
    setFailed(false);
    provider.assetUrl(src, node).then(
      (resolved) => {
        if (live) setUrl(resolved);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [src, external, allowData, node, provider]);

  if (failed) {
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
        setFailed(true);
      }}
    />
  );
}
