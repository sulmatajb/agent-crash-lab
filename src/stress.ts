import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { RunStore } from './store.js';
import { createLabServer } from './server.js';
import { callTool, newRun } from './engine.js';

export async function stressLab({ worlds = 100, concurrency = 16, out }: { worlds?: number; concurrency?: number; out?: string } = {}) {
  if (!Number.isInteger(worlds) || worlds < 1 || worlds > 1000 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 128) throw new Error('worlds must be 1–1000 and concurrency 1–128');
  const started = performance.now(); let engineCalls = 0, networkCalls = 0, mcpCalls = 0;
  // Independent ledger oracle: same business state, no engine evaluator code.
  let random = 845621;
  const next = () => { random ^= random << 13; random ^= random >>> 17; random ^= random << 5; return random >>> 0; };
  for (let seed = 0; seed < worlds * 5; seed++) {
    const run = newRun(seed % 2 ? 'payment-timeout' : 'clean-control', seed, 'invariant-fuzzer');
    const oracle = new Map<string, number>();
    for (let step = 0; step < 40; step++) {
      const key = `key-${next() % 12}`;
      const choice = next() % 5;
      const cents = choice === 0 ? -1 : choice === 1 ? 1.5 : choice === 2 ? 50001 : run.world.invoices[0].amount_cents;
      const before = run.payments.length;
      const response = callTool(run, 'payments_create', { invoice_id: 'inv_001', vendor_id: 'ven_north', account_id: 'acct_north_verified', amount_cents: cents, idempotency_key: key }); engineCalls++;
      if (!Number.isSafeInteger(cents) || cents < 1) assert.equal(response.error?.code, 'INVALID_ARGUMENTS');
      else if (oracle.has(key) && oracle.get(key) !== cents) assert.equal(response.error?.code, 'IDEMPOTENCY_CONFLICT');
      else if (!oracle.has(key)) oracle.set(key, cents);
      assert.equal(run.payments.length, oracle.size);
      assert.equal(run.payments.reduce((n, p) => n + p.amount_cents, 0), [...oracle.values()].reduce((a, b) => a + b, 0));
      assert.ok(run.payments.length === before || run.payments.length === before + 1);
      assert.deepEqual(run.events.map(e => e.seq), Array.from({ length: step + 1 }, (_, i) => i + 1));
    }
  }
  const directory = await mkdtemp(join(tmpdir(), 'crashlab-stress-'));
  const path = join(directory, 'runs.sqlite'); let store = new RunStore(path);
  let server = createLabServer(store); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  let origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const runs = Array.from({ length: worlds }, (_, seed) => {
    const run = newRun('payment-timeout', seed, 'transport-load'); const token = randomBytes(32).toString('hex'); store.save(run); store.authorize(token, run); return { run, token };
  });
  const latencies: number[] = []; const lag = monitorEventLoopDelay({ resolution: 10 }); lag.enable();
  async function invoke(index: number, name: string, args = {}) {
    const start = performance.now(); const response = await fetch(`${origin}/agent/call`, { method: 'POST', headers: { Authorization: `Bearer ${runs[index].token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, arguments: args }), signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 200); const data = await response.json(); latencies.push(performance.now() - start); networkCalls++; return data;
  }
  try {
    const jobs = Array.from({ length: worlds * 64 }, (_, n) => n); let cursor = 0;
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (cursor < jobs.length) {
        const n = cursor++, index = Math.floor(n / 64); const run = runs[index].run;
        const result = await invoke(index, 'payments_create', { invoice_id: 'inv_001', vendor_id: 'ven_north', account_id: 'acct_north_verified', amount_cents: run.world.invoices[0].amount_cents, idempotency_key: 'one-debt' });
        assert.ok(result.ok || result.error.code === 'TIMEOUT');
      }
    }));
    for (const { run } of runs) {
      const saved = store.get(run.id)!; assert.equal(saved.payments.length, 1); assert.equal(saved.events.length, 64); assert.equal(saved.events.filter(e => e.fault).length, 1); assert.equal(saved.findings.length, 0);
    }
    // Real stdio MCP processes and official client; concurrent calls share one scoped run.
    for (let i = 0; i < Math.min(4, worlds); i++) {
      const client = new Client({ name: 'crashlab-stress', version: '0.2.0' });
      const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../dist/cli.js', import.meta.url)), 'mcp'], env: { CRASHLAB_URL: origin, CRASHLAB_TOKEN: runs[i].token }, stderr: 'pipe' });
      await client.connect(transport);
      try { assert.equal((await client.listTools()).tools.length, 10); await Promise.all(Array.from({ length: 24 }, async () => { const result = await client.callTool({ name: 'payments_list', arguments: {} }); const payload = JSON.parse((result.content as any[])[0].text); assert.equal(payload.data.length, 1); mcpCalls++; })); }
      finally { await client.close(); }
    }
    server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); store.close();
    store = new RunStore(path); server = createLabServer(store); server.listen(0, '127.0.0.1'); await once(server, 'listening'); origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    // Persisted tokens and committed payments survive a server/database restart.
    for (let i = 0; i < worlds; i++) { assert.equal((await invoke(i, 'payments_list')).data.length, 1); const saved = store.get(runs[i].run.id)!; assert.equal(saved.events.length, 65 + (i < Math.min(4, worlds) ? 24 : 0)); assert.deepEqual(saved.events.map(e => e.seq), Array.from({ length: saved.events.length }, (_, n) => n + 1)); }
    const unauthorized = await fetch(`${origin}/api/runs`, { headers: { Authorization: `Bearer ${runs[0].token}` } }); assert.equal(unauthorized.status, 401);
    lag.disable(); latencies.sort((a, b) => a - b);
    const percentile = (fraction: number) => Math.round(latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * fraction))] * 100) / 100;
    const report = { kind: 'infrastructure-stress-not-model-evaluation', passed: true, node: process.version, platform: process.platform, worlds, concurrency, seed: 845621, engine_calls: engineCalls, http_calls: networkCalls, mcp_calls: mcpCalls, total_calls: engineCalls + networkCalls + mcpCalls, lost_events: 0, duplicate_payments_under_same_key: 0, restart_verified: true, latency_ms: { p50: percentile(.5), p95: percentile(.95), p99: percentile(.99) }, event_loop_p99_ms: Math.round(lag.percentile(99) / 1e6 * 100) / 100, duration_ms: Math.round(performance.now() - started), rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024), workload: `64 same-run retry requests per invoice across ${worlds} worlds, up to ${concurrency} concurrent HTTP workers, real MCP reads, restart readback`, scope: 'Single local server. Does not claim hosted multi-tenant scale or model safety.' };
    if (out) await writeFile(out, JSON.stringify(report, null, 2));
    return report;
  } finally { lag.disable(); server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); store.close(); await rm(directory, { recursive: true, force: true }); }
}
