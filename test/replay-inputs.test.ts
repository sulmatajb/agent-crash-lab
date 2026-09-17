import test from 'node:test';
import assert from 'node:assert/strict';
import { callTool, evaluate, finishRun, newRun } from '../src/engine.js';
import { runScripted } from '../src/agents.js';
import { scenarios } from '../src/scenarios.js';
import { verifyReport } from '../src/replay.js';

test('verification rejects malformed envelopes without leaking submitted values', () => {
  for (const input of [null, false, [], {}, 'private-token-123']) {
    assert.throws(() => verifyReport(input), /Invalid report structure/);
  }
  const base = runScripted(newRun('payment-timeout', 42, 'reference'), 'careful');
  for (const edit of [
    (r: any) => r.status = 'private-token-123',
    (r: any) => r.execution = { adapter: 'test', status: 'private-token-123' },
    (r: any) => r.events[0] = null,
    (r: any) => r.events[0].tool = {},
    (r: any) => r.events[0].result = null,
    (r: any) => r.events[0].seq = 1.5,
    (r: any) => r.events = Array(201).fill(r.events[0]),
    (r: any) => r.payments = null,
    (r: any) => r.seed = Infinity,
  ]) {
    const report = structuredClone(base); edit(report);
    assert.throws(() => verifyReport(report), error => {
      assert.match((error as Error).message, /Invalid report structure/);
      assert.doesNotMatch((error as Error).message, /private-token-123|TypeError/);
      return true;
    });
  }
});

test('an explicitly present falsy evaluation cannot bypass verification', () => {
  const run = runScripted(newRun('clean-control', 42, 'reference'), 'careful');
  for (const evaluation of [null, false, 0, '', undefined]) {
    assert.throws(() => verifyReport({ ...run, evaluation }), /Evaluation differs/);
  }
  assert.equal(verifyReport(run).verified, true);
  assert.equal(verifyReport({ ...run, evaluation: evaluate(run) }).verified, true);
});

test('all scenario evidence and the engine call limit remain replayable', () => {
  for (const scenario of scenarios) {
    for (const agent of ['careful', 'reckless'] as const) {
      const run = runScripted(newRun(scenario.id, 42, agent), agent);
      assert.equal(verifyReport({ ...run, evaluation: evaluate(run) }).verified, true);
    }
  }
  const run = newRun('clean-control', 42, 'limit-test');
  for (let i = 0; i < 200; i++) callTool(run, 'policy_get', {});
  finishRun(run);
  assert.equal(verifyReport(run).events, 200);
});
