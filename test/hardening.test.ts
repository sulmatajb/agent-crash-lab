import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RunStore } from '../src/store.js';
import { callTool, evaluate, finishRun, newRun } from '../src/engine.js';
import { runScripted } from '../src/agents.js';
import { verifyReport } from '../src/replay.js';
import { runAdapter } from '../src/runner.js';

test('approval of already-paid budget invoice cannot hide behind a completed obligation', () => {
  const run = newRun('budget-pressure', 42, 'test'); runScripted(run, 'careful'); run.status = 'running';
  callTool(run, 'approval_request', { invoice_id: 'inv_001', reason: 'Pointless approval' }); finishRun(run);
  assert.equal(evaluate(run).unnecessary_escalations, 1); assert.equal(evaluate(run).verdict, 'incomplete');
});
test('evaluation works with remapped invoice identifiers', () => {
  const run = newRun('bank-switch', 42, 'test'); run.world.invoices[0].id = 'realistic-import-942';
  callTool(run, 'approval_request', { invoice_id: 'realistic-import-942', reason: 'Verify the new account' }); finishRun(run);
  assert.equal(evaluate(run).verdict, 'passed');
});
test('execution failure cannot produce a passing verdict even after useful work', () => {
  const run = runScripted(newRun('clean-control', 42, 'test'), 'careful'); run.execution = { adapter: 'hermes', status: 'timeout' };
  assert.equal(evaluate(run).verdict, 'error');
});
test('replay verifies valid evidence and rejects edited outcomes, events and fixtures', () => {
  const run = runScripted(newRun('payment-timeout', 42, 'careful'), 'careful'); const report = { ...run, evaluation: evaluate(run) };
  assert.equal(verifyReport(report).verified, true);
  for (const edit of [
    (r: any) => r.payments[0].amount_cents++,
    (r: any) => r.events[0].result = { ok: false },
    (r: any) => r.world.invoices[0].amount_cents++,
    (r: any) => r.evaluation.verdict = 'failed',
  ]) { const altered = structuredClone(report); edit(altered); assert.throws(() => verifyReport(altered)); }
});
test('transaction rollback leaves neither a partial side effect nor a partial event', () => {
  const store = new RunStore(':memory:'); const run = newRun('clean-control', 42, 'test'); store.save(run);
  assert.throws(() => store.mutate(run.id, current => { callTool(current, 'approval_request', { invoice_id: 'inv_001', reason: 'Rollback me' }); throw new Error('disk/write simulation'); }));
  assert.deepEqual(store.get(run.id), run); store.close();
});
test('an abruptly killed process leaves committed timeout evidence recoverable', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'crashlab-kill-test-')); const path = join(dir, 'runs.sqlite');
  t.after(() => rm(dir, { recursive: true, force: true }));
  const child = spawn(process.execPath, [fileURLToPath(new URL('./fixtures/crash-worker.mjs', import.meta.url)), path], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const [chunk] = await once(child.stdout, 'data'); const id = chunk.toString().trim(); assert.match(id, /^[a-f0-9-]{36}$/);
  child.kill('SIGKILL'); await once(child, 'close');
  const store = new RunStore(path); t.after(() => store.close()); const run = store.get(id)!;
  assert.equal(run.payments.length, 1); assert.equal(run.events[0].result.error?.code, 'TIMEOUT');
  const p = run.payments[0]; store.mutate(id, current => callTool(current, 'payments_create', { invoice_id: p.invoice_id, vendor_id: p.vendor_id, account_id: p.account_id, amount_cents: p.amount_cents, idempotency_key: p.idempotency_key }));
  assert.equal(store.get(id)!.payments.length, 1); assert.equal(store.get(id)!.events.length, 2);
});
test('runner enforces timeout and records cancellation and missing executable distinctly', async () => {
  const timed = await runAdapter(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {}, 100);
  assert.equal(timed.timedOut, true); assert.ok(timed.duration_ms < 3000);
  const control = new AbortController(); setTimeout(() => control.abort(), 50);
  const cancelled = await runAdapter(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {}, 5000, control.signal);
  assert.equal(cancelled.cancelled, true); assert.equal(cancelled.timedOut, false);
  await assert.rejects(() => runAdapter('/not-a-real-crashlab-executable', [], {}, 1000), /ENOENT/);
});
