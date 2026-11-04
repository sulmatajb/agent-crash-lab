import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = process.env.CRASHLAB_TEST_CLI ?? fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const sentinel = '{"synthetic_saved_evidence":"keep the earlier run"}\n';
const workspace = (t: { after: (fn: () => void) => void }) => {
  const dir = mkdtempSync(join(tmpdir(), 'crashlab-test-output-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const invoke = (cwd: string, out?: string, extra: string[] = []) => {
  const result = spawnSync(process.execPath, [cli, 'test', '--scenario', 'payment-timeout', '--json', ...extra, ...(out === undefined ? [] : ['--out', out])], { cwd, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null, result.stderr);
  return result;
};
const collision = (cwd: string, out: string, extra: string[] = []) => {
  const result = invoke(cwd, out, extra);
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Test output already exists\. Choose a new --out filename to preserve existing evidence\./);
  assert.ok(!result.stderr.includes(sentinel.trim()));
};
function replay(cwd: string, file: string) {
  const report = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(report.report_version, '1.0.0');
  assert.equal(report.runs.length, 1);
  const selected = join(cwd, 'selected-run.json');
  writeFileSync(selected, JSON.stringify(report.runs[0]));
  const verified = spawnSync(process.execPath, [cli, 'verify', selected], { cwd, encoding: 'utf8', timeout: 15000 });
  assert.equal(verified.status, 0, verified.stderr);
  return report;
}

test('test saves a private replayable passing report and preserves no-out output', t => {
  const dir = workspace(t), out = join(dir, 'new.json');
  const saved = invoke(dir, out);
  assert.equal(saved.status, 0, saved.stderr);
  const report = replay(dir, out);
  assert.deepEqual(JSON.parse(saved.stdout), { summary: report.summary, runs: report.runs });
  assert.equal(report.summary.passed, 1);
  if (process.platform !== 'win32') assert.equal(statSync(out).mode & 0o777, 0o600);
  const before = readdirSync(dir).sort();
  const stdoutOnly = invoke(dir);
  assert.equal(stdoutOnly.status, 0, stdoutOnly.stderr);
  assert.equal(JSON.parse(stdoutOnly.stdout).summary.passed, 1);
  assert.deepEqual(readdirSync(dir).sort(), before);
});

test('test saves failed reference evidence with exit1 and protects it on retry', t => {
  const dir = workspace(t), out = join(dir, 'reckless.json');
  const saved = invoke(dir, out, ['--agent', 'reckless']);
  assert.equal(saved.status, 1, saved.stderr);
  const report = replay(dir, out), bytes = readFileSync(out);
  assert.equal(report.summary.failed, 1);
  collision(dir, out, ['--agent', 'reckless']);
  assert.deepEqual(readFileSync(out), bytes);
});

test('test preserves existing bytes and mode across relative and absolute aliases', t => {
  const dir = workspace(t), out = join(dir, 'saved.json');
  writeFileSync(out, sentinel, { mode: 0o640 });
  mkdirSync(join(dir, 'nested'));
  const mode = statSync(out).mode;
  for (const alias of [out, './saved.json', 'nested/../saved.json']) {
    collision(dir, alias);
    assert.equal(readFileSync(out, 'utf8'), sentinel);
    assert.equal(statSync(out).mode, mode);
  }
});

test('test preserves hard links and their shared content', t => {
  const dir = workspace(t), out = join(dir, 'saved.json'), alias = join(dir, 'alias.json');
  writeFileSync(out, sentinel); linkSync(out, alias);
  const inode = statSync(out).ino;
  collision(dir, alias);
  assert.equal(readFileSync(out, 'utf8'), sentinel);
  assert.equal(readFileSync(alias, 'utf8'), sentinel);
  assert.equal(statSync(alias).ino, inode);
});

test('test preserves symbolic and dangling links without creating targets', { skip: process.platform === 'win32' }, t => {
  const dir = workspace(t), out = join(dir, 'saved.json');
  writeFileSync(out, sentinel);
  for (const target of ['saved.json', 'missing.json']) {
    const alias = join(dir, `${target}.link`);
    symlinkSync(target, alias); collision(dir, alias);
    assert.ok(lstatSync(alias).isSymbolicLink());
    assert.equal(readlinkSync(alias), target);
    assert.equal(readFileSync(out, 'utf8'), sentinel);
    assert.equal(existsSync(join(dir, 'missing.json')), false);
  }
});

test('test preserves occupied directories', t => {
  const dir = workspace(t), out = join(dir, 'saved');
  mkdirSync(out); writeFileSync(join(out, 'evidence.json'), sentinel);
  collision(dir, out);
  assert.ok(statSync(out).isDirectory());
  assert.equal(readFileSync(join(out, 'evidence.json'), 'utf8'), sentinel);
});

test('test distinguishes bad output parents without creating directories', t => {
  const dir = workspace(t), parent = join(dir, 'not-a-directory');
  writeFileSync(parent, sentinel);
  for (const out of [join(dir, 'missing', 'report.json'), join(parent, 'report.json')]) {
    const result = invoke(dir, out);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /ENOENT|ENOTDIR/);
    assert.doesNotMatch(result.stderr, /Test output already exists/);
    assert.equal(existsSync(out), false);
  }
  assert.equal(readFileSync(parent, 'utf8'), sentinel);
  assert.equal(existsSync(join(dir, 'missing')), false);
});

test('test rejects explicit empty output without silently returning a report', t => {
  const dir = workspace(t);
  for (const out of ['', '   ']) {
    const result = invoke(dir, out);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /--out must name a new output file/);
  }
  assert.deepEqual(readdirSync(dir), []);
});

test('test concurrent writers admit only one new evidence file', async t => {
  const dir = workspace(t), out = join(dir, 'race.json');
  const run = () => new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'test', '--scenario', 'clean-control', '--json', '--out', out], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
    child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr }));
  });
  const results = await Promise.all([run(), run()]);
  assert.deepEqual(results.map(r => r.code).sort(), [0, 2]);
  const winner = results.find(r => r.code === 0)!, loser = results.find(r => r.code === 2)!;
  assert.equal(loser.stdout, ''); assert.match(loser.stderr, /Test output already exists/);
  const report = replay(dir, out);
  assert.deepEqual(JSON.parse(winner.stdout), { summary: report.summary, runs: report.runs });
});
