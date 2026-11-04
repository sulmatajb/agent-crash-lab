import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { RunStore } from '../src/store.js';
import { createLabServer } from '../src/server.js';
import { newRun, evaluate } from '../src/engine.js';
import { runScripted } from '../src/agents.js';
import { compareReports } from '../src/compare.js';
function report(agent:'careful'|'reckless',seed=42){const r=newRun('payment-timeout',seed,agent);runScripted(r,agent);return r;}
async function fixture(t:any){
 const store=new RunStore(':memory:'),existing=newRun('clean-control',42,'external');store.save(existing);store.authorize('agent-token',existing);
 const server=createLabServer(store,'admin-token');server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${(server.address() as any).port}`;
 t.after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();});
 const post=(body:unknown,token='admin-token',headers={})=>fetch(origin+'/api/reports/compare',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...headers},body:typeof body==='string'||body instanceof Uint8Array?body as any:JSON.stringify(body)});
 const unchanged=()=>{assert.deepEqual(store.list(),[existing]);assert.equal(store.db.prepare('SELECT count(*) AS n FROM capabilities').get()!.n,1);assert.equal(store.resolve('agent-token')!.id,existing.id);};
 return {post,unchanged,existing};
}
for(const mode of ['regression','reverse','both-failed','running','execution-error'] as const)test(`report pair ${mode} uses exact CLI comparison and cannot bind stored identity`,async t=>{
 const {post,unchanged,existing}=await fixture(t);let baseline=report('careful'),candidate=report('reckless');
 if(mode==='reverse')[baseline,candidate]=[candidate,baseline];if(mode==='both-failed')baseline=report('reckless');if(mode==='running')candidate=newRun('payment-timeout',42,'external');if(mode==='execution-error')candidate.execution={adapter:'synthetic',status:'error',error:'Synthetic runtime unavailable'};
 baseline.id=existing.id;candidate.id=existing.id;const res=await post({baseline,candidate});assert.equal(res.status,200);const data=await res.json();assert.deepEqual(data.comparison,JSON.parse(JSON.stringify(compareReports([baseline],[candidate]))));assert.deepEqual(data.baseline,{...baseline,evaluation:evaluate(baseline)});assert.deepEqual(data.candidate,{...candidate,evaluation:evaluate(candidate)});assert.equal(data.comparison.cases[0].status,mode==='regression'?'regression':['running','execution-error'].includes(mode)?'inconclusive':'no-regression');unchanged();
});
test('mismatched valid cases return actionable generic error without evidence content',async t=>{const {post,unchanged}=await fixture(t);const res=await post({baseline:report('careful'),candidate:report('reckless',43)});assert.equal(res.status,400);assert.match((await res.json()).error,/same scenario, scenario version and seed/);unchanged();});
test('invalid pair or tampered evidence fails closed without leaking private input',async t=>{
 const {post,unchanged}=await fixture(t);const good=report('careful');
 for(const pair of [null,[],{}, {baseline:good},{baseline:good,candidate:good,PRIVATE_SENTINEL:true},{baseline:{runs:[good]},candidate:good},{baseline:good,candidate:{...good,world:{PRIVATE_SENTINEL:'secret'}}},{baseline:good,candidate:{...good,agent:undefined}}]){const res=await post(pair);assert.equal(res.status,400);assert.doesNotMatch(JSON.stringify(await res.json()),/PRIVATE_SENTINEL|secret/);unchanged();}
});
test('comparison uses admin authorization, origin check, fatal UTF8 and combined limit',async t=>{
 const {post,unchanged}=await fixture(t);const pair={baseline:report('careful'),candidate:report('reckless')};
 for(const token of ['','wrong','agent-token'])assert.equal((await post(pair,token)).status,401);
 assert.equal((await post(pair,'admin-token',{Origin:'https://example.invalid'})).status,403);
 for(const data of [Buffer.from([255]),'{"PRIVATE_SENTINEL":']){const res=await post(data);assert.equal(res.status,400);assert.equal((await res.json()).error,'Report must be valid UTF-8 JSON.');}
 const over={baseline:{...pair.baseline,note:'x'.repeat(6*1024*1024)},candidate:{...pair.candidate,note:'x'.repeat(5*1024*1024)}};const res=await post(over);assert.equal(res.status,400);assert.match((await res.json()).error,/10 MiB/);unchanged();
});
