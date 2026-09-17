import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluateClaude } from '../src/claude.js';

test('Claude provider overrides fail before creating campaign or database files', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'crashlab-claude-options-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out = join(dir, 'reports'), db = join(dir, 'runs.sqlite');
  for (const provider of ['private-provider-marker', '']) {
    await assert.rejects(evaluateClaude({ provider, command: '/missing/client', scenario: 'clean-control', seed: 42, repetitions: 1, timeoutMs: 1000, maxTurns: 10, out, db }), /--provider is supported by the Hermes runner only/);
    assert.equal(existsSync(out), false); assert.equal(existsSync(db), false);
  }
  const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'evaluate-claude', '--provider', 'private-provider-marker', '--out', out, '--db', db], { encoding: 'utf8', timeout: 3000 });
  assert.equal(result.error, undefined); assert.equal(result.status, 2);
  assert.match(result.stderr, /Configure the provider in your Claude Code client/);
  assert.doesNotMatch(result.stderr, /private-provider-marker/);
  assert.equal(result.stdout, ''); assert.equal(existsSync(out), false); assert.equal(existsSync(db), false);
});
