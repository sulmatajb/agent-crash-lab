import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { RunStore } from '../src/store.js';
import { createLabServer } from '../src/server.js';
import { newRun, evaluate } from '../src/engine.js';
import { runScripted } from '../src/agents.js';

async function fixture(t:any) {
  const store=new RunStore(':memory:'),existing=newRun('clean-control',42,'external');store.save(existing);store.authorize('agent-token',existing);
  const server=createLabServer(store,'admin-token');server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${(server.address() as any).port}`;
  t.after(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));store.close();});
  const post=(body:unknown,token='admin-token',headers={})=>fetch(origin+'/api/reports/review',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...headers},body:typeof body==='string'||body instanceof Uint8Array?body as any:JSON.stringify(body)});
  const unchanged=()=>{assert.deepEqual(store.list(),[existing]);assert.equal(store.db.prepare('SELECT count(*) AS n FROM capabilities').get()!.n,1);assert.equal(store.resolve('agent-token')!.id,existing.id);};
  return {store,existing,origin,post,unchanged};
}
for(const kind of ['completed','running','starting'] as const) test(`review ${kind} report recomputes view without saving or authorizing identity`,async t=>{
  const {post,existing,unchanged}=await fixture(t);const report=newRun('payment-timeout',19,'unverified-agent-label');report.id=existing.id;
  if(kind==='completed')runScripted(report,'reckless');if(kind==='starting')report.execution={adapter:'unverified',status:'starting'};
  const res=await post(report);assert.equal(res.status,200);const data=await res.json();assert.deepEqual(data.report,{...report,evaluation:evaluate(report)});assert.equal(data.verification.verified,true);assert.match(data.verification.limitation,/not report authorship or agent identity/);unchanged();
});
test('valid report with existing evaluation remains byte-value consistent and metadata is declared',async t=>{
  const {post,unchanged}=await fixture(t);const report=newRun('clean-control',12,'careful');runScripted(report,'careful');const submitted={...report,evaluation:evaluate(report),report_version:'1.0.0',created_at:'unverified-time'};const res=await post(submitted);assert.equal(res.status,200);assert.deepEqual((await res.json()).report,submitted);unchanged();
});
for(const kind of ['tampered-world','tampered-evaluation','unsupported-version','batch','null','array','private-key'] as const)test(`review rejects ${kind} without leaking submitted content or changing history`,async t=>{
  const {post,unchanged}=await fixture(t);let report:any=newRun('clean-control',42,'external');report.private_note='PRIVATE_SENTINEL';
  if(kind==='tampered-world')report.world={private_note:'PRIVATE_SENTINEL'};
  if(kind==='tampered-evaluation')report.evaluation={private_note:'PRIVATE_SENTINEL'};
  if(kind==='unsupported-version')report.scenario_version='PRIVATE_SENTINEL';
  if(kind==='batch')report={runs:[report]};if(kind==='null')report='null';if(kind==='array')report=[report];if(kind==='private-key')report.events=[{PRIVATE_SENTINEL:'PRIVATE_SENTINEL'}];
  const res=await post(report);assert.equal(res.status,400);const body=await res.json();assert.equal(body.code,'INVALID_REQUEST');assert.doesNotMatch(JSON.stringify(body),/PRIVATE_SENTINEL/);assert.match(body.error,/single supported Crash Lab report/);unchanged();
});
test('review rejects invalid UTF-8 and malformed JSON generically',async t=>{
  const {post,unchanged}=await fixture(t);const report=newRun('clean-control',42,'UTF8_MARKER');const text=JSON.stringify(report),i=text.indexOf('UTF8_MARKER');const bytes=Buffer.concat([Buffer.from(text.slice(0,i)),Buffer.from([0xff]),Buffer.from(text.slice(i+'UTF8_MARKER'.length))]);
  for(const body of [bytes,'{"PRIVATE_SENTINEL":', '']){const res=await post(body);assert.equal(res.status,400);assert.deepEqual(await res.json(),{error:'Report must be valid UTF-8 JSON.',code:'INVALID_REQUEST'});}unchanged();
});
test('review remains admin-only and same-origin',async t=>{
  const {post,unchanged}=await fixture(t);const report=newRun('clean-control',42,'external');
  for(const token of ['','wrong','agent-token'])assert.equal((await post(report,token)).status,401);
  assert.equal((await post(report,'admin-token',{Origin:'https://example.invalid'})).status,403);unchanged();
});
test('review accepts above64KiB, caps10MiB and keeps existing write limit',async t=>{
  const {post,origin,unchanged}=await fixture(t);const report={...newRun('clean-control',42,'external'),note:'x'.repeat(70000)};assert.equal((await post(report)).status,200);
  const huge=JSON.stringify({...report,note:'x'.repeat(10*1024*1024)});const oversized=await post(huge);assert.equal(oversized.status,400);assert.match((await oversized.json()).error,/10 MiB/);
  const old=await fetch(origin+'/api/runs',{method:'POST',headers:{Authorization:'Bearer admin-token'},body:JSON.stringify({scenario:'clean-control',agent:'external',note:'x'.repeat(70000)})});assert.equal(old.status,400);assert.match((await old.json()).error,/64 KiB/);unchanged();
});
