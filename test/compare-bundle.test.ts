import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compareReports, loadReports } from '../src/compare.js';
import { newRun, finishRun, evaluate, type Run } from '../src/engine.js';
import { runScripted } from '../src/agents.js';

const run = (agent: 'careful' | 'reckless' = 'careful', seed = 42) => runScripted(newRun('payment-timeout', seed, agent), agent);
const bundle = (runs: Run[]) => {
  const summary = { total: runs.length, passed: 0, failed: 0, incomplete: 0 };
  for (const report of runs) {
    const verdict = evaluate(report).verdict;
    assert.ok(verdict === 'passed' || verdict === 'failed' || verdict === 'incomplete');
    summary[verdict]++;
  }
  return { report_version: '1.0.0', summary, runs };
};
function fixture(t: { after: (callback: () => void) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'crashlab-compare-bundle-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'evidence.json');
  return { dir, file, write: (value: unknown) => writeFileSync(file, JSON.stringify(value)) };
}
const marker = 'private-bundle-note-do-not-echo';

test('native test bundles preserve the paired result and both verdicts', t => {
  const f = fixture(t), before = run(), after = run('reckless');
  f.write(bundle([before])); const baseline = loadReports(f.file);
  f.write(bundle([after])); const candidate = loadReports(f.file);
  assert.deepEqual(compareReports(baseline, candidate), compareReports([before], [after]));
  assert.equal(compareReports(candidate, candidate).exit_code, 0);
  assert.equal(compareReports(candidate, candidate).cases[0].candidate.verdict, 'failed');
  const incomplete = newRun('payment-timeout', 42, 'refusing'); finishRun(incomplete);
  f.write(bundle([incomplete]));
  assert.deepEqual(compareReports(baseline, loadReports(f.file)), compareReports([before], [incomplete]));
});

for (const field of ['total', 'passed', 'failed', 'incomplete'] as const) {
  test(`comparison rejects a mismatched native summary ${field}`, t => {
    const f = fixture(t), data = bundle([run()]); data.summary[field]++;
    f.write(data);
    assert.throws(() => loadReports(f.file), { message: 'Test bundle summary differs from replayed evidence.' });
  });
}

test('a declared collection requires both native version and complete summary', t => {
  const f = fixture(t), valid = bundle([run()]);
  const invalid: unknown[] = [
    { runs: valid.runs, summary: valid.summary },
    { runs: valid.runs, report_version: valid.report_version },
    ...[null, marker, 1, false, {}, []].map(report_version => ({ ...valid, report_version })),
    ...[null, marker, false, {}, []].map(summary => ({ ...valid, summary })),
    ...Object.keys(valid.summary).map(field => {
      const summary: Record<string, unknown> = { ...valid.summary }; delete summary[field];
      return { ...valid, summary };
    }),
    { ...valid, summary: { ...valid.summary, private_note: marker } },
  ];
  for (const data of invalid) {
    f.write(data);
    assert.throws(() => loadReports(f.file), { message: 'Invalid test bundle structure.' });
  }
});

test('declared summary counts reject non-integers and out-of-range values', t => {
  const f = fixture(t), valid = bundle([run()]);
  for (const value of [null, marker, true, -1, 0.5, 1101]) {
    f.write({ ...valid, summary: { ...valid.summary, passed: value } });
    assert.throws(() => loadReports(f.file), { message: 'Invalid test bundle structure.' });
  }
});

test('bundle replay failures return a safe member index before comparison', t => {
  const f = fixture(t), data = bundle([run('careful', 42), run('careful', 43)]);
  data.runs[1].scenario = marker;
  f.write(data);
  assert.throws(() => loadReports(f.file), { message: 'Test bundle run 2 failed verification.' });
  const running = newRun('payment-timeout', 42, 'running');
  f.write({ report_version: '1.0.0', summary: { total: 1, passed: 0, failed: 0, incomplete: 1 }, runs: [running] });
  assert.throws(() => loadReports(f.file), { message: 'Test bundle run 1 failed verification.' });
});

test('bare selected-case collections and supported single-report metadata retain behavior', t => {
  const f = fixture(t), report = run();
  for (const data of [{ runs: [report] }, { runs: [report], label: marker }]) {
    f.write(data); assert.deepEqual(loadReports(f.file), [report]);
  }
  const running = newRun('payment-timeout', 42, 'running');
  f.write({ runs: [running] });
  assert.equal(compareReports(loadReports(f.file), [report]).inconclusive, 1);
  for (const extra of [
    { report_version: '1.0.0' },
    { report_version: '1.0.0', summary: { private_note: marker } },
    { runs: marker, summary: marker },
  ]) {
    const data = { ...report, ...extra };
    f.write(data); const loaded = loadReports(f.file);
    assert.deepEqual(loaded, [data]);
    assert.deepEqual(compareReports(loaded, loaded), compareReports([report], [report]));
  }
  f.write({ ...report, report_version: marker });
  assert.throws(() => compareReports(loadReports(f.file), [report]), /Unsupported report version/);
});

test('a flattened collection cannot disguise an invalid envelope as a single report', t => {
  const f = fixture(t), report = run();
  f.write({ ...report, runs: [report], report_version: marker, summary: { private_note: marker } });
  assert.throws(() => loadReports(f.file), { message: 'Invalid test bundle structure.' });
});

test('native bundles inside directories are validated before returning any reports', t => {
  const f = fixture(t), reports = [run('careful', 42), run('careful', 43)];
  writeFileSync(join(f.dir, 'a.json'), JSON.stringify(reports[0]));
  f.write(bundle([reports[1]]));
  assert.deepEqual(loadReports(f.dir), reports);
  f.write({ ...bundle([reports[1]]), report_version: '99.0.0' });
  assert.throws(() => loadReports(f.dir), { message: 'Invalid test bundle structure.' });
});

test('empty and oversized collections retain aggregate input limits', t => {
  const f = fixture(t), data = bundle([run()]);
  for (const runs of [[], Array(1101).fill(null)]) {
    f.write({ ...data, runs });
    assert.throws(() => loadReports(f.file), /Expected 1–1100 reports across all input files/);
  }
});

test('actual CLI rejects invalid native envelopes on either side without output or saved comparison', t => {
  const f = fixture(t), valid = bundle([run()]), good = join(f.dir, 'good.json');
  writeFileSync(good, JSON.stringify(valid));
  const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
  const output = join(f.dir, 'comparison.json');
  for (const bad of [
    { ...valid, report_version: marker },
    { ...valid, summary: { ...valid.summary, passed: 0 } },
    { ...valid, runs: null },
    { ...valid, runs: marker },
    { ...valid, runs: undefined },
  ]) {
    f.write(bad); const original = readFileSync(f.file);
    for (const [before, after] of [[f.file, good], [good, f.file]]) {
      const p = spawnSync(process.execPath, [cli, 'compare', before, after, '--json', '--out', output], { encoding: 'utf8', timeout: 10000 });
      assert.equal(p.error, undefined); assert.equal(p.status, 2, p.stderr);
      assert.equal(p.stdout, ''); assert.equal(existsSync(output), false);
      assert.ok(!p.stderr.includes(marker)); assert.deepEqual(readFileSync(f.file), original);
    }
  }
  const nested = join(f.dir, 'reports'); mkdirSync(nested);
  writeFileSync(join(nested, 'a.json'), JSON.stringify({ ...valid, report_version: marker }));
  const p = spawnSync(process.execPath, [cli, 'compare', nested, good, '--json'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(p.status, 2); assert.equal(p.stdout, ''); assert.ok(!p.stderr.includes(marker));
});
