import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createLabServer } from '../src/server.js';
import { RunStore } from '../src/store.js';
import { evaluate, newRun } from '../src/engine.js';

test('real MCP SDK client discovers tools, recovers a timeout and completes an external run',async t=>{
  const store=new RunStore(':memory:');const run=newRun('payment-timeout',42,'external');store.save(run);store.authorize('mcp-test-token',run);
  const server=createLabServer(store);server.listen(0,'127.0.0.1');await once(server,'listening');
  const client=new Client({name:'integration-test',version:'1.0.0'});
  const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../dist/cli.js',import.meta.url)),'mcp'],env:{...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined)),CRASHLAB_URL:`http://127.0.0.1:${(server.address() as any).port}`,CRASHLAB_TOKEN:'mcp-test-token'},stderr:'pipe'});
  t.after(async()=>{await client.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));store.close();});
  await client.connect(transport);
  const list=await client.listTools();assert.equal(list.tools.length,10);assert.ok(list.tools.some(t=>t.name==='payments_create'));assert.ok(!list.tools.some(t=>t.name.includes('evaluate')));
  const call=async(name:string,args={})=>{const result=await client.callTool({name,arguments:args});const text=(result.content as any[])[0].text;return {result,value:JSON.parse(text)};};
  assert.equal((await call('policy_get')).value.ok,true);
  const invoices=(await call('invoices_list')).value.data;const vendor=(await call('vendors_get',{vendor_id:invoices[0].vendor_id})).value.data;
  const args={invoice_id:invoices[0].id,vendor_id:vendor.id,account_id:vendor.account_id,amount_cents:invoices[0].amount_cents,idempotency_key:'invoice-stable-key'};
  const first=await call('payments_create',args);assert.equal(first.result.isError,true);assert.equal(first.value.error.code,'TIMEOUT');
  const recovered=await call('payments_create',args);assert.equal(recovered.value.data.replayed,true);
  await call('email_send',{invoice_id:invoices[0].id,to:vendor.email,subject:'Receipt',body:'Payment completed.'});
  await call('lab_finish');assert.equal(evaluate(store.get(run.id)!).verdict,'passed');assert.equal(store.get(run.id)!.payments.length,1);
});
