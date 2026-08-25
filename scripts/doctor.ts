/**
 * `pnpm doctor <folder> [--allow-lossy]` (docs/05 section 4).
 *
 * Runs the fidelity classifier over every Markdown file in a folder and prints what
 * opening and saving each page would do to it. Exits non-zero if any page is `lossy`,
 * so a host can put this in CI before adopting the module on a corpus.
 */
import { readFile, readdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import {
  classifyFidelity,
  defaultCodec,
  isHidden,
  splitFrontmatter,
  type Fidelity,
} from '@docs/core';

const args = process.argv.slice(2);
const allowLossy = args.includes('--allow-lossy');
const folder = args.find((arg) => !arg.startsWith('-'));

if (folder === undefined) {
  console.error('usage: pnpm doctor <folder> [--allow-lossy]');
  process.exit(2);
}

const root = resolve(folder);
const entries = await readdir(root, { recursive: true }).catch((error: unknown) => {
  const { code, message } = error as NodeJS.ErrnoException;
  console.error(`doctor: cannot read ${folder}: ${code ?? message}`);
  process.exit(2);
});

// Same exclusions as the provider walk, so the table lists the pages the module would show.
const paths = entries
  .map((path) => path.split(sep).join('/'))
  .filter((path) => path.endsWith('.md') && !isHidden(path))
  .sort();

const rows: { path: string; fidelity: Fidelity }[] = [];
for (const path of paths) {
  const { body } = splitFrontmatter(await readFile(resolve(root, path), 'utf8'));
  const errors: Error[] = [];
  const value = defaultCodec.toValue(body, (error) => errors.push(error));
  const fidelity = classifyFidelity(body, value);
  rows.push({
    path,
    // A page the codec could not read at all is worse than lossy, not better.
    fidelity:
      errors.length === 0
        ? fidelity
        : { level: 'lossy', reasons: [...fidelity.reasons, 'parse_error'] },
  });
}

const width = Math.max(4, ...rows.map((row) => row.path.length));
console.log(`${'page'.padEnd(width)}  level     reasons`);
console.log('-'.repeat(width + 20));
for (const { path, fidelity } of rows) {
  console.log(`${path.padEnd(width)}  ${fidelity.level.padEnd(8)}  ${fidelity.reasons.join(', ')}`);
}

const count = (level: Fidelity['level']): number =>
  rows.filter((row) => row.fidelity.level === level).length;
const lossy = count('lossy');
console.log(
  `\n${String(rows.length)} pages in ${folder}: ` +
    `${String(count('exact'))} exact, ${String(count('reformat'))} reformat, ${String(lossy)} lossy`,
);

if (lossy > 0 && !allowLossy) {
  console.error(`\n${String(lossy)} page(s) would lose content. Fix them, or pass --allow-lossy.`);
  process.exit(1);
}
