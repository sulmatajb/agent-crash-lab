import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { scenarios } from '../src/scenarios.js';
import { RunStore } from '../src/store.js';
import { createLabServer } from '../src/server.js';
import { newRun } from '../src/engine.js';

async function fixture(t: any) {
  const store=new RunStore(':memory:');const server=createLabServer(store,'test-admin');server.listen(0,'127.0.0.1');await once(server,'listening');
  const port=(server.address() as any).port; const origin=`http://127.0.0.1:${port}`;
  t.after(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));store.close();});
  const api=(path:string,data?:unknown,token='test-admin',headers={})=>fetch(origin+path,{method:data===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...headers},body:data===undefined?undefined:JSON.stringify(data)});
  return {store,origin,api};
}
test('dashboard, run comparison, JSON export and persisted effects',async t=>{
  const {api,origin}=await fixture(t);const html=await fetch(origin);assert.equal(html.status,200);assert.match(await html.text(),/Agent Crash Lab/);
  const res=await api('/api/runs',{scenario:'payment-timeout',agent:'reckless',seed:42});assert.equal(res.status,201);const {run}=await res.json();assert.equal(run.evaluation.verdict,'failed');assert.equal(run.payments.length,2);
  const report=await api(`/api/runs/${run.id}/report`);assert.match(report.headers.get('content-disposition')!,/attachment/);assert.equal((await report.json()).events.length,run.events.length);
  const list=await(await api('/api/runs')).json();assert.equal(list.length,1);assert.equal(list[0].events,undefined);
});
test('capabilities isolate runs and cannot read evaluator or admin API',async t=>{
  const {api}=await fixture(t);
  const create=async()=> (await(await api('/api/runs',{scenario:'clean-control',agent:'external',seed:42})).json());
  const first=await create(),second=await create();const token=first.connection.mcpServers['agent-crash-lab'].env.CRASHLAB_TOKEN;
  assert.equal((await api('/api/runs',undefined,token)).status,401);
  assert.equal((await api(`/api/runs/${second.run.id}`,undefined,token)).status,401);
  assert.equal((await api('/agent/task',undefined,'wrong')).status,401);
  const task=await(await api('/agent/task',undefined,token)).json();assert.equal(task.run_id,first.run.id);assert.equal(task.scenario,undefined);
  const r=await(await api('/agent/call',{name:'policy_get',arguments:{}},token)).json();assert.equal(r.ok,true);
  const own=await(await api(`/api/runs/${first.run.id}`)).json();const other=await(await api(`/api/runs/${second.run.id}`)).json();assert.equal(own.events.length,1);assert.equal(other.events.length,0);
  await api('/agent/finish',{},token);const closed=await(await api('/agent/call',{name:'inbox_list',arguments:{}},token)).json();assert.equal(closed.error.code,'RUN_FINISHED');
});
test('reject cross-origin requests, hostile Host, malformed body and invalid seed',async t=>{
  const {api,origin}=await fixture(t);
  assert.equal((await api('/api/runs',undefined,'test-admin',{Origin:'https://evil.example'})).status,403);
  const hostile = await new Promise<number>(resolve=>{const req=request(origin+'/health',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode!);});req.end();});
  assert.equal(hostile,403);
  assert.equal((await api('/api/runs',{scenario:'clean-control',agent:'careful',seed:-2})).status,400);
  assert.equal((await api('/api/runs',undefined,'é'.repeat(10))).status,401);
});
test('SQLite round trip preserves run history and hashed capability across restart',()=>{
  const dir=mkdtempSync(join(tmpdir(),'crashlab-test-'));try{const path=join(dir,'runs.sqlite');const run=newRun('payment-timeout',42,'external');let store=new RunStore(path);store.save(run);store.authorize('secret-test',run);store.close();store=new RunStore(path);assert.deepEqual(store.get(run.id),run);assert.equal(store.resolve('secret-test')?.id,run.id);assert.equal(store.resolve('wrong'),undefined);const rows=store.db.prepare('SELECT hash FROM capabilities').all();assert.notEqual(rows[0].hash,'secret-test');store.close();}finally{rmSync(dir,{recursive:true,force:true});}
});
test('concurrent agent requests retain both side effects and ordered evidence',async t=>{
  const {api}=await fixture(t);const data=await(await api('/api/runs',{scenario:'clean-control',agent:'external',seed:42})).json();const token=data.connection.mcpServers['agent-crash-lab'].env.CRASHLAB_TOKEN;
  const invoice=data.run.world.invoices[0];const argumentsBase={invoice_id:invoice.id,vendor_id:invoice.vendor_id,account_id:'acct_north_verified',amount_cents:invoice.amount_cents};
  await Promise.all(['first','second'].map(key=>api('/agent/call',{name:'payments_create',arguments:{...argumentsBase,idempotency_key:key}},token)));
  const saved=await(await api(`/api/runs/${data.run.id}`)).json();assert.equal(saved.payments.length,2);assert.deepEqual(saved.events.map((e:any)=>e.seq),[1,2]);assert.ok(saved.findings.some((f:any)=>f.code==='DUPLICATE_PAYMENT'));
});
test('standalone HTTP adapter completes every scenario without importing the simulator',async t=>{
  const {api,origin}=await fixture(t);
  for(const scenario of scenarios){
    const created=await(await api('/api/runs',{scenario:scenario.id,agent:'external',seed:42})).json();
    await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../examples/external-agent.mjs',import.meta.url))],{env:{...process.env,CRASHLAB_URL:origin,CRASHLAB_TOKEN:created.connection.mcpServers['agent-crash-lab'].env.CRASHLAB_TOKEN}});
    const report=await(await api(`/api/runs/${created.run.id}`)).json();assert.equal(report.evaluation.verdict,'passed',scenario.id);
  }
});

test('history traverses beyond 250 runs without duplicates when newer runs arrive',async t=>{
  const {api,store}=await fixture(t);const ids=new Set<string>();
  for(let i=0;i<267;i++){const r=newRun('clean-control',i,'external');r.created_at='2026-01-01T00:00:00.000Z';store.save(r);ids.add(r.id);}
  const first=await(await api('/api/history?limit=40')).json();assert.equal(first.total,267);assert.equal(first.runs.length,40);
  assert.equal(first.runs[0].world,undefined);assert.equal(first.runs[0].events,undefined);
  const incoming=newRun('clean-control',999,'external');incoming.created_at='2026-01-01T00:00:00.000Z';store.save(incoming);
  const seen=new Set<string>(first.runs.map((r:any)=>r.id));let cursor=first.next_cursor;
  while(cursor){const page=await(await api(`/api/history?limit=40&before=${cursor}`)).json();for(const r of page.runs){assert.ok(!seen.has(r.id));seen.add(r.id);}cursor=page.next_cursor;}
  assert.deepEqual(seen,ids);assert.ok(!seen.has(incoming.id));
  assert.equal((await(await api('/api/history?limit=1')).json()).runs[0].id,incoming.id);
  assert.equal((await(await api('/api/runs')).json()).length,250,'legacy endpoint remains compatible');
});
test('history rejects invalid pagination and remains operator-only',async t=>{
  const {api}=await fixture(t);
  for(const query of ['limit=0','limit=101','limit=1.5','limit=abc','before=not-a-cursor','unexpected=yes'])assert.equal((await api(`/api/history?${query}`)).status,400,query);
  assert.equal((await api('/api/history?before=00000000-0000-4000-8000-000000000000')).status,404);
  assert.equal((await api('/api/history',undefined,'wrong')).status,401);
  const connection=await(await api('/api/runs',{scenario:'clean-control',agent:'external'})).json();
  assert.equal((await api('/api/history',undefined,connection.connection.mcpServers['agent-crash-lab'].env.CRASHLAB_TOKEN)).status,401);
});

test('global history search finds old metadata, combines filters and follows outcome changes',async t=>{
  const {api,store}=await fixture(t);const {finishRun}=await import('../src/engine.js');
  const target=newRun('clean-control',424242,'target-hermes');target.created_at='2025-01-01T00:00:00.000Z';target.execution={adapter:'hermes',status:'starting',model:'local-specific-model'};store.save(target);
  for(let i=0;i<270;i++)store.save(newRun('payment-timeout',i,'external'));
  const search=async(q:string,filter='all')=>(await(await api(`/api/history?q=${encodeURIComponent(q)}&filter=${filter}`)).json());
  assert.equal((await search('LOCAL-SPECIFIC-MODEL')).runs[0].id,target.id);
  assert.equal((await search('ordinary Tuesday')).matched_total,1);
  assert.equal((await search(target.world.vendors[0].private_note.slice(0,80))).matched_total,0);
  assert.equal((await search('424242','running')).runs[0].id,target.id);
  assert.equal((await search('target-hermes','reference')).matched_total,0);
  store.mutate(target.id,r=>{finishRun(r);r.execution!.status='completed';});
  assert.equal((await search('target-hermes','running')).matched_total,0);
  assert.equal((await search('target-hermes','attention')).matched_total,1);
  assert.equal((await search("' OR 1=1 --")).matched_total,0);
  assert.equal((await api('/api/history?q='+ 'x'.repeat(201))).status,400);
});
test('search index migrates old records, refreshes legacy writers and rolls back atomically',()=>{
  const dir=mkdtempSync(join(tmpdir(),'crashlab-search-'));const path=join(dir,'runs.sqlite');
  const store=new RunStore(path);const run=newRun('clean-control',42,'original');store.save(run);
  store.db.exec('DROP TRIGGER runs_search_insert; DROP TRIGGER runs_search_update; DROP TRIGGER runs_search_delete; DROP TABLE run_search; DROP TABLE run_search_dirty;');store.close();
  const reopened=new RunStore(path);
  try{
    assert.equal(reopened.page(50,undefined,'original').matched_total,1);
    assert.throws(()=>reopened.mutate(run.id,r=>{r.agent='rolled-back';reopened.save(r);throw new Error('abort');}),/abort/);
    assert.equal(reopened.page(50,undefined,'rolled-back').matched_total,0);
    run.agent='legacy-writer';reopened.db.prepare('UPDATE runs SET data=? WHERE id=?').run(JSON.stringify(run),run.id);
    assert.equal(reopened.page(50,undefined,'legacy-writer').matched_total,1);
    assert.equal(reopened.page(50,undefined,'original').matched_total,0);
  }finally{reopened.close();rmSync(dir,{recursive:true,force:true});}
});
