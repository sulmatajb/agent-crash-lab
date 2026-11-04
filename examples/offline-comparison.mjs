#!/usr/bin/env node
// A local CLI walkthrough with deterministic reference scripts, not model results.
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const scenario = 'payment-timeout';
const deadlineMs = 10_000;
function require(condition) {
  if (!condition) throw new Error('Unexpected walkthrough result.');
}

export function runExample() {
  if (!existsSync(cli)) throw new Error('Build the CLI first.');
  const directory = mkdtempSync(join(tmpdir(), 'crashlab-offline-comparison-'));
  let report;
  try {
    const commands = [];
    const invoke = args => {
      // These commands do not spawn agent processes. Bound this one CLI child,
      // its captured output and its wait; cleanup also runs on a timeout/error.
      const child = spawnSync(process.execPath, [cli, ...args], {
        cwd: directory, encoding: 'utf8', timeout: deadlineMs,
        killSignal: 'SIGKILL', maxBuffer: 2 * 1024 * 1024,
      });
      if (child.error || child.signal || child.status === null) throw new Error('CLI did not finish.');
      commands.push({ command: ['node', 'dist/cli.js', ...args], exit_code: child.status });
      return child;
    };
    const generate = (label, agent, seed, expected) => {
      const file = `${label}.json`;
      const child = invoke(['test', '--agent', agent, '--scenario', scenario,
        '--seed', String(seed), '--runs', '1', '--out', file]);
      require(child.status === (expected === 'passed' ? 0 : 1));
      const bundle = JSON.parse(readFileSync(join(directory, file), 'utf8'));
      require(bundle.runs.length === 1 && bundle.runs[0].evaluation.verdict === expected);
      require(bundle.runs[0].scenario === scenario && bundle.runs[0].seed === seed);
      return { label, agent, seed, exit_code: child.status,
        verdict: bundle.runs[0].evaluation.verdict,
        summary: Object.fromEntries(['total', 'passed', 'failed', 'incomplete'].map(key => [key, bundle.summary[key]])) };
    };
    const references = [generate('careful-42', 'careful', 42, 'passed'),
      generate('reckless-42', 'reckless', 42, 'failed'),
      generate('careful-43', 'careful', 43, 'passed')];
    const compare = (label, before, after, expectedExit, expectedVerdicts) => {
      const child = invoke(['compare', `${before}.json`, `${after}.json`, '--json']);
      const result = JSON.parse(child.stdout);
      require(child.status === expectedExit && result.exit_code === expectedExit);
      require(result.total === 1 && result.inconclusive === 0 && result.cases.length === 1);
      const row = result.cases[0];
      require(row.baseline.verdict === expectedVerdicts[0] && row.candidate.verdict === expectedVerdicts[1]);
      require(row.status === (expectedExit === 1 ? 'regression' : 'no-regression'));
      return { label, before, after, exit_code: child.status, total: result.total,
        regressions: result.regressions, inconclusive: result.inconclusive,
        case: row.case, status: row.status,
        before_verdict: row.baseline.verdict, after_verdict: row.candidate.verdict,
        reasons: row.reasons, observed_new_violations: row.observed_new_violations };
    };
    const comparisons = [
      compare('regression', 'careful-42', 'reckless-42', 1, ['passed', 'failed']),
      compare('improvement', 'reckless-42', 'careful-42', 0, ['failed', 'passed']),
      compare('both_failed', 'reckless-42', 'reckless-42', 0, ['failed', 'failed']),
    ];
    const rejected = invoke(['compare', 'careful-42.json', 'careful-43.json', '--json']);
    require(rejected.status === 2 && rejected.stdout.trim() === '');
    require(rejected.stderr.includes('Campaign coverage differs.') && rejected.stderr.includes('Scenario versions and seeds must match.'));
    comparisons.push({ label: 'unmatched_seed', before: 'careful-42', after: 'careful-43',
      exit_code: rejected.status, status: 'input_rejected', stderr_category: 'campaign_coverage_differs',
      diagnostic: 'Scenario versions and seeds must match.',
      diagnostic_note: 'Controlled summary of the checked CLI stderr; not a behavioral verdict.' });
    report = { example_version: 1, mode: 'deterministic_reference_scripts', model_calls: 0,
      scenario, child_deadline_ms: deadlineMs, references, comparisons, commands,
      limits: [
        'Reference scripts are transparent fixtures, not model evaluations.',
        'Improvement labels the failed-to-passed observation; the CLI status remains no-regression.',
        'No-regression can retain failed verdicts and is not a pass threshold or safety certification.',
        'Replay checks consistency, not authorship; this example estimates no statistical significance.',
        'Child timeouts are bounded. Normal/error cleanup is checked; abrupt parent termination cleanup is not guaranteed.',
      ] };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  require(!existsSync(directory));
  return { ...report, temporary_evidence_removed: true };
}

export function transcript(report) {
  return [
    'Offline comparison walkthrough — deterministic reference scripts; zero model calls.',
    ...report.references.map(row => `${row.label}: test exit ${row.exit_code}, verdict ${row.verdict}`),
    ...report.comparisons.map(row => `${row.label}: compare exit ${row.exit_code}, ${row.status}` +
      (row.before_verdict ? `, ${row.before_verdict} -> ${row.after_verdict}` : `, ${row.diagnostic}`)),
    'Both failed: exit 0 means no regression detected, not that either reference passed.',
    'Temporary evidence removed. All seven calls used the real local CLI.',
    ...report.limits,
  ].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(resolve(process.argv[1]))) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('After npm run build: node examples/offline-comparison.mjs [--json]\nRuns seven bounded local CLI calls; no model or account needed.');
  } else if (args.length > 1 || (args.length === 1 && args[0] !== '--json')) {
    console.error('Usage: node examples/offline-comparison.mjs [--json]');
    process.exitCode = 2;
  } else {
    try {
      const report = runExample();
      console.log(args[0] === '--json' ? JSON.stringify(report, null, 2) : transcript(report));
    } catch {
      console.error('Offline comparison example failed. Run npm run build and check the local CLI.');
      process.exitCode = 2;
    }
  }
}
