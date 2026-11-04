import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { JSDOM,VirtualConsole } from 'jsdom';
import { createLabServer } from '../src/server.js';
import { RunStore } from '../src/store.js';
import { newRun } from '../src/engine.js';
import { runScripted } from '../src/agents.js';
import { compareReports } from '../src/compare.js';
const pause=()=>new Promise(r=>setTimeout(r,15));
async function until(predicate:()=>boolean){const end=Date.now()+5000;while(!predicate()){if(Date.now()>end)throw Error('Comparison UI did not reach expected state');await pause();}}
function deferred(){let resolve!:(v:any)=>void;const promise=new Promise(a=>{resolve=a;});return{promise,resolve};}
function report(agent:'careful'|'reckless',seed=42){const r=newRun('payment-timeout',seed,agent);runScripted(r,agent);return r;}
async function ui(t:TestContext){
 const store=new RunStore(':memory:'),existing=newRun('clean-control',11,'external');store.save(existing);const server=createLabServer(store);server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${(server.address() as any).port}`;
 const requests:string[]=[],errors:string[]=[],gates:any[]=[],blobs:Blob[]=[],downloads:{href:string,name:string,connected:boolean}[]=[],revoked:string[]=[],comparisons:any[]=[];const failures={url:false,click:false};let active=0;const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=await JSDOM.fromURL(`${origin}/#run=${existing.id}`,{resources:'usable',runScripts:'dangerously',virtualConsole:vc,beforeParse(window){window.URL.createObjectURL=((blob:Blob)=>{if(failures.url)throw Error('Synthetic URL failure');blobs.push(blob);return `blob:comparison-${blobs.length}`;}) as any;window.URL.revokeObjectURL=(url:string)=>revoked.push(url);window.HTMLAnchorElement.prototype.click=function(){if(failures.click)throw Error('Synthetic click failure');downloads.push({href:this.href,name:this.download,connected:this.isConnected});};window.TextDecoder=TextDecoder as any;window.setInterval=(()=>1) as any;window.fetch=(async(url:any,options:any={})=>{active++;requests.push(String(url));const gate=gates.find(g=>!g.used&&String(url)==='/api/reports/compare');if(gate)gate.used=true;try{const res=await fetch(new URL(url,origin),{...options,signal:undefined});const text=await res.text();if(String(url)==='/api/reports/compare'&&res.ok)comparisons.push(JSON.parse(text).comparison);if(gate){gate.ready=true;await gate.wait.promise;}return new Response(text,{status:res.status,headers:res.headers});}finally{active--;}}) as any;}});
 t.after(async()=>{gates.forEach(g=>g.wait.resolve(null));await until(()=>active===0);dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));store.close();assert.deepEqual(errors,[]);});
 const doc=dom.window.document,click=(selector:string)=>(doc.querySelector(selector) as HTMLElement).click(),status=()=>doc.querySelector('#report-pair-status')!.textContent!,output=()=>doc.querySelector('#report-comparison-result')!.textContent!;
 const pick=(side:string,r:any,name=side+'.json',read?:Promise<any>)=>{const bytes=Buffer.from(typeof r==='string'?r:JSON.stringify(r));const input=doc.querySelector(`#${side}-report`) as HTMLInputElement;Object.defineProperty(input,'files',{configurable:true,value:[{name,size:bytes.length,arrayBuffer:()=>read??Promise.resolve(bytes)}]});input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
 const submit=()=>doc.querySelector('#report-comparison-form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
 const hold=()=>{const gate={used:false,ready:false,wait:deferred()};gates.push(gate);return gate;};
 await until(()=>doc.querySelector('.run-id')?.textContent===existing.id.slice(0,8));click('[data-view="reports"]');assert.equal(doc.activeElement,doc.querySelector('#report-comparison-title'));
 const downloadText=()=>new Promise<string>((resolve,reject)=>{const reader=new dom.window.FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsText(blobs.at(-1) as any);});
 return{dom,doc,store,existing,requests,click,pick,submit,status,output,hold,blobs,downloads,revoked,comparisons,failures,downloadText,idle:()=>until(()=>active===0)};
}
test('pair comparison preserves read-only evidence, escapes labels and retains pair when returning',async t=>{
 const h=await ui(t);h.pick('baseline',report('careful'),'<script>base</script>.json');const candidate=report('reckless');candidate.agent='<img onerror=x>';candidate.id=h.existing.id;h.pick('candidate',candidate);await until(()=>h.status()==='Ready to compare.');h.submit();await until(()=>h.output().includes('Regression observed'));
 assert.equal(h.doc.querySelector('#report-comparison-heading'),h.doc.activeElement);assert.match(h.output(),/No-regression does not mean passing/);assert.equal(h.doc.querySelector('#report-comparison-result script'),null);assert.equal(h.doc.querySelector('#report-comparison-result img'),null);
 h.click('[data-inspect-report="candidate"]');assert.match(h.doc.querySelector('#run-output')!.textContent!,/Report-declared agent:/);assert.equal((h.doc.querySelector('#imported-report-context') as HTMLElement).hidden,false);assert.equal(h.doc.querySelector('#finish-run'),null);assert.equal(h.doc.querySelector('#export-run'),null);assert.equal(h.doc.querySelector('#copy-run-link'),null);assert.equal(h.dom.window.location.hash,'');assert.deepEqual(h.store.list(),[h.existing]);
 h.click('#back-report-comparison');assert.equal(h.doc.activeElement,h.doc.querySelector('#report-comparison-heading'));assert.match(h.output(),/Regression observed/);assert.equal((h.doc.querySelector('#reports-view') as HTMLElement).hidden,false);
 const before=h.doc.querySelector('#run-output')!.textContent;h.pick('candidate','{bad');await until(()=>h.status().includes('valid UTF-8 JSON'));assert.equal(h.output(),'');assert.equal(h.doc.querySelector('#run-output')!.textContent,before);
});
test('replacement clears previous result immediately and discards older response',async t=>{
 const h=await ui(t);h.pick('baseline',report('careful'));h.pick('candidate',report('reckless'));await until(()=>h.status()==='Ready to compare.');const gate=h.hold();h.submit();await until(()=>gate.ready);h.pick('candidate',report('careful'),'new-candidate.json');await until(()=>h.status()==='Ready to compare.');gate.wait.resolve(null);await h.idle();assert.equal(h.output(),'');h.submit();await until(()=>h.output().includes('No regression observed'));assert.match(h.output(),/new-candidate.json/);assert.deepEqual(h.store.list(),[h.existing]);
});
test('independent file reads and same-side revisions do not overwrite newer selections',async t=>{
 const h=await ui(t),old=deferred();h.pick('baseline',report('reckless'),'old.json',old.promise);h.pick('baseline',report('careful'),'new.json');h.pick('candidate',report('reckless'));await until(()=>h.status()==='Ready to compare.');old.resolve(Buffer.from(JSON.stringify(report('reckless'))));await pause();h.submit();await until(()=>h.output().includes('Regression observed'));assert.match(h.output(),/new.json/);assert.doesNotMatch(h.output(),/old.json/);
});
test('mismatch and malformed pair keep current evidence and never create a run',async t=>{
 const h=await ui(t),before=h.doc.querySelector('#run-output')!.textContent;h.pick('baseline',report('careful'));h.pick('candidate',report('reckless',43));await until(()=>h.status()==='Ready to compare.');h.submit();await until(()=>h.status().includes('same scenario'));assert.equal(h.output(),'');assert.equal(h.doc.querySelector('#run-output')!.textContent,before);assert.deepEqual(h.store.list(),[h.existing]);assert.equal(h.requests.filter(p=>p==='/api/runs').length,0);
});

for(const mode of ['regression','reverse','both-failed','running','execution-error'] as const)test(`download ${mode} contains exactly the current comparison summary`,async t=>{
 const h=await ui(t);let baseline=report('careful'),candidate=report('reckless');
 if(mode==='reverse')[baseline,candidate]=[candidate,baseline];if(mode==='both-failed')baseline=report('reckless');if(mode==='running')candidate=newRun('payment-timeout',42,'external');if(mode==='execution-error')candidate.execution={adapter:'synthetic',status:'error',error:'PRIVATE_EXECUTION_DETAIL'};
 baseline.id='report-declared-id';candidate.agent='<unverified-agent>';(baseline as any).private_note='PRIVATE_RAW_REPORT';
 h.pick('baseline',baseline,'PRIVATE_FILENAME.json');h.pick('candidate',candidate);await until(()=>h.status()==='Ready to compare.');h.submit();await until(()=>h.status()==='Comparison ready.');
 const button=h.doc.querySelector('#save-report-comparison') as HTMLButtonElement;assert.equal(button.textContent,'Save comparison JSON');assert.equal(button.type,'button');assert.match(h.doc.getElementById(button.getAttribute('aria-describedby')!)!.textContent!,/summary cannot be reopened with Open report/);
 h.click('[data-inspect-report="candidate"]');h.click('#back-report-comparison');const before=h.requests.length;h.click('#save-report-comparison');const text=await h.downloadText();
 assert.equal(text,JSON.stringify(h.comparisons.at(-1),null,2));assert.deepEqual(JSON.parse(text),JSON.parse(JSON.stringify(compareReports([baseline],[candidate]))));assert.doesNotMatch(text,/PRIVATE_FILENAME|PRIVATE_RAW_REPORT|PRIVATE_EXECUTION_DETAIL/);assert.equal(JSON.parse(text).cases[0].baseline.id,'report-declared-id');assert.equal(JSON.parse(text).cases[0].candidate.agent,'<unverified-agent>');
 assert.equal(JSON.parse(text).cases[0].status,mode==='regression'?'regression':['running','execution-error'].includes(mode)?'inconclusive':'no-regression');if(mode==='both-failed')assert.equal(JSON.parse(text).cases[0].candidate.verdict,'failed');
 assert.deepEqual(h.downloads,[{href:'blob:comparison-1',name:'crashlab-comparison.json',connected:true}]);assert.equal(h.blobs[0].type,'application/json');assert.equal(h.doc.querySelector('a[download]'),null);assert.equal(h.requests.length,before);assert.match(h.status(),/download requested/);assert.doesNotMatch(h.status(),/saved/i);assert.deepEqual(h.store.list(),[h.existing]);
 await until(()=>h.revoked.length===1);assert.deepEqual(h.revoked,['blob:comparison-1']);
});
test('save is unavailable before success, during reads and requests, and after invalid or obsolete results',async t=>{
 const h=await ui(t),save=()=>h.doc.querySelector('#save-report-comparison');assert.equal(save(),null);
 h.pick('baseline',report('careful'));h.pick('candidate',report('reckless'));await until(()=>h.status()==='Ready to compare.');h.submit();await until(()=>save()!==null);
 const gate=h.hold();h.submit();assert.equal(save(),null);await until(()=>gate.ready);const old=deferred();h.pick('candidate',report('reckless'),'obsolete.json',old.promise);assert.equal(save(),null);assert.equal((h.doc.querySelector('#compare-reports-submit') as HTMLButtonElement).disabled,true);
 h.pick('candidate','{invalid');await until(()=>h.status().includes('valid UTF-8 JSON'));old.resolve(Buffer.from(JSON.stringify(report('reckless'))));gate.wait.resolve(null);await h.idle();await pause();assert.equal(save(),null);assert.equal(h.output(),'');assert.match(h.status(),/valid UTF-8 JSON/);assert.equal(h.downloads.length,0);
 h.pick('candidate',report('careful',43));await until(()=>h.status()==='Ready to compare.');h.submit();await until(()=>h.status().includes('same scenario'));assert.equal(save(),null);
 h.pick('candidate',report('careful'));await until(()=>h.status()==='Ready to compare.');h.submit();await until(()=>save()!==null);h.click('#save-report-comparison');assert.equal(JSON.parse(await h.downloadText()).regressions,0);
 const input=h.doc.querySelector('#candidate-report') as HTMLInputElement;Object.defineProperty(input,'files',{configurable:true,value:[]});input.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));assert.equal(save(),null);
});
test('download preparation failures allow retry and clean up URLs and temporary links',async t=>{
 const h=await ui(t);h.pick('baseline',report('careful'));h.pick('candidate',report('reckless'));await until(()=>h.status()==='Ready to compare.');h.submit();await until(()=>h.status()==='Comparison ready.');
 h.failures.url=true;h.click('#save-report-comparison');assert.match(h.status(),/Could not prepare comparison download.*Try Save comparison JSON again.*CLI compare --out/);assert.equal(h.downloads.length,0);assert.equal(h.doc.querySelector('a[download]'),null);assert.equal(h.revoked.length,0);
 h.failures.url=false;h.failures.click=true;h.click('#save-report-comparison');assert.equal(h.downloads.length,0);assert.deepEqual(h.revoked,['blob:comparison-1']);assert.equal(h.doc.querySelector('a[download]'),null);
 h.failures.click=false;h.click('#save-report-comparison');assert.equal(h.downloads.length,1);assert.match(h.status(),/download requested/);assert.equal(await h.downloadText(),JSON.stringify(h.comparisons.at(-1),null,2));
 h.dom.window.dispatchEvent(new h.dom.window.Event('pagehide'));assert.deepEqual(h.revoked,['blob:comparison-1','blob:comparison-2']);h.click('#save-report-comparison');assert.equal(h.downloads.length,1);await new Promise(r=>setTimeout(r,1100));assert.deepEqual(h.revoked,['blob:comparison-1','blob:comparison-2']);assert.equal(h.doc.querySelector('a[download]'),null);
});
