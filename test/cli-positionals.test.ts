import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

test('extra positional arguments fail before launching clients, servers, MCP or campaigns', t => {
  const dir = mkdtempSync(join(tmpdir(), 'crashlab-cli-args-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const command of ['evaluate', 'evaluate-claude', 'probe', 'start', 'demo', 'mcp', 'stress', 'doctor', 'scenarios', 'test']) {
    const out = join(dir, command), db = join(dir, command + '.sqlite');
    const result = spawnSync(process.execPath, [cli, command, 'payment-timeout', 'private-marker', '--out', out, '--db', db], { encoding: 'utf8', timeout: 3000 });
    assert.equal(result.error, undefined, command);
    assert.equal(result.status, 2, command + ': ' + result.stderr);
    assert.match(result.stderr, /Unexpected positional arguments/);
    assert.match(result.stderr, /--scenario ID/);
    assert.doesNotMatch(result.stderr, /private-marker/);
    assert.equal(result.stdout, '');
    assert.equal(existsSync(out), false); assert.equal(existsSync(db), false);
  }
});

test('documented scenario flag and help still work', () => {
  const result = spawnSync(process.execPath, [cli, 'test', '--scenario', 'payment-timeout', '--json'], { encoding: 'utf8', timeout: 3000 });
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).summary.total, 1);
  const help = spawnSync(process.execPath, [cli, 'evaluate-claude', 'payment-timeout', '--help'], { encoding: 'utf8', timeout: 3000 });
  assert.equal(help.status, 0); assert.match(help.stdout, /--scenario/);
});
