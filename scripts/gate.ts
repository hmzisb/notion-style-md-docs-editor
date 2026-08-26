/**
 * Phase gates from docs/09. `pnpm gate <0|1|2|3|all>`.
 *
 * A step whose artefacts do not exist yet is reported as `skip`, never as a pass:
 * `pnpm gate 1` before the React package has a build is a skip, and the phase report
 * is what actually declares the phase finished.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const has = (p: string) => existsSync(resolve(ROOT, p));

interface Step {
  name: string;
  run: string;
  /** Step is only meaningful once these paths exist. */
  needs?: string[];
}

const GATE_0: Step[] = [
  { name: 'typecheck', run: 'pnpm typecheck' },
  { name: 'lint (boundaries)', run: 'pnpm lint' },
  { name: 'core tests', run: 'pnpm --filter @docs/core test' },
  { name: 'core build', run: 'pnpm --filter @docs/core build' },
  { name: 'publint', run: 'pnpm --filter @docs/core exec publint', needs: ['packages/core/dist'] },
  {
    name: 'attw',
    run: 'pnpm --filter @docs/core exec attw --pack --profile esm-only',
    needs: ['packages/core/dist'],
  },
  {
    name: 'contract up to date',
    run: 'pnpm contract:gen && git diff --exit-code contract/openapi.json',
    needs: ['packages/core/src/contract/openapi.ts'],
  },
  {
    name: 'doctor on corpus',
    // `pnpm run`, not the shorthand: pnpm 10 parses `--allow-lossy` itself (DEV-005).
    run: 'pnpm run doctor fixtures/corpus --allow-lossy',
    needs: ['scripts/doctor.ts'],
  },
];

const GATE_1: Step[] = [
  { name: 'react tests', run: 'pnpm --filter @docs/react test' },
  { name: 'react build', run: 'pnpm --filter @docs/react build', needs: ['packages/react/src'] },
  {
    name: 'react publint',
    run: 'pnpm --filter @docs/react exec publint',
    needs: ['packages/react/dist'],
  },
  {
    name: 'react attw',
    run: 'pnpm --filter @docs/react exec attw --pack --profile esm-only',
    needs: ['packages/react/dist'],
  },
  { name: 'size-limit', run: 'pnpm exec size-limit', needs: ['packages/react/dist'] },
  { name: 'playground typecheck', run: 'pnpm --filter playground typecheck' },
  { name: 'e2e', run: 'pnpm test:e2e', needs: ['apps/playground/playwright.config.ts'] },
];

const GATE_2: Step[] = [];
const GATE_3: Step[] = [
  // Both of these are stopwatches, so neither shares a machine with the rest of the suite:
  // the codec budget runs alone, and the browser ones run one worker against a real build.
  { name: 'perf budgets (node)', run: 'pnpm test:perf', needs: ['fixtures/perf/serialize.test.ts'] },
  {
    name: 'perf budgets (browser)',
    run: 'pnpm test:e2e:perf',
    needs: ['apps/playground/playwright.perf.config.ts'],
  },
  { name: 'smoke hosts', run: 'pnpm smoke', needs: ['smoke/tailwind-host', 'smoke/plain-host'] },
  { name: 'changeset status', run: 'pnpm changeset status', needs: ['.changeset/config.json'] },
];

/** Gates are cumulative: gate N runs every step of gates 0..N. docs/09. */
const GATES: Record<string, Step[]> = { '0': GATE_0, '1': GATE_1, '2': GATE_2, '3': GATE_3 };

function stepsFor(phase: number): Step[] {
  const out: Step[] = [];
  const seen = new Set<string>();
  for (let i = 0; i <= phase; i++) {
    for (const s of GATES[String(i)] ?? []) {
      if (seen.has(s.name)) continue;
      seen.add(s.name);
      out.push(s);
    }
  }
  return out;
}

function reportPath(phase: number) {
  return `docs/execution/PHASE-${phase}-REPORT.md`;
}

function runGate(phase: number): boolean {
  const steps = stepsFor(phase);
  console.log(`\n=== Gate ${phase} · ${steps.length} steps ===\n`);
  const results: { name: string; status: 'pass' | 'fail' | 'skip' }[] = [];
  let failed = false;

  for (const step of steps) {
    if (step.needs?.some((p) => !has(p))) {
      console.log(`- ${step.name}: skip (missing ${step.needs.filter((p) => !has(p)).join(', ')})`);
      results.push({ name: step.name, status: 'skip' });
      continue;
    }
    process.stdout.write(`- ${step.name}: `);
    try {
      execSync(step.run, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
      console.log('pass');
      results.push({ name: step.name, status: 'pass' });
    } catch (error) {
      console.log('FAIL');
      const e = error as { stdout?: Buffer; stderr?: Buffer };
      console.error(String(e.stdout ?? '') + String(e.stderr ?? ''));
      results.push({ name: step.name, status: 'fail' });
      failed = true;
    }
  }

  const report = reportPath(phase);
  const hasReport = has(report) && readFileSync(resolve(ROOT, report), 'utf8').trim().length > 0;
  console.log(`- ${report}: ${hasReport ? 'present' : 'MISSING'}`);
  if (!hasReport) failed = true;

  const pass = results.filter((r) => r.status === 'pass').length;
  const skip = results.filter((r) => r.status === 'skip').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  console.log(
    `\nGate ${phase}: ${pass} pass, ${skip} skip, ${fail} fail — ${failed ? 'RED' : 'GREEN'}\n`,
  );
  return !failed;
}

const arg = process.argv[2] ?? 'all';

if (arg === 'all') {
  // CI: verify every phase that has been declared finished. A phase without a report
  // has not shipped yet, so it is not a CI failure.
  const done = [0, 1, 2, 3].filter((p) => has(reportPath(p)));
  if (done.length === 0) {
    console.log('No phase reports yet; running gate 0 steps without the report requirement.');
    const steps = stepsFor(0);
    let bad = false;
    for (const step of steps) {
      if (step.needs?.some((p) => !has(p))) continue;
      try {
        execSync(step.run, { cwd: ROOT, stdio: 'inherit' });
      } catch {
        bad = true;
      }
    }
    process.exit(bad ? 1 : 0);
  }
  const highest = Math.max(...done);
  process.exit(runGate(highest) ? 0 : 1);
} else {
  const phase = Number(arg);
  if (!Number.isInteger(phase) || phase < 0 || phase > 3) {
    console.error(`Unknown gate "${arg}". Use 0, 1, 2, 3 or all.`);
    process.exit(2);
  }
  process.exit(runGate(phase) ? 0 : 1);
}
