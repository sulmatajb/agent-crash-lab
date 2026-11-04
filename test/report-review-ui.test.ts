import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { JSDOM,VirtualConsole } from 'jsdom';
import { createLabServer } from '../src/server.js';
import { RunStore } from '../src/store.js';
import { newRun } from '../src/engine.js';
import { runScripted } from '../src/agents.js';
const pause=()=>new Promise(r=>setTimeout(r,15));
async function until(predicate:()=>boolean){const end=Date.now()+5000;while(!predicate()){if(Date.now()>end)throw Error('Report UI did not reach expected state');await pause();}}
function deferred(){let resolve!:(v:any)=>void,reject!:(e:any)=>void;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
async function ui(t:TestContext){
 const store=new RunStore(':memory:'),a=newRun('clean-control',11,'external'),b=newRun('payment-timeout',22,'external');store.save(a);store.save(b);const server=createLabServer(store);server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${(server.address() as any).port}`;
 const requests:string[]=[],errors:string[]=[],gates:any[]=[];let active=0,poll!:()=>Promise<void>;const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=await JSDOM.fromURL(`${origin}/#run=${a.id}`,{resources:'usable',runScripts:'dangerously',virtualConsole:vc,beforeParse(window){
  window.TextDecoder=TextDecoder as any;window.setInterval=((fn:any)=>{poll=fn;return 1;}) as any;
  window.fetch=(async(url:any,options:any={})=>{active++;requests.push(String(url));const gate=gates.find(g=>g.path===String(url)&&!g.used);if(gate)gate.used=true;const controller=new AbortController(),abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});try{const res=await fetch(new URL(url,origin),{...options,signal:controller.signal});const text=await res.text();if(gate){gate.ready=true;await gate.wait.promise;}return new Response(text,{status:res.status,headers:res.headers});}finally{active--;if(gate)gate.returned=true;options.signal?.removeEventListener('abort',abort);}}) as any;
 }});
 t.after(async()=>{gates.forEach(g=>g.wait.resolve());await until(()=>active===0);dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));store.close();assert.deepEqual(errors,[]);});
 const doc=dom.window.document,click=(selector:string)=>{const el=doc.querySelector(selector) as HTMLElement;assert.ok(el,selector);el.click();},text=()=>doc.querySelector('#run-output')!.textContent!,imported=()=>!(doc.querySelector('#imported-report-context') as HTMLElement).hidden;
 const hold=(path:string)=>{const gate={path,used:false,ready:false,returned:false,wait:deferred()};gates.push(gate);return gate;};
 const open=(report:any,name='synthetic.json',read?:Promise<any>,size?:number)=>{const bytes=Buffer.from(typeof report==='string'?report:JSON.stringify(report));const input=doc.querySelector('#report-file') as HTMLInputElement;Object.defineProperty(input,'files',{configurable:true,value:[{name,size:size??bytes.byteLength,arrayBuffer:()=>read??Promise.resolve(bytes)}]});input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
 const label=()=>doc.querySelector('#imported-report-label')!.textContent!;
 await until(()=>doc.querySelector('.run-id')?.textContent===a.id.slice(0,8));await until(()=>active===0);
 return{dom,doc,store,a,b,requests,click,open,text,imported,label,hold,poll:()=>poll(),idle:()=>until(()=>active===0)};
}
function report(seed=41){const r=newRun('payment-timeout',seed,'external');runScripted(r,'reckless');return r;}
test('reviewed report exposes existing evidence tabs with explicit snapshot identity and no stored actions',async t=>{
 const h=await ui(t),r=report();r.agent='<img src=x onerror=alert(1)> unverified';h.open(r,'<script>filename</script>.json');await until(h.imported);
 assert.match(h.label(),/Internal consistency checked/);assert.match(h.label(),/authorship, agent identity and timestamps are unverified/);assert.equal(h.dom.window.location.hash,'');assert.match(h.text(),/Report-declared agent: <img/);assert.equal(h.doc.querySelector('#run-output img'),null);assert.equal(h.doc.querySelector('#imported-report-context script'),null);
 for(const id of ['finish-run','copy-run-link','export-run'])assert.equal(h.doc.getElementById(id),null);
 assert.equal((h.doc.querySelector('#compare-button') as HTMLElement).hidden,true);assert.equal((h.doc.querySelector('.run-controls') as HTMLElement).hidden,true);assert.match(h.text(),/not saved in history/);
 h.click('[data-tab="ledger"]');assert.equal(h.doc.querySelectorAll('.ledger-table tbody tr').length,2);h.click('[data-tab="checks"]');assert.match(h.text(),/Policy violations observed/);h.click('[data-tab="timeline"]');assert.equal(h.doc.querySelectorAll('.event').length,r.events.length);assert.deepEqual(h.store.list(),[h.b,h.a]);
});
for(const starting of [false,true])test(`imported ${starting?'starting':'running'} ID collision cannot poll or mutate live run, including stale poll`,async t=>{
 const h=await ui(t),gate=h.hold(`/api/runs/${h.a.id}`),poll=h.poll();await until(()=>gate.ready);const r=newRun('payment-timeout',77,'imported-external');r.id=h.a.id;if(starting)r.execution={adapter:'claimed',status:'starting'};h.open(r);await until(h.imported);
 gate.wait.resolve(null);await poll;assert.match(h.text(),/seed 77/);assert.match(h.text(),/Recorded run was in progress/);assert.doesNotMatch(h.text(),/Auto-refreshing|Connect it using/);const count=h.requests.length;await h.poll();assert.equal(h.requests.length,count);
 for(const id of ['finish-run','copy-run-link','export-run']){const fake=h.doc.createElement('button');fake.id=id;h.doc.body.append(fake);fake.click();fake.remove();}await pause();assert.equal(h.requests.length,count);assert.deepEqual(h.store.get(h.a.id),h.a);
 h.click('#close-report');assert.equal(h.imported(),false);assert.equal(h.doc.querySelector('.result'),null);assert.equal((h.doc.querySelector('.run-controls') as HTMLElement).hidden,false);h.dom.window.location.hash=`run=${h.a.id}`;await until(()=>!!h.doc.getElementById('finish-run'));assert.equal(h.imported(),false);assert.match(h.text(),/seed 11/);
});
test('bad JSON, UTF8, size and inconsistent evidence retain the current imported view',async t=>{
 const h=await ui(t);h.open(report());await until(h.imported);const label=h.label(),output=h.text();
 for(const [value,read,size,message] of [['{"PRIVATE_SENTINEL":',undefined,undefined,'valid UTF-8 JSON'],[{},Promise.resolve(Buffer.from([255])),undefined,'valid UTF-8 JSON'],[{},undefined,10*1024*1024+1,'10 MiB'],[{...report(),world:{PRIVATE_SENTINEL:'secret'}},undefined,undefined,'could not be verified']] as any[]){
  h.doc.querySelector('#toast')!.textContent='';h.open(value,'invalid.json',read,size);await until(()=>h.doc.querySelector('#toast')!.textContent!.includes(message));assert.equal(h.label(),label);assert.equal(h.text(),output);assert.doesNotMatch(h.doc.querySelector('#toast')!.textContent!,/PRIVATE_SENTINEL|secret/);
 }
 h.open(report(90),'invalid.json');await until(()=>h.text().includes('seed 90'));assert.equal(h.imported(),true);
});
for(const outcome of ['success','failure'])test(`newer file survives old file-read ${outcome}`,async t=>{
 const h=await ui(t),read=deferred();h.open(report(40),'old.json',read.promise);h.open(report(41),'new.json');await until(()=>h.imported()&&h.label().startsWith('new.json'));
 if(outcome==='success')read.resolve(Buffer.from(JSON.stringify(report(40))));else read.reject(Error('PRIVATE_OLD_ERROR'));await pause();assert.match(h.text(),/seed 41/);assert.doesNotMatch(h.doc.querySelector('#toast')!.textContent!,/PRIVATE_OLD_ERROR/);
});
for(const target of ['scenario','history','run'] as const)test(`newer ${target} navigation survives pending review response`,async t=>{
 const h=await ui(t),gate=h.hold('/api/reports/review');h.open(report(88));await until(()=>gate.ready);
 if(target==='scenario')h.click('[data-scenario="mixed-batch"]');if(target==='history')h.click('.nav-item[data-view="history"]');if(target==='run'){h.dom.window.location.hash=`run=${h.b.id}`;await until(()=>h.doc.querySelector('.run-id')?.textContent===h.b.id.slice(0,8));}
 gate.wait.resolve(null);await h.idle();await pause();assert.equal(h.imported(),false);assert.doesNotMatch(h.text(),/seed 88/);
 if(target==='scenario')assert.equal(h.doc.querySelector('.scenario-button.selected')?.getAttribute('data-scenario'),'mixed-batch');if(target==='history')assert.equal((h.doc.querySelector('#history-view') as HTMLElement).hidden,false);if(target==='run')assert.match(h.text(),/seed 22/);
});
test('newer file survives an earlier validation rejection',async t=>{
 const h=await ui(t),gate=h.hold('/api/reports/review');h.open({PRIVATE_SENTINEL:true},'old-invalid.json');await until(()=>gate.ready);h.open(report(73),'valid-new.json');await until(h.imported);gate.wait.resolve(null);await h.idle();await pause();assert.match(h.label(),/^valid-new.json/);assert.match(h.text(),/seed 73/);assert.equal(h.doc.querySelector('#toast')!.textContent,'');
});

test('a stale stored-run poll failure cannot display a live warning over an imported snapshot',async t=>{
 const h=await ui(t),gate=h.hold(`/api/runs/${h.a.id}`),poll=h.poll();await until(()=>gate.ready);h.open(report(81));await until(h.imported);gate.wait.reject(Error('stale live poll'));
 await poll;assert.equal((h.doc.querySelector('#sync-status') as HTMLElement).hidden,true);assert.match(h.text(),/seed 81/);assert.equal(h.imported(),true);
});
test('a current history poll failure still shows a retry warning after reviewing a report',async t=>{
 const h=await ui(t);h.open(report());await until(h.imported);h.click('.nav-item[data-view="history"]');await h.idle();const path=h.requests.filter(p=>p.startsWith('/api/history?')).at(-1)!;assert.ok(path);const gate=h.hold(path),poll=h.poll();await until(()=>gate.ready);gate.wait.reject(Error('history unavailable'));await poll;
 assert.equal((h.doc.querySelector('#sync-status') as HTMLElement).hidden,false);assert.match(h.doc.querySelector('#sync-status')!.textContent!,/Live updates paused.*history unavailable/);
});
