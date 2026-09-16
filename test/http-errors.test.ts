import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { RunStore } from '../src/store.js';
import { createLabServer } from '../src/server.js';
import { newRun } from '../src/engine.js';

async function fixture(t: any) {
  const store = new RunStore(':memory:');
  const run = newRun('clean-control', 42, 'external');
  store.save(run); store.authorize('run-token', run);
  const server = createLabServer(store, 'admin-token');
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as any).port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve())); store.close();
  });
  const post = (path: string, body: string, token: string) => fetch(origin + path, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body
  });
  return { store, run, post };
}

test('HTTP parser and schema errors omit private values and keys and do not change evidence', async t => {
  const { store, run, post } = await fixture(t);
  for (const [path, token, valid] of [
    ['/api/runs', 'admin-token', { scenario: 'clean-control', agent: 'external' }],
    ['/agent/call', 'run-token', { name: 'policy_get', arguments: {} }]
  ] as const) {
    for (const body of ['private-marker', '{"private-marker":', JSON.stringify({ ...valid, 'private-marker': 'secret-value' })]) {
      const response = await post(path, body, token);
      assert.equal(response.status, 400);
      const result = await response.json();
      assert.equal(result.code, 'INVALID_REQUEST');
      assert.doesNotMatch(JSON.stringify(result), /private-marker|secret-value/);
    }
  }
  assert.deepEqual(store.get(run.id), run); assert.equal(store.list().length, 1);
  const valid = await post('/agent/call', JSON.stringify({ name: 'policy_get', arguments: {} }), 'run-token');
  assert.equal(valid.status, 200); assert.equal((await valid.json()).ok, true);
  assert.equal(store.get(run.id)!.events.length, 1);
});

test('unexpected server failures return stable 500 errors without exception contents', async t => {
  const { store, post } = await fixture(t);
  const original = store.mutate;
  try {
    for (const failure of [new Error('private-token /private/database.sqlite'), new SyntaxError('private-transcript'), null]) {
      store.mutate = () => { throw failure; };
      const response = await post('/agent/call', '{"name":"policy_get"}', 'run-token');
      assert.equal(response.status, 500);
      const result = await response.json();
      assert.equal(result.code, 'INTERNAL_ERROR');
      assert.match(result.error, /inspect the run before retrying a write/);
      assert.doesNotMatch(JSON.stringify(result), /private-token|database.sqlite|private-transcript/);
    }
  } finally { store.mutate = original; }
});
