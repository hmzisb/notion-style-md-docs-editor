import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);

/**
 * jsdom answers no media queries, and `useIsMobile` (and every shadcn hook built on it) asks
 * one on mount. Desktop is the default; a test that wants the phone layout replaces this.
 */
window.matchMedia = (query: string): MediaQueryList =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;

/**
 * jsdom has no layout either: `offsetHeight` is 0, so a virtualizer would measure a viewport
 * that holds no rows. 800 x 240 is a sidebar's worth, 29 rows plus overscan.
 */
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 800 });
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 240 });

/** jsdom implements no pointer capture, which both Radix and the resize handle call into. */
for (const name of ['setPointerCapture', 'releasePointerCapture'] as const) {
  Object.defineProperty(HTMLElement.prototype, name, {
    configurable: true,
    value: () => undefined,
  });
}
Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
  configurable: true,
  value: () => false,
});
