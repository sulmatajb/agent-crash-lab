import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { newRun } from '../src/engine.js';
import { runScripted } from '../src/agents.js';
import { readEvidenceJson, parseEvidenceJson } from '../src/evidence-file.js';
import { verifyReport } from '../src/replay.js';
import { loadReports, compareReports } from '../src/compare.js';
import { splitBundle } from '../src/split.js';

const marker = 'SYNTHETIC_NOTE_BYTES';
const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const invoke = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 5000 });
function fixture(t: any) {
  const directory = fs.mkdtempSync(join(tmpdir(), 'crashlab-encoding-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const run = { ...runScripted(newRun('clean-control', 42, 'synthetic-careful'), 'careful'), fixture_note: marker };
  const encode = (value: unknown, bytes: Buffer) => {
    const raw = Buffer.from(JSON.stringify(value)), at = raw.indexOf(marker);
    assert.notEqual(at, -1);
    return Buffer.concat([raw.subarray(0, at), bytes, raw.subarray(at + marker.length)]);
  };
  const write = (bytes: Buffer) => {
    const report = join(directory, 'report.json'), bundle = join(directory, 'bundle.json');
    const reportBytes = encode(run, bytes), bundleBytes = encode({ report_version: '1.0.0', runs: [run] }, bytes);
    fs.writeFileSync(report, reportBytes); fs.writeFileSync(bundle, bundleBytes);
    return { report, bundle, reportBytes, bundleBytes };
  };
  return { directory, write };
}

for (const note of ['Synthetic café / 漢字 / 🙂', 'A literal replacement character: �']) {
  test(`valid UTF-8 text survives reader, comparison and extraction: ${note}`, t => {
    const { directory, write } = fixture(t), paths = write(Buffer.from(note));
    const report = readEvidenceJson(paths.report) as { fixture_note: string };
    assert.equal(report.fixture_note, note);
    assert.equal(verifyReport(report).verified, true);
    const loaded = loadReports(paths.report);
    assert.equal(compareReports(loaded, loaded).exit_code, 0);
    const out = join(directory, 'extracted'), result = splitBundle(paths.bundle, out);
    const extracted = JSON.parse(fs.readFileSync(join(out, result.reports[0].filename), 'utf8'));
    assert.equal(extracted.fixture_note, note);
    assert.deepEqual(fs.readFileSync(join(out, 'bundle.json')), paths.bundleBytes);
  });
}

test('malformed UTF-8 evidence fails before comparison or any extraction output', t => {
  const { directory, write } = fixture(t);
  const invalid = [[0xe9], [0x80], [0xe2, 0x82], [0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xff]];
  for (const [index, value] of invalid.entries()) {
    const paths = write(Buffer.concat([Buffer.from('PRIVATE_SENTINEL'), Buffer.from(value)]));
    const out = join(directory, `rejected-${index}`);
    assert.throws(() => readEvidenceJson(paths.report), /not valid UTF-8/);
    assert.throws(() => loadReports(paths.report), { message: 'Report is not valid UTF-8.' });
    assert.throws(() => splitBundle(paths.bundle, out), /not valid UTF-8/);
    assert.equal(fs.existsSync(out), false);
    assert.deepEqual(fs.readFileSync(paths.report), paths.reportBytes);
    assert.deepEqual(fs.readFileSync(paths.bundle), paths.bundleBytes);
  }
});

test('BOM and invalid JSON rejection remain unchanged; byte checks do not reject a literal replacement character', () => {
  assert.throws(() => parseEvidenceJson(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{}')])), { message: 'Evidence is not valid JSON.' });
  assert.throws(() => parseEvidenceJson(Buffer.from('{"PRIVATE_SENTINEL":')), { message: 'Evidence is not valid JSON.' });
  assert.deepEqual(parseEvidenceJson(Buffer.from('{"note":"�"}')), { note: '�' });
});

test('actual CLI rejects malformed UTF-8 without success output or output directory; valid Unicode stays usable', t => {
  const { directory, write } = fixture(t);
  for (const [index, bytes, accepted] of [
    [0, Buffer.from('Synthetic café / 漢字 / �'), true],
    [1, Buffer.concat([Buffer.from('PRIVATE_SENTINEL'), Buffer.from([0xe9])]), false],
  ] as const) {
    const paths = write(bytes), out = join(directory, `cli-${index}`);
    for (const args of [
      ['verify', paths.report],
      ['compare', paths.report, paths.report, '--json'],
      ['split', paths.bundle, '--out', out, '--json'],
    ]) {
      const result = invoke(...args);
      assert.equal(result.error, undefined);
      assert.equal(result.status, accepted ? 0 : 2, result.stderr);
      if (!accepted) { assert.equal(result.stdout, ''); assert.doesNotMatch(result.stderr, /PRIVATE_SENTINEL/); }
    }
    assert.equal(fs.existsSync(out), accepted);
    assert.deepEqual(fs.readFileSync(paths.bundle), paths.bundleBytes);
  }
});
