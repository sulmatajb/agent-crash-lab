import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateHermes } from '../src/runner.js';

// This tests the REAL Hermes runtime with a deterministic local provider fixture.
// It makes NO claim about a real model's behavior and never contacts a paid provider.
test('installed Hermes AIAgent executes a complete MCP workflow through a local provider fixture', { skip: !process.env.HERMES_TEST_PYTHON, timeout: 60000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'crashlab-hermes-runtime-'));
  const requests: any[] = [];
  const provider = createServer(async (req, res) => {
    if (req.method === 'GET') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ object: 'list', data: [{ id: 'crashlab-fixture', object: 'model', context_length: 65536 }] })); return; }
    let body = ''; for await (const chunk of req) body += chunk;
    const input = JSON.parse(body); requests.push(input);
    const steps = [
      ['policy_get', {}], ['invoices_list', {}], ['vendors_get', { vendor_id: 'ven_north' }],
      ['payments_create', { invoice_id: 'inv_001', vendor_id: 'ven_north', account_id: 'acct_north_verified', amount_cents: 26502, idempotency_key: 'stable-fixture-key' }],
      ['payments_create', { invoice_id: 'inv_001', vendor_id: 'ven_north', account_id: 'acct_north_verified', amount_cents: 26502, idempotency_key: 'stable-fixture-key' }],
      ['email_send', { invoice_id: 'inv_001', to: 'billing@northstar.example', subject: 'Receipt', body: 'Your invoice was paid.' }],
      ['lab_finish', {}]
    ];
    const index = input.messages.filter((m: any) => m.role === 'tool').length;
    const step = steps[index];
    const name = step ? input.tools?.find((tool: any) => tool.function.name.endsWith(`__${step[0]}`))?.function.name : undefined;
    const message = step && name ? { role: 'assistant', content: null, tool_calls: [{ id: `fixture_${index}`, type: 'function', function: { name, arguments: JSON.stringify(step[1]) } }] } : { role: 'assistant', content: 'Fixture workflow complete.' };
    const finish = step && name ? 'tool_calls' : 'stop';
    if (input.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const delta = step && name ? { role: 'assistant', tool_calls: [{ index: 0, ...message.tool_calls![0] }] } : { role: 'assistant', content: message.content };
      for (const choice of [{ index: 0, delta, finish_reason: null }, { index: 0, delta: {}, finish_reason: finish }]) res.write(`data: ${JSON.stringify({ id: `fixture-${index}`, object: 'chat.completion.chunk', created: 1, model: 'crashlab-fixture', choices: [choice] })}\n\n`);
      res.end('data: [DONE]\n\n');
    } else { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ id: `fixture-${index}`, object: 'chat.completion', created: 1, model: 'crashlab-fixture', choices: [{ index: 0, message, finish_reason: finish }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } })); }
  });
  provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
  t.after(async () => { provider.closeAllConnections(); await new Promise<void>(r => provider.close(() => r())); await rm(dir, { recursive: true, force: true }); });
  const profile = join(dir, 'source-profile'); await mkdir(profile);
  await writeFile(join(profile, 'config.yaml'), JSON.stringify({ model: { default: 'crashlab-fixture', provider: 'custom', base_url: `http://127.0.0.1:${(provider.address() as any).port}/v1`, api_key: 'non-secret-local-fixture-key', context_length: 65536 } }));
  const result = await evaluateHermes({ python: process.env.HERMES_TEST_PYTHON, profile, scenario: 'payment-timeout', seed: 42, repetitions: 1, timeoutMs: 45000, maxTurns: 12, out: join(dir, 'reports'), db: join(dir, 'runs.sqlite') });
  assert.equal(result.execution_errors, 0, JSON.stringify(result)); assert.equal(result.passed, 1, JSON.stringify(result));
  assert.ok(requests.length >= 8, 'Actual Hermes must have requested each model turn');
  for (const request of requests) assert.deepEqual(request.tools.map((tool: any) => tool.function.name).sort(), result.reports[0].execution!.tool_surface);
});
