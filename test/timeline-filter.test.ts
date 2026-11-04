import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {JSDOM,VirtualConsole} from 'jsdom';
const root=process.env.CRASHLAB_TEST_ROOT?pathToFileURL(resolve(process.env.CRASHLAB_TEST_ROOT)+'/'):new URL('../',import.meta.url);
const {createLabServer}=await import(new URL('src/server.ts',root).href);
const {RunStore}=await import(new URL('src/store.ts',root).href);
const {newRun,callTool}=await import(new URL('src/engine.ts',root).href);
const pause=()=>new Promise(r=>setTimeout(r,15));
async function until(fn:()=>boolean){const end=Date.now()+5000;while(!fn()){if(Date.now()>end)throw Error('Timeline UI did not reach expected state');await pause();}}
async function dashboard(t:TestContext){
 const store=new RunStore(':memory:'),run=newRun('payment-timeout',273,'external');
 const invoice=run.world.invoices[0],vendor=run.world.vendors.find((v:any)=>v.id===invoice.vendor_id)!;
 const args={invoice_id:invoice.id,vendor_id:vendor.id,account_id:vendor.account_id,amount_cents:invoice.amount_cents,idempotency_key:'first'};
 callTool(run,'policy_get',{});callTool(run,'payments_create',args);callTool(run,'policy_get',{});callTool(run,'payments_create',{...args,idempotency_key:'duplicate'});callTool(run,'unknown_tool',{});callTool(run,'inbox_list',{});store.save(run);
 const empty=newRun('clean-control',2,'external');store.save(empty);
 const server=createLabServer(store);server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${(server.address() as any).port}`;
 const errors:string[]=[],requests:string[]=[],downloads:Blob[]=[];const registered=new Map<string,any>();let poll!:()=>Promise<void>,active=0;
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=await JSDOM.fromURL(`${origin}/#run=${run.id}`,{resources:'usable',runScripts:'dangerously',virtualConsole:vc,beforeParse(window){
  window.TextDecoder=TextDecoder as any;window.Blob=Blob as any;window.URL.createObjectURL=((blob:Blob)=>{downloads.push(blob);return 'blob:local-test';}) as any;window.URL.revokeObjectURL=()=>{};window.HTMLAnchorElement.prototype.click=()=>{};
  window.setInterval=((fn:any)=>{poll=fn;return 1;}) as any;Object.defineProperty(window.document,'modelContext',{value:{registerTool(tool:any){registered.set(tool.name,tool);}}});
  window.fetch=(async(url:any,options:any={})=>{active++;requests.push(String(url));const controller=new AbortController(),abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});try{return await fetch(new URL(url,origin),{...options,signal:controller.signal});}finally{active--;options.signal?.removeEventListener('abort',abort);}}) as any;
 }});
 t.after(async()=>{await until(()=>active===0);dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));store.close();assert.deepEqual(errors,[]);});
 const doc=dom.window.document,click=(s:string)=>{const el=doc.querySelector(s) as HTMLElement;assert.ok(el,s);el.click();};
 const select=()=>{const el=doc.querySelector('#timeline-filter') as HTMLSelectElement;assert.ok(el,'timeline filter must exist');return el;};
 const filter=(value='attention')=>{select().focus();select().value=value;select().dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
 const open=async(id:string)=>{const button=doc.createElement('button');button.dataset.run=id;doc.body.append(button);button.click();button.remove();await until(()=>doc.querySelector('.run-id')?.textContent===id.slice(0,8)&&select().value==='all');};
 const importRun=async(report:any)=>{const input=doc.querySelector('#report-file') as HTMLInputElement,bytes=Buffer.from(JSON.stringify(report));Object.defineProperty(input,'files',{configurable:true,value:[{name:'synthetic.json',size:bytes.length,arrayBuffer:async()=>bytes}]});input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await until(()=>!(doc.querySelector('#imported-report-context') as HTMLElement).hidden);};
 const seqs=()=>[...doc.querySelectorAll('.event-num')].map(e=>Number(e.textContent));
 await until(()=>doc.querySelector('.run-id')?.textContent===run.id.slice(0,8));await until(()=>registered.size===2);
 return{doc,dom,store,run,empty,click,select,filter,open,importRun,seqs,requests,downloads,registered,poll:()=>poll()};
}
test('attention includes findings, faults and errors in original order; full metrics, effects, checks and export remain intact',async t=>{
 const h=await dashboard(t);assert.equal(h.select().labels?.[0].textContent?.startsWith('Timeline events'),true);assert.equal(h.select().getAttribute('aria-describedby'),'timeline-filter-help');
 assert.deepEqual([...h.select().options].map(o=>[o.value,o.text]),[['all','All events'],['attention','Needs attention']]);
 const metrics=h.doc.querySelector('.metrics')!.textContent;
 h.filter();assert.deepEqual(h.seqs(),[2,4,5]);assert.equal(h.doc.querySelector('#timeline-count')!.textContent,'3 of 6 events shown');assert.equal(h.doc.activeElement,h.select());assert.equal(h.doc.querySelector('.metrics')!.textContent,metrics);
 assert.match(h.doc.querySelector('[data-evidence="event-4"] pre')!.textContent!,/duplicate/);
 h.click('[data-tab="ledger"]');assert.equal(h.doc.querySelectorAll('.ledger-table tbody tr').length,2);h.click('[data-tab="checks"]');assert.match(h.doc.querySelector('#evidence-panel')!.textContent!,/Policy violations observed/);h.click('[data-tab="timeline"]');assert.equal(h.select().value,'attention');
 h.click('#export-run');await until(()=>h.downloads.length===1);const exported=JSON.parse(await h.downloads[0].text());assert.deepEqual(exported.events,h.run.events);assert.deepEqual(exported.payments,h.run.payments);assert.equal(exported.evaluation.tool_calls,6);
 h.filter('all');assert.deepEqual(h.seqs(),[1,2,3,4,5,6]);assert.equal(h.doc.querySelector('#timeline-count')!.textContent,'6 of 6 events shown');
});
test('poll and finish keep filter, focused control or summary, expanded details and scroll keyed by event',async t=>{
 const h=await dashboard(t);const first=h.doc.querySelector('[data-evidence="event-1"] pre') as HTMLElement;first.scrollTop=11;
 const detail=h.doc.querySelector('[data-evidence="event-4"]') as HTMLDetailsElement;detail.open=true;(detail.querySelector('pre') as HTMLElement).scrollTop=44;
 h.filter();assert.equal((h.doc.querySelector('[data-evidence="event-4"] pre') as HTMLElement).scrollTop,44);assert.equal((h.doc.querySelector('[data-evidence="event-2"] pre') as HTMLElement).scrollTop,0);
 h.store.mutate(h.run.id,(r:any)=>callTool(r,'policy_get',{}));await h.poll();assert.equal(h.select().value,'attention');assert.equal(h.doc.activeElement,h.select());assert.equal(h.doc.querySelector('#timeline-count')!.textContent,'3 of 7 events shown');assert.equal((h.doc.querySelector('[data-evidence="event-4"]') as HTMLDetailsElement).open,true);
 (h.doc.querySelector('[data-evidence="event-4"] summary') as HTMLElement).focus();h.store.mutate(h.run.id,(r:any)=>callTool(r,'unknown_tool',{}));await h.poll();assert.equal(h.doc.activeElement,h.doc.querySelector('[data-evidence="event-4"] summary'));assert.deepEqual(h.seqs(),[2,4,5,8]);
 h.select().focus();h.click('#finish-run');await until(()=>!h.doc.querySelector('#finish-run'));assert.equal(h.select().value,'attention');assert.equal(h.doc.activeElement,h.select());assert.equal((h.doc.querySelector('[data-evidence="event-4"]') as HTMLDetailsElement).open,true);
});
test('zero matches differs from empty running, completed and imported timelines',async t=>{
 const h=await dashboard(t);await h.open(h.empty.id);h.filter();assert.match(h.doc.querySelector('#evidence-panel')!.textContent!,/Waiting for the agent’s first tool call/);assert.equal(h.doc.querySelector('#timeline-count')!.textContent,'0 of 0 events shown');
 h.store.mutate(h.empty.id,(r:any)=>callTool(r,'policy_get',{}));await h.poll();assert.match(h.doc.querySelector('#evidence-panel')!.textContent!,/No events need attention/);assert.equal(h.doc.querySelector('#timeline-count')!.textContent,'0 of 1 events shown');
 const blank=newRun('clean-control',3,'external');h.store.save(blank);await h.open(blank.id);h.filter();h.click('#finish-run');await until(()=>!h.doc.querySelector('#finish-run'));assert.match(h.doc.querySelector('#evidence-panel')!.textContent!,/No tool calls were recorded. This run has ended/);
 await h.importRun(newRun('clean-control',4,'external'));h.filter();assert.match(h.doc.querySelector('#evidence-panel')!.textContent!,/No tool calls in this imported snapshot/);assert.doesNotMatch(h.doc.querySelector('#evidence-panel')!.textContent!,/Waiting for the agent/);
});
test('explicit run/scenario/reference/operator navigation resets; same-ID import cannot poll stored state',async t=>{
 const h=await dashboard(t);h.filter();await h.open(h.run.id);assert.equal(h.select().value,'all');h.filter();await h.importRun(h.run);assert.equal(h.select().value,'all');h.filter();const count=h.requests.length;h.store.mutate(h.run.id,(r:any)=>callTool(r,'unknown_tool',{}));await h.poll();assert.equal(h.requests.length,count);assert.equal(h.doc.querySelector('#timeline-count')!.textContent,'3 of 6 events shown');
 await h.open(h.run.id);assert.equal(h.select().value,'all');assert.equal((h.doc.querySelector('#imported-report-context') as HTMLElement).hidden,true);
 h.filter();h.click('[data-scenario="clean-control"]');assert.equal(h.doc.querySelector('#timeline-filter'),null);h.click('#run-button');
 // The timeline renders before history finishes refreshing and the run action becomes available.
 await until(()=>!!h.doc.querySelector('#timeline-filter')&&!h.doc.querySelector('#run-button')!.hasAttribute('disabled'));assert.equal(h.select().value,'all');
 h.filter();await h.registered.get('crashlab_run_reference').execute({scenario:'payment-timeout',agent:'reckless',seed:9});assert.equal(h.select().value,'all');
 h.filter();h.click('#run-button');await until(()=>!h.doc.querySelector('#run-button')!.hasAttribute('disabled'));assert.equal(h.select().value,'all');
});
