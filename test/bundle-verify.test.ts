import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, finishRun, newRun } from '../src/engine.js';
import { runScripted } from '../src/agents.js';
import { verifyEvidence, verifyReport } from '../src/replay.js';

const cli = process.env.CRASHLAB_TEST_CLI ?? fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const marker = 'private-submitted-value';
const incomplete = () => {
  const run = newRun('clean-control', 42, marker);
  finishRun(run);
  return { ...run, evaluation: evaluate(run) };
};
function bundle(runs: any[]) {
  return {
    report_version: '1.0.0', runs,
    summary: {
      total: runs.length,
      passed: runs.filter(r => evaluate(r).verdict === 'passed').length,
      failed: runs.filter(r => evaluate(r).verdict === 'failed').length,
      incomplete: runs.filter(r => evaluate(r).verdict === 'incomplete').length,
    },
  };
}
function workspace(t: { after: (fn: () => void) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'crashlab-bundle-verify-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function invoke(cwd: string, args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null, result.stderr);
  return result;
}
function safeFailure(input: unknown, expected: RegExp) {
  assert.throws(() => verifyEvidence(input), error => {
    assert.match((error as Error).message, expected);
    assert.doesNotMatch((error as Error).message, new RegExp(marker));
    return true;
  });
}

test('CLI verifies its saved passing and failing test bundles without extraction', t => {
  const dir = workspace(t);
  for (const agent of ['careful', 'reckless']) {
    const file = `${agent}.json`;
    const saved = invoke(dir, ['test', '--scenario', 'payment-timeout', '--runs', '2', '--agent', agent, '--out', file, '--json']);
    assert.equal(saved.status, agent === 'careful' ? 0 : 1, saved.stderr);
    const original = readFileSync(join(dir, file));
    const verified = invoke(dir, ['verify', file]);
    assert.equal(verified.status, 0, verified.stderr);
    assert.equal(verified.stderr, '');
    const result = JSON.parse(verified.stdout);
    assert.equal(result.kind, 'test-bundle');
    assert.equal(result.report_version, '1.0.0');
    assert.equal(result.verified, true);
    assert.deepEqual(result.summary, JSON.parse(saved.stdout).summary);
    const reports = JSON.parse(original.toString()).runs;
    assert.deepEqual(result.runs, reports.map((report: any, index: number) => ({
      index: index + 1, verified: true, events: report.events.length, verdict: report.evaluation.verdict,
    })));
    assert.deepEqual(readFileSync(join(dir, file)), original);
  }
});

test('CLI replays a saved all-scenario bundle and incomplete evidence with exit zero', t => {
  const dir = workspace(t);
  const saved = invoke(dir, ['test', '--scenario', 'all', '--out', 'all.json', '--json']);
  assert.equal(saved.status, 0, saved.stderr);
  const all = invoke(dir, ['verify', 'all.json']);
  assert.equal(all.status, 0, all.stderr);
  assert.equal(JSON.parse(all.stdout).summary.total, JSON.parse(saved.stdout).runs.length);
  writeFileSync(join(dir, 'incomplete.json'), JSON.stringify(bundle([incomplete()])));
  const result = invoke(dir, ['verify', 'incomplete.json']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).summary, { total: 1, passed: 0, failed: 0, incomplete: 1 });
});

test('mixed verdicts are counted from replay and safe results omit submitted metadata', () => {
  const passing = runScripted(newRun('payment-timeout', 42, marker), 'careful');
  const failing = runScripted(newRun('payment-timeout', 43, marker), 'reckless');
  const result = verifyEvidence(bundle([passing, failing, incomplete()]));
  assert.ok('summary' in result);
  assert.deepEqual(result.summary, { total: 3, passed: 1, failed: 1, incomplete: 1 });
  assert.doesNotMatch(JSON.stringify(result), new RegExp(marker));
});

test('single reports retain exact verification output including dashboard version and opaque metadata', t => {
  const dir = workspace(t);
  const report = { ...incomplete(), report_version: '1.0.0', runs: marker, summary: marker };
  assert.deepEqual(verifyEvidence(report), verifyReport(report));
  writeFileSync(join(dir, 'single.json'), JSON.stringify(report));
  const result = invoke(dir, ['verify', 'single.json']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, JSON.stringify(verifyReport(report), null, 2) + '\n');
});

test('bundle envelope rejects unsupported versions, missing fields, malformed counts and run bounds', () => {
  const edits = [
    (b: any) => delete b.report_version,
    (b: any) => b.report_version = '2.0.0',
    (b: any) => b.report_version = marker,
    (b: any) => delete b.runs,
    (b: any) => b.runs = marker,
    (b: any) => b.runs = [],
    (b: any) => b.runs = Array(1101).fill(incomplete()),
    (b: any) => delete b.summary,
    (b: any) => b.summary = null,
    (b: any) => b.summary.total = 1.5,
    (b: any) => b.summary.failed = -1,
    (b: any) => b.summary.passed = marker,
    (b: any) => b.summary.incomplete = Infinity,
    (b: any) => b.summary.extra = marker,
    ...['total', 'passed', 'failed', 'incomplete'].map(key => (b: any) => delete b.summary[key]),
  ];
  for (const edit of edits) {
    const input = bundle([incomplete()]); edit(input);
    safeFailure(input, /Invalid test bundle structure/);
  }
  for (const input of [null, false, [], {}, marker]) safeFailure(input, /Invalid report structure/);
});

test('public helper accepts the 1100-run bound without loosening file input limits', () => {
  const input = bundle(Array(1100).fill(incomplete()));
  const result = verifyEvidence(input);
  assert.ok('summary' in result);
  assert.equal(result.summary.total, 1100);
  assert.equal(result.summary.incomplete, 1100);
});

test('every summary count must agree with replay, not just the total', () => {
  for (const key of ['total', 'passed', 'failed', 'incomplete'] as const) {
    const input = bundle([incomplete()]);
    input.summary[key]++;
    safeFailure(input, /Test bundle summary differs from replayed evidence/);
  }
  const balanced = bundle([incomplete()]);
  balanced.summary.incomplete = 0; balanced.summary.passed = 1;
  safeFailure(balanced, /Test bundle summary differs from replayed evidence/);
});

test('invalid members and tampered evidence fail at a safe index without replaying later members', () => {
  for (const edit of [
    (r: any) => r.scenario = marker,
    (r: any) => r.scenario_version = marker,
    (r: any) => r.world = { private: marker },
    (r: any) => r.evaluation = { private: marker },
    (r: any) => r.payments.push({ private: marker }),
    (r: any) => r.status = marker,
  ]) {
    const input = bundle([incomplete(), incomplete()]); edit(input.runs[1]);
    safeFailure(input, /^Test bundle run 2 failed verification\.$/);
  }
  for (const member of [null, {}, marker, newRun('clean-control', 42, marker)]) {
    safeFailure({ ...bundle([incomplete(), incomplete()]), runs: [incomplete(), member] }, /^Test bundle run 2 failed verification\.$/);
  }
  const run = runScripted(newRun('payment-timeout', 42, marker), 'careful');
  const input = bundle([run]);
  (run.events[0].result as any).private = marker;
  safeFailure(input, /^Test bundle run 1 failed verification\.$/);
  const later = new Proxy({}, { get() { assert.fail('later member was replayed'); } });
  safeFailure({ ...bundle([incomplete(), incomplete()]), runs: [null, later] }, /^Test bundle run 1 failed verification\.$/);
});

test('CLI rejects malformed, tampered and versionless bundles without partial output or submitted values', t => {
  const dir = workspace(t);
  const saved = invoke(dir, ['test', '--scenario', 'payment-timeout', '--runs', '2', '--out', 'saved.json', '--json']);
  assert.equal(saved.status, 0, saved.stderr);
  const original = JSON.parse(readFileSync(join(dir, 'saved.json'), 'utf8'));
  const inputs = [
    JSON.parse(saved.stdout),
    { ...original, report_version: marker },
    { ...original, runs: [] },
    { ...original, summary: { ...original.summary, passed: 0 } },
    { ...original, runs: [original.runs[0], { ...original.runs[1], scenario: marker }] },
  ];
  for (const input of inputs) {
    writeFileSync(join(dir, 'invalid.json'), JSON.stringify(input));
    const result = invoke(dir, ['verify', 'invalid.json']);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, '');
    assert.doesNotMatch(result.stderr, new RegExp(marker));
  }
});
