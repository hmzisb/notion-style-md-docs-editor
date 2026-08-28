import { createCodec, defaultCodec, type Codec } from '@hmzisb/notion-docs-core';
import { useMemo } from 'react';
import { useDocs } from './context.js';

/**
 * The one codec of this instance. Parsing and serializing a page must use the same options,
 * or a round trip through the editor would rewrite Markdown the reader never touched.
 */
export function useCodec(): Codec {
  const { options } = useDocs();
  return useMemo(
    () => (options.codec === undefined ? defaultCodec : createCodec(options.codec)),
    [options.codec],
  );
}
