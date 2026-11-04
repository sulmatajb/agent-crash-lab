import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const example = fileURLToPath(new URL('../examples/offline-comparison.mjs', import.meta.url));

test('actual offline CLI walkthrough distinguishes regression, improvement, both-failed and rejected coverage', t => {
  const temp = mkdtempSync(join(tmpdir(), 'crashlab-example-test-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [example, '--json'], {
    encoding: 'utf8', timeout: 85_000, env: { ...process.env, TMPDIR: temp, TMP: temp, TEMP: temp },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.mode, 'deterministic_reference_scripts');
  assert.equal(report.model_calls, 0);
  assert.equal(report.commands.length, 7);
  assert.deepEqual(report.commands.map((x: any) => x.exit_code), [0, 1, 0, 1, 0, 0, 2]);
  assert.deepEqual(report.comparisons.map((x: any) => [x.label, x.status, x.before_verdict, x.after_verdict]), [
    ['regression', 'regression', 'passed', 'failed'],
    ['improvement', 'no-regression', 'failed', 'passed'],
    ['both_failed', 'no-regression', 'failed', 'failed'],
    ['unmatched_seed', 'input_rejected', undefined, undefined],
  ]);
  assert.ok(report.comparisons[0].observed_new_violations.length > 0);
  assert.equal(report.comparisons[2].regressions, 0);
  assert.equal(report.comparisons[3].stderr_category, 'campaign_coverage_differs');
  assert.equal(report.temporary_evidence_removed, true);
  assert.deepEqual(readdirSync(temp), []);
  assert.ok(!result.stdout.includes(temp));
  assert.ok(!result.stdout.includes(example));
});

test('unsupported path arguments fail clearly without echoing supplied paths', () => {
  const result = spawnSync(process.execPath, [example, '--out', '/private/sentinel'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'Usage: node examples/offline-comparison.mjs [--json]\n');
});

test('a stalled CLI child hits the real deadline and temporary evidence is removed', t => {
  // A disposable sibling layout exercises the actual supervisor/finally path.
  // This proves child-timeout cleanup, not cleanup after parent SIGINT/SIGKILL.
  const fixture = mkdtempSync(join(tmpdir(), 'crashlab-example-timeout-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  for (const name of ['examples', 'dist', 'temporary']) mkdirSync(join(fixture, name));
  const script = join(fixture, 'examples/offline-comparison.mjs');
  copyFileSync(example, script);
  writeFileSync(join(fixture, 'dist/cli.js'), 'setInterval(() => {}, 1000);\n');
  const temporary = join(fixture, 'temporary');
  const started = Date.now();
  const result = spawnSync(process.execPath, [script, '--json'], {
    encoding: 'utf8', timeout: 15_000, env: { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 2);
  assert.ok(Date.now() - started >= 9000);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'Offline comparison example failed. Run npm run build and check the local CLI.\n');
  assert.deepEqual(readdirSync(temporary), []);
  assert.ok(existsSync(script));
});
