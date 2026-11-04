#!/usr/bin/env node
// Deterministic Codex JSONL protocol fixture. Never model-evaluation evidence.
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('codex-cli 0.158.0'); process.exit(0); }
if (args.includes('--help')) { console.log('--ignore-user-config --ignore-rules --ephemeral --json --skip-git-repo-check'); process.exit(0); }
const emit = x => console.log(JSON.stringify(x));
const mode = args[args.indexOf('--model') + 1];
const settings = Object.fromEntries(args.flatMap((v, i) => v === '-c' ? [args[i + 1].split(/=(.*)/s).slice(0, 2)] : []).map(([k, v]) => [k, JSON.parse(v)]));
for (const flag of ['--ignore-user-config', '--ignore-rules', '--ephemeral', '--json', '--skip-git-repo-check']) assert.ok(args.includes(flag));
assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
assert.equal(settings.approval_policy, 'never'); assert.equal(settings.web_search, 'disabled');
for (const key of ['shell_tool','unified_exec','code_mode','plugins','apps','memories','multi_agent','goals']) assert.equal(settings['features.'+key], false);
assert.equal(settings['tools.update_plan.enabled'], false);
assert.equal(settings['tools.experimental_request_user_input.enabled'], false);
assert.equal(settings['skills.include_instructions'], false);
assert.equal(settings.project_doc_max_bytes, 0);
const prefix = 'mcp_servers.agent-crash-lab.';
assert.equal(settings[prefix + 'default_tools_approval_mode'], 'approve');
assert.deepEqual(settings[prefix + 'env_vars'], ['CRASHLAB_URL', 'CRASHLAB_TOKEN']);
assert.ok(!args.join(' ').includes(process.env.CRASHLAB_TOKEN));
const client = new Client({ name: 'codex-protocol-fixture', version: '1.0.0' });
const transport = new StdioClientTransport({ command: settings[prefix + 'command'], args: settings[prefix + 'args'], env: { CRASHLAB_URL: process.env.CRASHLAB_URL, CRASHLAB_TOKEN: process.env.CRASHLAB_TOKEN }, stderr: 'pipe' });
emit({ type: 'thread.started', thread_id: 'synthetic-fixture' });
if (mode === 'auth-error') { emit({ type: 'error', message: 'private ' + process.env.CRASHLAB_TOKEN }); process.exit(1); }
if (mode === 'unexpected-tool') { emit({ type: 'item.started', item: { id: 'x', type: 'command_execution', command: 'private' } }); setInterval(() => {}, 1000); }
else {
 await client.connect(transport);
 try {
  const names = (await client.listTools()).tools.map(t => t.name).sort();
  assert.deepEqual(names, settings[prefix + 'enabled_tools']);
  let counter = 0;
  async function call(tool, input = {}) {
   const id = String(++counter); const item = { id, type: 'mcp_tool_call', server: 'agent-crash-lab', tool, arguments: input };
   emit({ type: 'item.started', item: { ...item, status: 'in_progress' } });
   if (mode === 'failed-transport') { emit({ type: 'item.completed', item: { ...item, status: 'failed', error: { message: 'synthetic transport failure' } } }); await new Promise(resolve => setTimeout(resolve, 60000)); }
   const result = await client.callTool({ name: tool, arguments: input });
   if (!(mode === 'missing-trace' && tool === 'vendors_get')) emit({ type: 'item.completed', item: { ...item, arguments: mode === 'wrong-args' && tool === 'vendors_get' ? { vendor_id: 'incorrect' } : input, status: result.isError ? 'failed' : 'completed', result: mode === 'wrong-result' ? { content: [{ type: 'text', text: '{"ok":true,"data":"forged"}' }] } : result } });
   return JSON.parse(result.content[0].text);
  }
  // A warning item can occur without invalidating a completed model turn.
  emit({ type: 'item.completed', item: { id: 'warning', type: 'error', message: 'synthetic warning' } });
  await call('policy_get'); const invoice = (await call('invoices_list')).data[0]; const vendor = (await call('vendors_get', { vendor_id: invoice.vendor_id })).data;
  const payment = { invoice_id: invoice.id, vendor_id: vendor.id, account_id: vendor.account_id, amount_cents: invoice.amount_cents, idempotency_key: 'stable' };
  const paid = await call('payments_create', payment);
  if (!paid.ok && paid.error.code === 'TIMEOUT') await call('payments_create', payment);
  await call('email_send', { invoice_id: invoice.id, to: vendor.email, subject: 'Receipt', body: 'Paid.' });
  if (mode !== 'no-finish') await call('lab_finish');
  if (mode === 'duplicate-trace') emit({ type: 'item.completed', item: { id: String(counter), type: 'mcp_tool_call', server: 'agent-crash-lab', tool: 'lab_finish', arguments: {}, status: 'completed' } });
  if (mode === 'crash-after-finish') { emit({ type: 'turn.failed', error: { message: 'private ' + process.env.CRASHLAB_TOKEN } }); process.exitCode = 1; }
  else if (mode !== 'no-turn') emit({ type: 'turn.completed', usage: { input_tokens: 0, output_tokens: 0, cached_input_tokens: 0 } });
 } finally { await client.close(); }
}
