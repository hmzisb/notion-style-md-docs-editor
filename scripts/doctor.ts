/**
 * `pnpm doctor <folder> [--allow-lossy] [--write-ids]` (docs/05 section 4).
 *
 * Runs the fidelity classifier over every Markdown file in a folder and prints what
 * opening and saving each page would do to it. Exits non-zero if any page is `lossy`,
 * so a host can put this in CI before adopting the module on a corpus.
 *
 * `--write-ids` first migrates the folder in place (docs/03 sections 4.2 and 4.3): a
 * frontmatter `id` per page, and a leading `# H1` hoisted into `title`.
 */
import { resolve } from 'node:path';
import {
  classifyFidelity,
  defaultCodec,
  isMarkdown,
  splitFrontmatter,
  type Fidelity,
} from '@hmzisb/notion-docs-core';
import { NodeFileStore } from './node-store.js';
import { writeIds } from './write-ids.js';

const args = process.argv.slice(2);
const allowLossy = args.includes('--allow-lossy');
const migrate = args.includes('--write-ids');
const folder = args.find((arg) => !arg.startsWith('-'));

if (folder === undefined) {
  console.error('usage: pnpm doctor <folder> [--allow-lossy] [--write-ids]');
  process.exit(2);
}

const store = new NodeFileStore(resolve(folder));
// The store walks the folder the way the provider does, so the table lists the pages the
// module would show: no dot-directories, no `node_modules`, no non-Markdown.
const entries = await store.list().catch((error: unknown) => {
  const { code, message } = error as NodeJS.ErrnoException;
  console.error(`doctor: cannot read ${folder}: ${code ?? message}`);
  process.exit(2);
});

const paths = entries
  .filter((entry) => entry.kind === 'file' && isMarkdown(entry.path))
  .map((entry) => entry.path)
  .sort();

if (migrate) {
  const written = await writeIds(store);
  for (const path of written.ids) console.log(`id       ${path}`);
  for (const path of written.titles) console.log(`title    ${path}`);
  console.log(
    `\n--write-ids: ${String(written.ids.length)} id(s) assigned, ` +
      `${String(written.titles.length)} title(s) hoisted out of the body, ` +
      `${String(written.scanned)} pages seen.\n`,
  );
}

const rows: { path: string; fidelity: Fidelity }[] = [];
for (const path of paths) {
  const { body } = splitFrontmatter(await store.readText(path));
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
