import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAdapter } from '../src/runner.js';

test('pre-cancelled Hermes adapter never launches a child process',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'crashlab-cancel-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const marker=join(dir,'launched');const abort=new AbortController();abort.abort();
  const result=await runAdapter(process.execPath,['-e',`require('node:fs').writeFileSync(${JSON.stringify(marker)},'launched')`],{},1000,abort.signal);
  assert.equal(result.cancelled,true);assert.equal(result.code,null);assert.deepEqual(result.records,[]);
  await assert.rejects(()=>access(marker));
});
test('Hermes supervisor bounds stderr floods without persisting them',async()=>{
  const result=await runAdapter(process.execPath,['-e',"process.stderr.write('PRIVATE-LOG'.repeat(300000));setInterval(()=>{},1000)"],{},5000);
  assert.equal(result.timedOut,true);assert.deepEqual(result.records,[]);assert.ok(result.duration_ms<5000);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE-LOG/);
});
test('Hermes supervisor captures a final record without a trailing newline',async()=>{
  const result=await runAdapter(process.execPath,['-e',"process.stdout.write('CRASHLAB:'+JSON.stringify({kind:'result',ok:true}))"],{},1000);
  assert.equal(result.code,0);assert.deepEqual(result.records,[{kind:'result',ok:true}]);
});
