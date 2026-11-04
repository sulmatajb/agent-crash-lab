import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { newRun, evaluate, finishRun } from '../src/engine.js';
import { runScripted } from '../src/agents.js';
import { verifyReport } from '../src/replay.js';
import { MAX_EVIDENCE_BYTES } from '../src/evidence-file.js';
import { splitBundle } from '../src/split.js';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const invoke = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 5000 });
const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex');
function fixture(t: any) {
  const dir = fs.mkdtempSync(join(tmpdir(), 'crashlab-split-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, input: join(dir, 'source.json'), out: join(dir, 'reports') };
}
function run(agent: 'careful' | 'reckless' = 'careful') {
  const value = runScripted(newRun('payment-timeout', 42, agent), agent);
  return { ...value, evaluation: evaluate(value) };
}

test('split preserves exact bundle bytes and complete run objects, with stable paths and viewer acceptance', t => {
  const { input, out } = fixture(t);
  const reports = [run(), run('reckless'), newRun('clean-control', 8, 'synthetic'), newRun('clean-control', 9, 'synthetic')];
  finishRun(reports[2], 'synthetic execution failure');
  finishRun(reports[3], 'synthetic incomplete work');
  for (const value of reports) value.id = '../../same-id';
  reports[0].execution = { adapter: 'synthetic', status: 'completed', model: 'fixture', final_response: 'preserve this claim' };
  Object.assign(reports[0], { notes: { number: 1.5, label: 'synthetic metadata', nested: ['x', null, true] } });
  reports[2].execution = { adapter: 'synthetic', status: 'error', final_response: 'fixture execution failed' };
  const raw = Buffer.from(JSON.stringify({ report_version: '1.0.0', summary: { author_claim: 'preserve, not verify' }, runs: reports }, null, 3) + '\n');
  fs.writeFileSync(input, raw);
  const inventory = splitBundle(input, out);
  assert.deepEqual(fs.readFileSync(input), raw);
  assert.deepEqual(fs.readFileSync(join(out, 'bundle.json')), raw);
  assert.equal(inventory.source.sha256, digest(raw));
  assert.deepEqual(inventory.reports.map(row => row.filename), ['run-0001.json', 'run-0002.json', 'run-0003.json', 'run-0004.json']);
  assert.deepEqual(inventory.reports.map(row => row.verdict), ['passed', 'failed', 'error', 'incomplete']);
  for (const [index, entry] of inventory.reports.entries()) {
    const bytes = fs.readFileSync(join(out, entry.filename));
    assert.equal(entry.index, index);
    assert.equal(entry.sha256, digest(bytes));
    assert.equal(entry.bytes, bytes.length);
    const extracted = JSON.parse(bytes.toString());
    assert.deepEqual(extracted, reports[index]);
    assert.equal(verifyReport(extracted).verified, true);
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(join(out, 'extraction.json'), 'utf8')), inventory);
  assert.match(inventory.limitation, /not authorship/);
});

test('legacy bundles are supported while declared outer and member versions remain enforced', t => {
  const { input, out } = fixture(t);
  fs.writeFileSync(input, JSON.stringify({ runs: [run()] }));
  assert.equal(splitBundle(input, out).reports.length, 1);
  for (const [index, value] of [
    { report_version: '99.0.0', runs: [run()] },
    { runs: [{ ...run(), report_version: '99.0.0' }] },
  ].entries()) {
    fs.writeFileSync(input, JSON.stringify(value));
    const target = `${out}-${index}`;
    assert.throws(() => splitBundle(input, target));
    assert.equal(fs.existsSync(target), false);
  }
});

test('invalid later members, empty or oversized counts, non-bundles and invalid JSON create no output', t => {
  const { input, out } = fixture(t);
  const values = [null, [], {}, run(), { runs: [] }, { runs: Array(1101).fill({}) }, { runs: [run(), { ...run(), world: {} }] }];
  for (const value of values) {
    const raw = JSON.stringify(value);
    fs.writeFileSync(input, raw);
    assert.throws(() => splitBundle(input, out));
    assert.equal(fs.existsSync(out), false);
    assert.equal(fs.readFileSync(input, 'utf8'), raw);
  }
  fs.writeFileSync(input, '{"PRIVATE_MARKER":');
  assert.throws(() => splitBundle(input, out), { message: 'Evidence is not valid JSON.' });
  assert.equal(fs.existsSync(out), false);
});

test('input limits and regular-file checks apply before output creation', t => {
  const { dir, input, out } = fixture(t);
  fs.writeFileSync(input, ' '.repeat(MAX_EVIDENCE_BYTES + 1));
  assert.throws(() => splitBundle(input, out), /10 MiB/);
  assert.throws(() => splitBundle(dir, out), /regular file/);
  assert.equal(fs.existsSync(out), false);
});

test('raw nonfinite and negative-zero metadata cannot be silently changed during extraction', t => {
  const { input, out } = fixture(t);
  for (const numberText of ['1e400', '-0']) {
    const raw = JSON.stringify({ runs: [{ ...run(), metadata: 'RAW_JSON_NUMBER' }] })
      .replace('"RAW_JSON_NUMBER"', numberText);
    assert.ok(raw.includes(`"metadata":${numberText}`));
    fs.writeFileSync(input, raw);
    assert.throws(() => splitBundle(input, out), /without changing saved values/);
    assert.equal(fs.existsSync(out), false);
    assert.equal(fs.readFileSync(input, 'utf8'), raw);
  }
});

test('existing directories, files and symlinks are never overwritten', t => {
  const { dir, input, out } = fixture(t);
  fs.writeFileSync(input, JSON.stringify({ runs: [run()] }));
  fs.mkdirSync(out);
  fs.writeFileSync(join(out, 'keep'), 'existing');
  const file = join(dir, 'file'), link = join(dir, 'link');
  fs.writeFileSync(file, 'existing file');
  fs.symlinkSync(out, link);
  for (const destination of [out, file, link, input]) {
    assert.throws(() => splitBundle(input, destination), /already exists/);
  }
  assert.equal(fs.readFileSync(join(out, 'keep'), 'utf8'), 'existing');
  assert.equal(fs.readFileSync(file, 'utf8'), 'existing file');
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
});

test('a partial write failure removes only newly created output and preserves source', t => {
  const { input, out } = fixture(t);
  const raw = JSON.stringify({ runs: [run()] });
  fs.writeFileSync(input, raw);
  const write = fs.writeFileSync;
  let calls = 0;
  t.mock.method(fs, 'writeFileSync', (...args: any[]) => {
    if (++calls === 2) {
      fs.writeSync(args[0], 'partial');
      throw new Error('injected write failure');
    }
    return (write as any)(...args);
  });
  assert.throws(() => splitBundle(input, out), /Created output was removed/);
  assert.equal(fs.existsSync(out), false);
  assert.equal(fs.readFileSync(input, 'utf8'), raw);
});

test('cleanup preserves unexpected additions and reports its limitation', t => {
  const { input, out } = fixture(t);
  fs.writeFileSync(input, JSON.stringify({ runs: [run()] }));
  const write = fs.writeFileSync;
  let calls = 0;
  t.mock.method(fs, 'writeFileSync', (...args: any[]) => {
    if (++calls === 2) {
      write(join(out, 'unexpected.txt'), 'other writer');
      throw new Error('injected write failure');
    }
    return (write as any)(...args);
  });
  assert.throws(() => splitBundle(input, out), /Cleanup was incomplete/);
  assert.deepEqual(fs.readdirSync(out), ['unexpected.txt']);
  assert.equal(fs.readFileSync(join(out, 'unexpected.txt'), 'utf8'), 'other writer');
});

test('actual CLI reference bundle extracts with exit zero even for consistent failed runs', t => {
  const { input, out } = fixture(t);
  const reference = invoke('test', '--agent', 'reckless', '--scenario', 'payment-timeout', '--runs', '2', '--out', input);
  assert.equal(reference.error, undefined);
  assert.equal(reference.status, 1, reference.stderr);
  const original = fs.readFileSync(input);
  const result = invoke('split', input, '--out', out, '--json');
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const inventory = JSON.parse(result.stdout);
  assert.equal(inventory.reports.length, 2);
  for (const entry of inventory.reports) {
    assert.equal(entry.verdict, 'failed');
    assert.equal(invoke('verify', join(out, entry.filename)).status, 0);
    assert.equal(verifyReport(JSON.parse(fs.readFileSync(join(out, entry.filename), 'utf8'))).verified, true);
  }
  assert.deepEqual(fs.readFileSync(input), original);
  const duplicate = invoke('split', input, '--out', out);
  assert.equal(duplicate.status, 2);
  assert.equal(duplicate.stdout, '');
  assert.deepEqual(fs.readFileSync(join(out, 'bundle.json')), original);
});

test('CLI usage and invalid bundle failures exit two without success output', t => {
  const { input, out } = fixture(t);
  fs.writeFileSync(input, JSON.stringify({ runs: [run(), {}] }));
  for (const args of [
    ['split'], ['split', input], ['split', input, 'extra', '--out', out],
    ['split', input, '--out', out, '--agent', 'reckless'], ['split', input, '--out', out],
  ]) {
    const result = invoke(...args);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.equal(fs.existsSync(out), false);
  }
});
