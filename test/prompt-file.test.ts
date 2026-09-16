import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, truncateSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readSystemPrompt, MAX_PROMPT_BYTES } from '../src/prompt-file.js';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
test('prompt reader preserves Unicode and whitespace and enforces byte/encoding limits', t => {
  const dir = mkdtempSync(join(tmpdir(), 'crashlab-prompt-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'prompt.txt');
  for (const prompt of ['', '\ufeffKeep café receipts.\n\n  Check → reconcile.\n', 'é'.repeat(MAX_PROMPT_BYTES / 2)]) {
    writeFileSync(file, prompt); assert.equal(readSystemPrompt(file), prompt);
  }
  truncateSync(file, MAX_PROMPT_BYTES + 1);
  assert.throws(() => readSystemPrompt(file), /64 KiB/);
  writeFileSync(file, Buffer.from([0x70, 0xc3, 0x28]));
  assert.throws(() => readSystemPrompt(file), /valid UTF-8/);
  writeFileSync(file, 'private-marker\0');
  assert.throws(() => readSystemPrompt(file), { message: '--system-prompt must not contain NUL characters.' });
  assert.throws(() => readSystemPrompt(dir), /regular file|Cannot open/);
  assert.throws(() => readSystemPrompt(join(dir, 'missing')), /Cannot open/);
});

test('live-agent CLI rejects invalid prompts before creating campaign artifacts', t => {
  const dir = mkdtempSync(join(tmpdir(), 'crashlab-prompt-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'prompt.txt'), out = join(dir, 'results'), db = join(dir, 'runs.sqlite');
  writeFileSync(file, 'private-marker\0');
  for (const command of ['evaluate', 'evaluate-claude', 'probe']) {
    const result = spawnSync(process.execPath, [cli, command, '--system-prompt', file, '--out', out, '--db', db], { encoding: 'utf8', timeout: 3000 });
    assert.equal(result.error, undefined); assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /NUL/); assert.doesNotMatch(result.stderr, /private-marker/);
    assert.equal(result.stdout, ''); assert.equal(existsSync(out), false); assert.equal(existsSync(db), false);
  }
});

test('live-agent CLI promptly rejects named pipes and symlinks to them without a writer', { skip: process.platform === 'win32' }, t => {
  const dir = mkdtempSync(join(tmpdir(), 'crashlab-prompt-fifo-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const pipe = join(dir, 'pipe'), link = join(dir, 'link');
  assert.equal(spawnSync('mkfifo', [pipe]).status, 0); symlinkSync(pipe, link);
  for (const path of [pipe, link]) {
    const result = spawnSync(process.execPath, [cli, 'evaluate-claude', '--system-prompt', path], { encoding: 'utf8', timeout: 3000 });
    assert.equal(result.error, undefined); assert.equal(result.status, 2); assert.match(result.stderr, /regular file/);
  }
});
