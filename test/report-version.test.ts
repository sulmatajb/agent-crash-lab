import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { newRun, evaluate } from '../src/engine.js';
import { runScripted } from '../src/agents.js';
import { scenarios } from '../src/scenarios.js';
import { verifyReport } from '../src/replay.js';
import { compareReports, loadReports } from '../src/compare.js';

const report = () => runScripted(newRun('payment-timeout', 42, 'careful'), 'careful');
const unsupported = ['99.0.0', 'PRIVATE_VERSION_MARKER', null, 1, false, {}, []];
const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const invoke = (...args:string[]) => spawnSync(process.execPath, [cli, ...args], { encoding:'utf8', timeout:5000 });

test('shared verification preserves current and legacy evidence across every scenario', () => {
  for (const scenario of scenarios) {
    const original = runScripted(newRun(scenario.id, 42, 'careful'), 'careful');
    const exported = { ...original, report_version:'1.0.0', evaluation:evaluate(original) };
    const saved = JSON.stringify(exported);
    assert.deepEqual(verifyReport(exported), verifyReport(original));
    assert.equal(compareReports([original], [exported]).exit_code, 0);
    assert.equal(JSON.stringify(exported), saved);
  }
});

test('unsupported or malformed declared versions cannot produce verification or comparison success', () => {
  const good = report();
  for (const version of unsupported) {
    const bad = { ...good, report_version:version };
    const saved = JSON.stringify(bad);
    assert.throws(() => verifyReport(bad), /Unsupported report version/);
    assert.throws(() => compareReports([good], [bad]), /Unsupported report version/);
    assert.throws(() => compareReports([bad], [good]), /Unsupported report version/);
    assert.equal(JSON.stringify(bad), saved);
  }
});

test('version rejection occurs before replay and does not echo submitted metadata', () => {
  const bad = { ...report(), report_version:'PRIVATE_VERSION_MARKER', world:{} };
  assert.throws(() => verifyReport(bad), {
    message:'Unsupported report version. Expected 1.0.0 or legacy evidence without report_version.',
  });
});

test('comparison loader checks the outer bundle version before discarding its envelope', t => {
  const dir = mkdtempSync(join(tmpdir(), 'crashlab-version-bundle-'));
  t.after(() => rmSync(dir, { recursive:true, force:true }));
  const path = join(dir, 'bundle.json'), good = report();
  for (const envelope of [{ runs:[good] }, { report_version:'1.0.0', summary:{total:1,passed:1,failed:0,incomplete:0}, runs:[good] }]) {
    writeFileSync(path, JSON.stringify(envelope));
    assert.equal(compareReports([good], loadReports(path)).exit_code, 0);
  }
  for (const version of unsupported) {
    writeFileSync(path, JSON.stringify({ report_version:version, runs:[good] }));
    assert.throws(() => loadReports(path), /Invalid test bundle structure/);
  }
  writeFileSync(path, JSON.stringify({ report_version:'1.0.0', summary:{total:1,passed:1,failed:0,incomplete:0}, runs:[{ ...good, report_version:'99.0.0' }] }));
  assert.throws(() => compareReports([good], loadReports(path)), /Test bundle run 1 failed verification/);
});

test('CLI verify accepts current and legacy reports and rejects unsupported versions with safe exit 2', t => {
  const dir = mkdtempSync(join(tmpdir(), 'crashlab-version-verify-'));
  t.after(() => rmSync(dir, { recursive:true, force:true }));
  const path = join(dir, 'report.json'), good = report();
  for (const value of [good, { ...good, report_version:'1.0.0' }]) {
    writeFileSync(path, JSON.stringify(value));
    const result = invoke('verify', path);
    assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).verified, true);
  }
  for (const version of ['99.0.0', 'PRIVATE_VERSION_MARKER', null]) {
    const raw = JSON.stringify({ ...good, report_version:version });
    writeFileSync(path, raw);
    const result = invoke('verify', path);
    assert.equal(result.error, undefined); assert.equal(result.status, 2);
    assert.equal(result.stdout, ''); assert.match(result.stderr, /Unsupported report version/);
    assert.ok(!result.stderr.includes('PRIVATE_VERSION_MARKER'));
    assert.equal(readFileSync(path, 'utf8'), raw);
  }
});

test('CLI comparison rejects unsupported single and bundle versions without writing a green artifact', t => {
  const dir = mkdtempSync(join(tmpdir(), 'crashlab-version-compare-'));
  t.after(() => rmSync(dir, { recursive:true, force:true }));
  const good = report(), baseline = join(dir, 'baseline.json'), candidate = join(dir, 'candidate.json');
  const out = join(dir, 'comparison.json');
  writeFileSync(baseline, JSON.stringify(good));
  for (const value of [good, { ...good, report_version:'1.0.0' }, { runs:[good] }, { report_version:'1.0.0', summary:{total:1,passed:1,failed:0,incomplete:0}, runs:[good] }]) {
    writeFileSync(candidate, JSON.stringify(value));
    const result = invoke('compare', baseline, candidate, '--json');
    assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).exit_code, 0);
  }
  for (const value of [{ ...good, report_version:'99.0.0' }, { report_version:'99.0.0', runs:[good] }, { report_version:null, runs:[good] }]) {
    const raw = JSON.stringify(value); writeFileSync(candidate, raw);
    for (const pair of [[baseline, candidate], [candidate, baseline]]) {
      const result = invoke('compare', ...pair, '--json', '--out', out);
      assert.equal(result.error, undefined); assert.equal(result.status, 2);
      assert.equal(result.stdout, ''); assert.match(result.stderr, /Unsupported report version|Invalid test bundle structure/);
      assert.equal(existsSync(out), false); assert.equal(readFileSync(candidate, 'utf8'), raw);
    }
  }
});
