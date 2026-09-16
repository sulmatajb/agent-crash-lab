import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startCampaign, verifyCampaign } from '../src/campaign.js';
import { evaluateClaude } from '../src/claude.js';
const settings={adapter:'claude-code' as const,scenarios:['clean-control' as const],seed:42,repetitions:1,timeoutMs:5000,maxTurns:10,task:'Synthetic task',systemPrompt:'PRIVATE PROMPT'};

test('manifests fingerprint effective settings without exposing prompt text or overwriting other campaigns',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'crashlab-manifest-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const a=await startCampaign(dir,settings),b=await startCampaign(dir,settings),c=await startCampaign(dir,{...settings,maxTurns:11});
  const read=async(file:string)=>JSON.parse(await readFile(join(dir,file),'utf8'));
  const first=await read(a.file),second=await read(b.file),changed=await read(c.file);
  assert.notEqual(a.id,b.id);assert.equal(first.configuration_sha256,second.configuration_sha256);assert.notEqual(first.configuration_sha256,changed.configuration_sha256);
  assert.doesNotMatch(JSON.stringify(first),/PRIVATE PROMPT|Synthetic task/);
  await a.finish(true);assert.equal((await verifyCampaign(join(dir,a.file))).status,'cancelled');
  assert.equal((await readdir(dir)).filter(f=>f.endsWith('.tmp')).length,0);
  await assert.rejects(()=>startCampaign(dir,{...settings,seed:-1}),/bounds/);
});
test('supervised manifests bind exact reports and expose stopped coverage',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'crashlab-manifest-run-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const summary=await evaluateClaude({command:new URL('./fixtures/claude-client.mjs',import.meta.url).pathname,model:'success',scenario:'clean-control',seed:42,repetitions:1,timeoutMs:5000,maxTurns:10,out:dir,db:join(dir,'runs.sqlite')});
  const path=join(dir,summary.manifest);const manifest=JSON.parse(await readFile(path,'utf8'));
  assert.equal(manifest.status,'completed');assert.equal((await verifyCampaign(path)).recorded,1);
  const original=JSON.stringify(manifest);
  manifest.reports[0].observed_model='forged-model';await writeFile(path,JSON.stringify(manifest));await assert.rejects(()=>verifyCampaign(path),/outcome mismatch/);
  await writeFile(path,original);manifest.reports[0].observed_model='deterministic-fixture';
  const missing=JSON.parse(original);missing.planned.push({...missing.planned[0],seed:43});await writeFile(path,JSON.stringify(missing));await assert.rejects(()=>verifyCampaign(path),/missing planned/);await writeFile(path,original);
  const reportFile=join(dir,manifest.reports[0].file);const report=JSON.parse(await readFile(reportFile,'utf8'));assert.equal(report.campaign_id,summary.campaign_id);
  await writeFile(reportFile,JSON.stringify({...report,seed:43}));await assert.rejects(()=>verifyCampaign(path),/digest differs/);
  manifest.reports[0].file='../private.json';await writeFile(path,JSON.stringify(manifest));await assert.rejects(()=>verifyCampaign(path),/filename/);
  const failed=await evaluateClaude({command:'/missing/claude',scenario:'all',seed:42,repetitions:1,timeoutMs:500,maxTurns:10,out:dir,db:join(dir,'runs.sqlite')});
  const checked=await verifyCampaign(join(dir,failed.manifest));assert.equal(checked.status,'stopped');assert.equal(checked.recorded,1);assert.equal(checked.missing,10);
});
