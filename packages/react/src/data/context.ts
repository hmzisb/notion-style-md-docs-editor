import { createContext, useContext } from 'react';
import type { DocsContextValue } from './types.js';

export const DocsContext = createContext<DocsContextValue | null>(null);

export function useDocs(): DocsContextValue {
  const value = useContext(DocsContext);
  if (value === null) {
    throw new Error('useDocs must be used inside <DocsProvider>.');
  }
  return value;
}
