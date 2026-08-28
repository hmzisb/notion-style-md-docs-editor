/**
 * `pnpm --filter @hmzisb/notion-docs-react build:css` (docs/11 section 4). Runs as tsup's `onSuccess`,
 * so `dist` always carries both sheets:
 *
 *   dist/styles.css - Tailwind utilities compiled from this package's own `.tsx`, plus the
 *                     `--docs-*` variables. No preflight and no theme reset, so importing it
 *                     into a non-Tailwind host cannot restyle anything outside `.docs-root`.
 *   dist/theme.css  - the opt-in theme, copied verbatim from source (see `gen-theme.ts`).
 */
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const at = (path: string): string =>
  fileURLToPath(new URL(`../packages/react/${path}`, import.meta.url));

await mkdir(at('dist'), { recursive: true });

// The CLI resolves `@source` and `@import` relative to the input file, not to cwd.
execFileSync(
  'pnpm',
  [
    'exec',
    'tailwindcss',
    '--input',
    at('src/styles/styles.css'),
    '--output',
    at('dist/styles.css'),
  ],
  { cwd: at('.'), stdio: 'inherit' },
);

/**
 * Tailwind parks the variables a utility depends on in `:root, :host`. Left there, they are
 * both a leak into the host and a bug: `--radius-md: calc(var(--radius) * 0.8)` resolves at
 * `:root`, where a plain host has no `--radius`, so every `rounded-md` inside the module
 * would compute to 0. Moving the block to `.docs-root` puts the definitions where the theme
 * that feeds them lives (docs/11 section 4).
 *
 * The `*, ::before, ::after, ::backdrop` block below it is Tailwind's `@property` fallback for
 * browsers that lack it; it only sets `--tw-*` to their initial values, which is what those
 * elements already compute, so it stays as Tailwind wrote it.
 */
const built = await readFile(at('dist/styles.css'), 'utf8');
const scoped = built.replaceAll(':root, :host', '.docs-root');
if (/:root|:host/.test(scoped)) {
  throw new Error('build-css: styles.css still defines something outside .docs-root');
}
await writeFile(at('dist/styles.css'), scoped);

await copyFile(at('src/styles/theme.css'), at('dist/theme.css'));
console.log('build-css: dist/styles.css, dist/theme.css');
