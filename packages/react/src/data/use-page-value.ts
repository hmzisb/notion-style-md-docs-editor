import type { PageDocument } from '@hmzisb/notion-docs-core';
import type { Value } from 'platejs';
import { useMemo } from 'react';
import { useCodec } from './codec.js';
import { useDocs } from './context.js';
import { valueCache, valueCacheKey } from './cache/value-cache.js';

/**
 * A page's parsed value, cached by `ns:id:version` (docs/04 section 1, L3). Same bytes means
 * the same object, which is what lets the read view hand its value straight to the editor.
 */
export function usePageValue(page: PageDocument): Value {
  const { ns } = useDocs();
  const codec = useCodec();
  return useMemo(
    () =>
      valueCache.getOrCreate(valueCacheKey(ns, page.id, page.version), () =>
        codec.toValue(page.body),
      ),
    [codec, ns, page.body, page.id, page.version],
  );
}
