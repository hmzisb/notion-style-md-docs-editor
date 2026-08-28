import { parseHref, type TreeNode } from '@hmzisb/notion-docs-core';
import { useEffect, useState } from 'react';
import { useDocs } from './context.js';

const HTTP = /^https?:/i;
const DATA_IMAGE = /^data:image\//i;

export interface AssetUrlState {
  /** The URL to draw, or `null` while it resolves. */
  url: string | null;
  failed: boolean;
}

/**
 * docs/05 sections 6 and 11: a path relative to the page becomes a URL through `assetUrl`
 * (an object URL for local stores), `http(s)` is used as written, and `data:` needs the
 * host's permission. Both renderers resolve the same way, so both call this.
 */
export function useAssetUrl(src: string, node: TreeNode): AssetUrlState {
  const { options, provider } = useDocs();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const external = parseHref(src).external;
  const allowData = options.allowDataImages;

  useEffect(() => {
    // The image block of the editor has no `src` yet while it asks for one (docs/05 s.6).
    if (src === '') {
      setUrl(null);
      setFailed(false);
      return;
    }
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

  return { url, failed };
}
