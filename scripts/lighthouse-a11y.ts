/**
 * Lighthouse accessibility score for the playground's page view (docs/01 section 6,
 * docs/10 section 1). `pnpm a11y:lighthouse [baseUrl]`, with `pnpm dev` already running.
 *
 * Lighthouse cannot click, and the playground only leaves the landing once a workspace has been
 * chosen, so the run targets `?bench=` - the generated workspace `e2e/perf.spec.ts` uses. One
 * URL then renders the whole shell: sidebar, tree, header, search, breadcrumb, article. The
 * prose on that page is deliberately thin; `e2e/a11y.spec.ts` is what audits the demo corpus,
 * and axe is the gate. This score is for the phase report.
 *
 * `lighthouse` is not a dependency of this repo (ASM-058): no gate runs it, so it is fetched
 * on demand rather than carried, with its Chrome, in every install.
 */
import { execFileSync } from 'node:child_process';
import { pathHashId } from '@hmzisb/notion-docs-core';

/** docs/01 section 6: "Lighthouse accessibility >= 95 on the playground page view." */
const MIN_SCORE = 95;
/** Enough nodes for a real tree without making the audit wait on 5,000 rows. */
const BENCH_NODES = 200;

interface AuditNode {
  selector?: string;
  snippet?: string;
  explanation?: string;
}
interface Audit {
  title: string;
  score: number | null;
  scoreDisplayMode: string;
  details?: { items?: { node?: AuditNode }[] };
}
interface Report {
  categories: { accessibility: { score: number | null; auditRefs: { id: string }[] } };
  audits: Record<string, Audit | undefined>;
}

const base = (process.argv[2] ?? 'http://localhost:5173').replace(/\/+$/, '');
// The root of the generated corpus; ids are derived from the path, so this needs no lookup.
const url = `${base}/p/${pathHashId('index.md')}?mode=read&bench=${String(BENCH_NODES)}`;

const reachable = await fetch(base).then(
  () => true,
  () => false,
);
if (!reachable) {
  console.error(`No server at ${base}. Start one with \`pnpm dev\`, or pass a base URL.`);
  process.exit(1);
}

console.log(`Auditing ${url}`);
let stdout: string;
try {
  stdout = execFileSync(
    'npx',
    [
      '-y',
      'lighthouse@12',
      url,
      '--only-categories=accessibility',
      '--output=json',
      '--quiet',
      '--chrome-flags=--headless=new',
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
} catch (error) {
  const e = error as { stdout?: string; stderr?: string };
  console.error(e.stderr ?? e.stdout ?? String(error));
  process.exit(1);
}

// `--quiet` silences the logger, but npx itself may still have written a line before it.
const report = JSON.parse(stdout.slice(stdout.indexOf('{'))) as Report;
const category = report.categories.accessibility;
const score = Math.round((category.score ?? 0) * 100);

const failed = category.auditRefs
  .map((ref) => [ref.id, report.audits[ref.id]] as const)
  .filter(([, audit]) => audit !== undefined && audit.score !== null && audit.score < 1);

for (const [id, audit] of failed) {
  console.log(`  fail  ${id}: ${audit?.title ?? ''}`);
  // Without the element a failing audit is a rule name, which is not enough to fix anything.
  for (const item of audit?.details?.items ?? []) {
    const node = item.node;
    if (node === undefined) continue;
    console.log(`        ${node.selector ?? ''} ${node.explanation ?? node.snippet ?? ''}`);
  }
}
console.log(`\nAccessibility ${String(score)} / 100 (minimum ${String(MIN_SCORE)})`);

if (score < MIN_SCORE) process.exit(1);
