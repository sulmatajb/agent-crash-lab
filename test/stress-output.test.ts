import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const sentinel = '{"synthetic_saved_evidence":"retain this baseline"}\n';
const invoke = (cwd: string, out?: string) => {
  const result = spawnSync(process.execPath, [cli, 'stress', '--worlds', '1', '--concurrency', '1', ...(out === undefined ? [] : ['--out', out])], { cwd, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null, result.stderr);
  return result;
};
const collision = (cwd: string, out: string) => {
  const result = invoke(cwd, out);
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Stress output already exists\. Choose a new --out filename to preserve existing evidence\./);
  assert.ok(!result.stderr.includes(sentinel.trim()));
};
const workspace = (t: { after: (cleanup: () => void) => void }) => {
  const dir = mkdtempSync(join(tmpdir(), 'crashlab-stress-output-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const verifyReport = (report: any) => {
  assert.equal(report.kind, 'infrastructure-stress-not-model-evaluation');
  assert.equal(report.passed, true);
  assert.equal(report.worlds, 1);
  assert.equal(report.concurrency, 1);
  assert.equal(report.engine_calls, 200);
  assert.equal(report.http_calls, 65);
  assert.equal(report.mcp_calls, 24);
  assert.equal(report.total_calls, 289);
  assert.equal(report.lost_events, 0);
  assert.equal(report.duplicate_payments_under_same_key, 0);
  assert.equal(report.restart_verified, true);
};

test('stress creates a private report and preserves stdout and no-out behavior', t => {
  const dir = workspace(t), out = join(dir, 'new.json');
  const saved = invoke(dir, out);
  assert.equal(saved.status, 0, saved.stderr);
  const report = JSON.parse(saved.stdout);
  verifyReport(report);
  assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')), report);
  if (process.platform !== 'win32') assert.equal(statSync(out).mode & 0o777, 0o600);
  const stdoutOnly = invoke(dir);
  assert.equal(stdoutOnly.status, 0, stdoutOnly.stderr);
  verifyReport(JSON.parse(stdoutOnly.stdout));
  assert.deepEqual(Object.keys(JSON.parse(stdoutOnly.stdout)), Object.keys(report));
});

test('stress preserves saved bytes and permissions through absolute and relative aliases', t => {
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

test('stress preserves evidence reached through a hard link', t => {
  const dir = workspace(t), out = join(dir, 'saved.json'), alias = join(dir, 'alias.json');
  writeFileSync(out, sentinel);
  linkSync(out, alias);
  const inode = statSync(out).ino;
  collision(dir, alias);
  assert.equal(readFileSync(out, 'utf8'), sentinel);
  assert.equal(readFileSync(alias, 'utf8'), sentinel);
  assert.equal(statSync(alias).ino, inode);
});

test('stress preserves symbolic links and their targets, including dangling links', { skip: process.platform === 'win32' }, t => {
  const dir = workspace(t), out = join(dir, 'saved.json');
  writeFileSync(out, sentinel);
  for (const target of ['saved.json', 'missing.json']) {
    const alias = join(dir, `${target}.link`);
    symlinkSync(target, alias);
    collision(dir, alias);
    assert.ok(lstatSync(alias).isSymbolicLink());
    assert.equal(readlinkSync(alias), target);
    assert.equal(readFileSync(out, 'utf8'), sentinel);
    assert.equal(existsSync(join(dir, 'missing.json')), false);
  }
});

test('stress preserves an existing output directory', t => {
  const dir = workspace(t), out = join(dir, 'saved');
  mkdirSync(out);
  writeFileSync(join(out, 'evidence.json'), sentinel);
  collision(dir, out);
  assert.ok(statSync(out).isDirectory());
  assert.equal(readFileSync(join(out, 'evidence.json'), 'utf8'), sentinel);
});

test('stress reports invalid output parents as runtime errors without creating files', t => {
  const dir = workspace(t), parent = join(dir, 'not-a-directory');
  writeFileSync(parent, sentinel);
  for (const out of [join(dir, 'missing', 'report.json'), join(parent, 'report.json')]) {
    const result = invoke(dir, out);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /ENOENT|ENOTDIR/);
    assert.doesNotMatch(result.stderr, /Stress output already exists/);
    assert.equal(existsSync(out), false);
  }
  assert.equal(readFileSync(parent, 'utf8'), sentinel);
  assert.equal(existsSync(join(dir, 'missing')), false);
});
