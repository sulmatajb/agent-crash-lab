import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, truncateSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readEvidenceJson, MAX_EVIDENCE_BYTES } from '../src/evidence-file.js';
import { newRun } from '../src/engine.js';
import { runScripted } from '../src/agents.js';

test('evidence reader accepts JSON at the limit and rejects oversized or non-file input', t => {
  const dir = mkdtempSync(join(tmpdir(), 'crashlab-evidence-')); t.after(() => rmSync(dir, {recursive:true,force:true}));
  const path = join(dir, 'report.json');
  writeFileSync(path, 'null' + ' '.repeat(MAX_EVIDENCE_BYTES - 4));
  assert.equal(readEvidenceJson(path), null);
  truncateSync(path, MAX_EVIDENCE_BYTES + 1);
  assert.throws(() => readEvidenceJson(path), /10 MiB/);
  assert.throws(() => readEvidenceJson(dir), /regular file|EISDIR/);
  writeFileSync(path, '{"secret":"private-token-123",');
  assert.throws(() => readEvidenceJson(path), {message:'Evidence is not valid JSON.'});
});

test('CLI verify rejects named pipes promptly without a writer', {skip:process.platform==='win32'}, t => {
  const dir = mkdtempSync(join(tmpdir(), 'crashlab-fifo-')); t.after(() => rmSync(dir, {recursive:true,force:true}));
  const path = join(dir, 'pipe');
  assert.equal(spawnSync('mkfifo', [path]).status, 0);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../dist/cli.js',import.meta.url)), 'verify', path], {encoding:'utf8',timeout:3000});
  assert.equal(result.error, undefined); assert.equal(result.status, 2); assert.match(result.stderr, /regular file/);
});

test('CLI verify succeeds on exported evidence and returns safe usage/parse errors', t => {
  const dir = mkdtempSync(join(tmpdir(), 'crashlab-verify-cli-')); t.after(() => rmSync(dir, {recursive:true,force:true}));
  const path = join(dir, 'report.json');
  const cli = (...args:string[]) => spawnSync(process.execPath, [fileURLToPath(new URL('../dist/cli.js',import.meta.url)), 'verify', ...args], {encoding:'utf8',timeout:5000});
  writeFileSync(path, JSON.stringify(runScripted(newRun('clean-control',42,'reference'),'careful')));
  const valid = cli(path); assert.equal(valid.status,0); assert.equal(JSON.parse(valid.stdout).verified,true);
  assert.equal(cli(path,'ignored.json').status,2);
  writeFileSync(path, '{"secret":"private-token-123",');
  const invalid = cli(path); assert.equal(invalid.status,2); assert.match(invalid.stderr,/not valid JSON/); assert.doesNotMatch(invalid.stderr,/private-token/);
});
