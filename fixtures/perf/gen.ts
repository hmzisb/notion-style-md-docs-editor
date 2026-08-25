/**
 * Perf corpus generators (docs/09 P0-T08). Deterministic: same options, same bytes,
 * so a timing run is comparable across machines and reruns. Output goes to a temp
 * directory because 5k files do not belong in git.
 *
 * Run directly:  pnpm perf:gen [--nodes 5000] [--blocks 3000] [--dir <path>]
 */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export interface PerfCorpusOptions {
  /** Total page nodes to emit, index pages included. */
  nodes?: number;
  /** Blocks in the single large page. */
  blocks?: number;
  /** Target directory. A fresh temp directory is created when omitted. */
  dir?: string;
}

export interface PerfCorpus {
  dir: string;
  /** Files written, including the large page. */
  files: number;
  /** Page nodes the walker should find. */
  nodes: number;
  /** Corpus-relative path of the large page. */
  largePage: string;
  bytes: number;
}

const FANOUT = 10;

/** Body of the large page: 3k blocks cycling through the block set the editor supports. */
export function generateLargePage(blocks: number): string {
  const out: string[] = ['---', 'title: Large page', '---', '', '# Large page', ''];
  for (let i = 1; i <= blocks; i++) {
    switch (i % 6) {
      case 0:
        out.push(`## Section ${String(i)}`, '');
        break;
      case 1:
        out.push(`Paragraph ${String(i)} with *emphasis*, **strong** text and \`code\`.`, '');
        break;
      case 2:
        out.push(`- item ${String(i)}.1`, `- item ${String(i)}.2`, `- item ${String(i)}.3`, '');
        break;
      case 3:
        out.push('```ts', `export const value${String(i)} = ${String(i)};`, '```', '');
        break;
      case 4:
        out.push(`> Blockquote ${String(i)}.`, '');
        break;
      default:
        out.push(`1. first ${String(i)}`, `2. second ${String(i)}`, '');
    }
  }
  return `${out.join('\n').trimEnd()}\n`;
}

/** One page file: frontmatter with a stable order so sibling sorting is exercised. */
function pageBody(title: string, order: number, depth: number): string {
  return [
    '---',
    `title: ${title}`,
    `order: ${String(order)}`,
    '---',
    '',
    `# ${title}`,
    '',
    `Generated page at depth ${String(depth)}. Links back to its [parent](./index.md).`,
    '',
  ].join('\n');
}

export async function generatePerfCorpus(opts: PerfCorpusOptions = {}): Promise<PerfCorpus> {
  const nodes = opts.nodes ?? 5000;
  const blocks = opts.blocks ?? 3000;
  const dir = opts.dir ?? (await mkdtemp(join(tmpdir(), 'docs-perf-')));

  const writes: Promise<void>[] = [];
  let bytes = 0;
  const write = (rel: string, text: string): void => {
    bytes += Buffer.byteLength(text);
    writes.push(
      mkdir(join(dir, dirname(rel)), { recursive: true }).then(() =>
        writeFile(join(dir, rel), text, 'utf8'),
      ),
    );
  };

  write('index.md', pageBody('Perf corpus', 10, 0));
  let written = 1;

  // Breadth-first: each queued directory gets an index page and FANOUT children,
  // which keeps the tree wide and shallow the way a real docs folder is.
  const queue: [rel: string, depth: number][] = [['', 0]];
  for (let head = 0; head < queue.length && written < nodes; head++) {
    const entry = queue[head];
    if (entry === undefined) break;
    const [parent, depth] = entry;
    for (let i = 1; i <= FANOUT && written < nodes; i++) {
      const slug = `${depth === 0 ? 'section' : 'topic'}-${String(i)}`;
      const rel = parent === '' ? slug : `${parent}/${slug}`;
      if (depth < 3) {
        write(`${rel}/index.md`, pageBody(`Section ${rel}`, i * 10, depth + 1));
        queue.push([rel, depth + 1]);
      } else {
        write(`${rel}.md`, pageBody(`Page ${rel}`, i * 10, depth + 1));
      }
      written++;
    }
  }

  const largePage = 'large-page.md';
  write(largePage, generateLargePage(blocks));

  await Promise.all(writes);
  return { dir, files: writes.length, nodes: written, largePage, bytes };
}

function flag(name: string, fallback: number): number {
  const at = process.argv.indexOf(`--${name}`);
  if (at === -1) return fallback;
  const raw = process.argv[at + 1];
  const value = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) {
  const at = process.argv.indexOf('--dir');
  const result = await generatePerfCorpus({
    nodes: flag('nodes', 5000),
    blocks: flag('blocks', 3000),
    dir: at === -1 ? undefined : process.argv[at + 1],
  });
  console.log(JSON.stringify(result, null, 2));
}
