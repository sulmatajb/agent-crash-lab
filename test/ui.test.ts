import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createLabServer } from '../src/server.js';
import { RunStore } from '../src/store.js';

async function until(predicate:()=>boolean) { const end=Date.now()+6000;while(!predicate()){if(Date.now()>end)throw new Error('UI did not reach expected state');await new Promise(r=>setTimeout(r,20));} }
test('dashboard runs, compares, changes tabs, browses history and creates an external connection',async t=>{
  const store=new RunStore(':memory:');const server=createLabServer(store);server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${(server.address() as any).port}`;
  const errors:Error[]=[];const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e));
  const registered=new Map<string,any>();
  const dom=await JSDOM.fromURL(origin,{resources:'usable',runScripts:'dangerously',virtualConsole:console,beforeParse(window){window.fetch=((url:any,options:any)=>fetch(new URL(url,origin),options)) as any;Object.defineProperty(window.document,'modelContext',{value:{registerTool(tool:any){registered.set(tool.name,tool);}}});}});
  t.after(async()=>{dom.window.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));store.close();});
  const doc=dom.window.document;
  const click=(selector:string)=>{const el=doc.querySelector(selector) as HTMLElement;assert.ok(el,selector);el.click();};
  await until(()=>doc.querySelectorAll('.scenario-button').length===7);
  click('#compare-button');await until(()=>doc.querySelectorAll('.compare-card').length===2);
  assert.match(doc.querySelector('#run-output')!.textContent!,/DUPLICATE|paid more than once/);
  click('[data-tab="ledger"]');assert.equal(doc.querySelectorAll('.ledger-table tbody tr').length,2);
  click('[data-tab="checks"]');assert.match(doc.querySelector('.result-content')!.textContent!,/No policy violations/);
  click('.compare-card:nth-child(2)');await until(()=>!!doc.querySelector('.result-title .passed'));
  click('.nav-item[data-view="history"]');await until(()=>doc.querySelectorAll('.history-row').length===2);assert.equal((doc.querySelector('#history-view') as HTMLElement).hidden,false);
  click('.nav-item[data-view="guide"]');click('#create-external');await until(()=>!(doc.querySelector('#connection-output') as HTMLElement).hidden);
  assert.match(doc.querySelector('#connection-output')!.textContent!,/CRASHLAB_TOKEN/);
  click('#connection-output [data-run]');await until(()=>!!doc.querySelector('.result-title .running'));
  click('#finish-run');await until(()=>!!doc.querySelector('.result-title .incomplete'));
  assert.equal(registered.size,2);assert.equal(registered.get('crashlab_list_scenarios').execute({}).length,7);
  const operator=registered.get('crashlab_run_reference');assert.equal(operator.annotations.readOnlyHint,false);assert.equal(operator.inputSchema.required.length,3);
  const before=store.list().length;await assert.rejects(()=>operator.execute({scenario:'bad',agent:'careful',seed:1}));assert.equal(store.list().length,before);
  const outcome=await operator.execute({scenario:'clean-control',agent:'careful',seed:9});assert.equal(outcome.verdict,'passed');assert.match(doc.querySelector('#scenario-title')!.textContent!,/ordinary Tuesday/);assert.ok(doc.querySelector('.result-title .passed'));assert.equal((doc.querySelector('#seed-input') as HTMLInputElement).value,'9');assert.equal((doc.querySelector('#agent-select') as HTMLSelectElement).value,'careful');
  assert.deepEqual(errors.map(e=>e.message),[]);
});
