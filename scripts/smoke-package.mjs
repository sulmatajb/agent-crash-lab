/** Test the distributable in a clean temporary consumer, without model inference. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, relative } from 'node:path';
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
  for (const file of ['public/index.html', 'public/app.js', 'public/style.css', 'adapters/hermes.py', 'docs/USAGE.md', 'dist/claude.js', 'LICENSE', 'README.md', 'SECURITY.md']) assert.ok(existsSync(join(installed, file)), `Package missing ${file}`);
  for (const file of ['results', '.crashlab', '.env', 'videos']) assert.ok(!existsSync(join(installed, file)), `Package contains private/development material: ${file}`);
  let documentationLinks = 0;
  for (const { path } of packed[0].files.filter(file => file.path.endsWith('.md'))) {
    const text = readFileSync(join(installed, path), 'utf8').replace(/```[^\n]*\n[\s\S]*?```/g, '');
    const links = [...text.matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g)].map(match => match[1]);
    links.push(...[...text.matchAll(/^\s*\[[^\]\n]+\]:\s*(\S+)/gm)].map(match => match[1]));
    for (let link of links) {
      link = link.startsWith('<') ? link.slice(1, link.indexOf('>')) : link.split(/\s+["']/)[0];
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(link)) continue;
      link = decodeURIComponent(link.split(/[?#]/)[0]);
      if (!link) continue;
      const target = resolve(dirname(join(installed, path)), link);
      assert.ok(!relative(installed, target).startsWith('..') && existsSync(target), `Packaged documentation ${path} has missing target: ${link}`);
      documentationLinks++;
    }
  }
  const cli = join(installed, 'dist/cli.js');
  const command = (args, expectedExit = 0) => {
    try {
      const stdout = run(process.execPath, [cli, ...args]);
      assert.equal(expectedExit, 0, `Command unexpectedly succeeded: ${args[0]}`);
      return stdout;
    } catch (error) {
      assert.equal(error.status, expectedExit, `Unexpected exit for ${args[0]}: ${error.stderr ?? error.message}`);
      return String(error.stdout ?? '');
    }
  };
  assert.match(command(['help']), /Usage: agent-crash-lab/);
  assert.equal(command(['scenarios']).trim().split('\n').length, 11);
  command(['not-a-command'], 2);
  command(['verify', join(temp, 'missing-report.json')], 2);
  const reference = JSON.parse(run(process.execPath, [cli, 'test', '--agent', 'careful', '--scenario', 'all', '--json']));
  assert.equal(reference.summary.passed, 11);
  assert.equal(reference.summary.total, 11);
  const failing = JSON.parse(command(['test', '--agent', 'reckless', '--scenario', 'all', '--json'], 1));
  assert.equal(failing.summary.total, 11); assert.ok(failing.summary.failed > 0);
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
  for (const [asset, type] of [['app.js', 'javascript'], ['style.css', 'text/css']]) {
    const resource = await fetch(`${url}/${asset}`);
    assert.equal(resource.status, 200); assert.ok(resource.headers.get('content-type')?.includes(type));
    assert.ok((await resource.text()).length > 100, `Empty packaged asset: ${asset}`);
  }
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
  const reportPath = join(temp, 'exported-report.json');
  writeFileSync(reportPath, JSON.stringify({ ...report, evaluation: evaluate(report) }));
  assert.equal(JSON.parse(command(['verify', reportPath])).verified, true);
  const edited = structuredClone(report); edited.payments[0].amount_cents++;
  writeFileSync(reportPath, JSON.stringify(edited)); command(['verify', reportPath], 2);
  console.log(JSON.stringify({ kind: 'installed-package-integration-not-model-evaluation', version: JSON.parse(readFileSync(join(installed, 'package.json'))).version, passed: true, reference_scenarios: 11, discovered_mcp_tools: 10, post_commit_timeout_recovered: true, duplicate_payments: 0, dashboard_http: 200, packaged_assets_served: true, replay_verified: true, cli_exit_contracts_verified: [0, 1, 2], edited_evidence_rejected: true, documentation_links_checked: documentationLinks }, null, 2));
} finally {
  await client?.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  store?.close();
  rmSync(temp, { recursive: true, force: true });
}
