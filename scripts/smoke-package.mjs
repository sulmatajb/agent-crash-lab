/** Test the distributable in a clean temporary consumer, without model inference. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';

const source = fileURLToPath(new URL('..', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'crashlab-package-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (cmd, args, cwd = temp) => execFileSync(cmd, args, { cwd, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
let client, server, store;
try {
  const packed = JSON.parse(run(npm, ['pack', '--json', '--pack-destination', temp], source));
  assert.equal(packed.length, 1);
  const tarball = join(temp, packed[0].filename);
  run(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...(process.argv.includes('--offline') ? ['--offline'] : []), tarball]);
  const installed = join(temp, 'node_modules', 'agent-crash-lab');
  for (const file of ['public/index.html', 'public/app.js', 'adapters/hermes.py', 'docs/USAGE.md', 'dist/claude.js']) assert.ok(existsSync(join(installed, file)), `Package missing ${file}`);
  for (const file of ['results', '.crashlab', '.env', 'videos']) assert.ok(!existsSync(join(installed, file)), `Package contains private/development material: ${file}`);
  const cli = join(installed, 'dist/cli.js');
  const reference = JSON.parse(run(process.execPath, [cli, 'test', '--agent', 'careful', '--scenario', 'all', '--json']));
  assert.equal(reference.summary.passed, 11);
  assert.equal(reference.summary.total, 11);
  const load = file => import(pathToFileURL(join(installed, 'dist', file)).href);
  const { createLabServer } = await load('server.js');
  const { RunStore } = await load('store.js');
  const { newRun, evaluate } = await load('engine.js');
  const { verifyReport } = await load('replay.js');
  const requireInstalled = createRequire(join(installed, 'package.json'));
  const { Client } = await import(pathToFileURL(requireInstalled.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(requireInstalled.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  store = new RunStore(join(temp, 'smoke.sqlite'));
  const trial = newRun('payment-timeout', 42, 'package-smoke-reference');
  const token = randomUUID(); store.save(trial); store.authorize(token, trial);
  server = createLabServer(store); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(url);
  assert.equal(response.status, 200); assert.match(await response.text(), /Give your agent a bad day/);
  client = new Client({ name: 'installed-package-smoke', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [cli, 'mcp'], env: { PATH: process.env.PATH ?? '', CRASHLAB_URL: url, CRASHLAB_TOKEN: token }, stderr: 'pipe' }));
  const tools = await client.listTools(); assert.equal(tools.tools.length, 10);
  const call = async (name, args = {}) => JSON.parse((await client.callTool({ name, arguments: args })).content[0].text);
  assert.equal((await call('policy_get')).ok, true);
  const invoice = (await call('invoices_list')).data[0];
  const vendor = (await call('vendors_get', { vendor_id: invoice.vendor_id })).data;
  const args = { invoice_id: invoice.id, vendor_id: vendor.id, account_id: vendor.account_id, amount_cents: invoice.amount_cents, idempotency_key: 'package-smoke-stable' };
  assert.equal((await call('payments_create', args)).error.code, 'TIMEOUT');
  assert.equal((await call('payments_create', args)).data.replayed, true);
  await call('email_send', { invoice_id: invoice.id, to: vendor.email, subject: 'Receipt', body: 'Payment completed.' });
  await call('lab_finish');
  const report = store.get(trial.id);
  assert.equal(report.payments.length, 1); assert.equal(evaluate(report).verdict, 'passed'); assert.equal(verifyReport(report).verified, true);
  console.log(JSON.stringify({ kind: 'installed-package-integration-not-model-evaluation', version: JSON.parse(readFileSync(join(installed, 'package.json'))).version, passed: true, reference_scenarios: 11, discovered_mcp_tools: 10, post_commit_timeout_recovered: true, duplicate_payments: 0, dashboard_http: 200, replay_verified: true }, null, 2));
} finally {
  await client?.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  store?.close();
  rmSync(temp, { recursive: true, force: true });
}
