import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { evaluateCodex, runCodexProcess, inspectCodex } from '../src/codex.js';
import { verifyReport } from '../src/replay.js';
import { verifyCampaign } from '../src/campaign.js';

const command = new URL('./fixtures/codex-client.mjs', import.meta.url).pathname;
const options = (dir: string) => ({ command, scenario: 'clean-control', seed: 42, repetitions: 1, timeoutMs: 10000, maxToolCalls: 30, out: join(dir, 'out'), db: join(dir, 'runs.sqlite'), model: 'success' });
const processOptions = (code: string) => ({ command: process.execPath, args: ['-e', code], cwd: tmpdir(), timeoutMs: 2000 });
test('Codex process bounds malformed output, stdout/stderr overflow, missing command, timeout and cancellation', async () => {
 assert.equal((await runCodexProcess(processOptions("console.log('not json')"))).status, 'error');
 assert.equal((await runCodexProcess({ ...processOptions("console.log('x'.repeat(1000))"), maxBytes: 100 })).status, 'error');
 assert.equal((await runCodexProcess({ ...processOptions("process.stderr.write('x'.repeat(1000))"), maxBytes: 100 })).status, 'error');
 assert.equal((await runCodexProcess({ ...processOptions(''), command: '/no/codex' })).status, 'error');
 assert.equal((await runCodexProcess({ ...processOptions('setInterval(()=>{},1000)'), timeoutMs: 50 })).status, 'timeout');
 const abort = new AbortController(); setTimeout(() => abort.abort(), 50);
 assert.equal((await runCodexProcess({ ...processOptions('setInterval(()=>{},1000)'), signal: abort.signal })).status, 'cancelled');
});
test('Codex CLI rejects unsupported options and missing model before creating artifacts', async t => {
 const dir = await mkdtemp(join(tmpdir(), 'codex-usage-')); t.after(() => rm(dir, { recursive: true, force: true }));
 for (const args of [[], ['--max-turns', '10'], ['--provider', 'openai'], ['--max-tool-calls', '0']]) {
  const r = spawnSync(process.execPath, ['dist/cli.js', 'evaluate-codex', '--out', join(dir, 'out'), ...args], { encoding: 'utf8' });
  assert.equal(r.status, 2); assert.ok(!r.stderr.includes('SQLITE'));
 }
 assert.deepEqual(await readdir(dir), []);
 await assert.rejects(inspectCodex('/missing/codex'), /Codex CLI needs/);
 await assert.rejects(evaluateCodex({ ...options(dir), model: ' ' }), /requires --model/);
});
test('Codex fixture uses actual stdio MCP, records requested model without inventing observed model, and replays its campaign', async t => {
 const dir = await mkdtemp(join(tmpdir(), 'codex-success-')); t.after(() => rm(dir, { recursive: true, force: true }));
 const o = { ...options(dir), scenario: 'payment-timeout', systemPrompt: 'Synthetic instructions only.' };
 const summary = await evaluateCodex(o); assert.equal(summary.total, 1); assert.equal(summary.passed, 1); assert.equal(summary.execution_errors, 0);
 const report = JSON.parse(await readFile(join(o.out, `${summary.reports[0].id}.json`), 'utf8'));
 assert.equal(report.execution.model, undefined); assert.equal(report.execution.runtime_version, 'codex-cli 0.158.0');
 assert.equal(report.payments.length, 1); assert.equal(report.events.filter((e: any) => e.fault).length, 1);
 assert.equal(verifyReport(report).verified, true);
 const manifest = JSON.parse(await readFile(join(o.out, summary.manifest), 'utf8'));
 assert.equal(manifest.configuration.requested_model, 'success'); assert.equal(manifest.configuration.max_turns, null); assert.equal(manifest.configuration.max_tool_calls, 30);
 assert.equal((await verifyCampaign(join(o.out, summary.manifest))).status, 'completed');
 const trace = JSON.parse(await readFile(join(o.out, `${report.id}.trace.json`), 'utf8'));
 assert.equal(trace.verified_tool_surface, false); assert.equal(trace.configured_tools.length, 10);
});
test('Codex supervisor rejects failed execution, missing or inconsistent traces, foreign tools and bounds, retaining replayable evidence', async t => {
 const dir = await mkdtemp(join(tmpdir(), 'codex-failures-')); t.after(() => rm(dir, { recursive: true, force: true }));
 for (const mode of ['auth-error', 'no-finish', 'crash-after-finish', 'no-turn', 'missing-trace', 'wrong-args', 'duplicate-trace', 'unexpected-tool', 'failed-transport', 'wrong-result', 'limit']) {
  const o = { ...options(dir), out: join(dir, mode), model: mode, scenario: 'all', repetitions: 2, maxToolCalls: mode === 'limit' ? 2 : 30 };
  const summary = await evaluateCodex(o);
  assert.equal(summary.total, 1, mode); assert.equal(summary.execution_errors, 1, mode); assert.equal(summary.passed, 0, mode);
  const report = JSON.parse(await readFile(join(o.out, `${summary.reports[0].id}.json`), 'utf8'));
  assert.equal(verifyReport(report).verified, true, mode); assert.equal(report.execution.status, 'error', mode);
  assert.ok(!JSON.stringify(report.execution).includes('private '), mode);
  assert.equal((await verifyCampaign(join(o.out, summary.manifest))).status, 'stopped', mode);
 }
});
