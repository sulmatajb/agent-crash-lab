import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startCampaign, verifyCampaign } from '../src/campaign.js';
import { evaluateClaude } from '../src/claude.js';
import { createHash } from 'node:crypto';
import { newRun } from '../src/engine.js';
const settings={adapter:'claude-code' as const,scenarios:['clean-control' as const],seed:42,repetitions:1,timeoutMs:5000,maxTurns:10,task:'Synthetic task',systemPrompt:'PRIVATE PROMPT'};

test('campaign writer rejects empty plans, duplicates and reports outside its plan',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'crashlab-plan-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  await assert.rejects(()=>startCampaign(dir,{...settings,scenarios:[]}),/nonempty and unique/);
  await assert.rejects(()=>startCampaign(dir,{...settings,scenarios:['clean-control','clean-control']}),/nonempty and unique/);
  assert.deepEqual(await readdir(dir),[]);
  const campaign=await startCampaign(dir,settings);
  const report=newRun('clean-control',42,'test');
  await assert.rejects(()=>campaign.record(report),/does not belong/);
  report.campaign_id=campaign.id;report.seed=43;
  await assert.rejects(()=>campaign.record(report),/does not belong/);
  report.seed=42;await campaign.record(report);
  const duplicate={...newRun('clean-control',42,'test'),campaign_id:campaign.id};
  await assert.rejects(()=>campaign.record(duplicate),/case already recorded/);
  const manifest=JSON.parse(await readFile(join(dir,campaign.file),'utf8'));assert.equal(manifest.reports.length,1);
  await campaign.finish(true);
  await assert.rejects(()=>campaign.record(duplicate),/already finished/);
});

test('matching fingerprints do not make malformed campaign configuration valid',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'crashlab-config-schema-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const campaign=await startCampaign(dir,settings),path=join(dir,campaign.file);
  const original=JSON.parse(await readFile(path,'utf8'));
  for(const configuration of [null,{}, {...original.configuration,max_turns:0}, {...original.configuration,adapter:'unknown'}, {...original.configuration,tool_names:['policy_get','policy_get']}]){
    const altered={...original,configuration,configuration_sha256:createHash('sha256').update(JSON.stringify(configuration)).digest('hex')};
    await writeFile(path,JSON.stringify(altered));
    await assert.rejects(()=>verifyCampaign(path),/Invalid campaign configuration/);
  }
});

test('partial campaigns reject historically impossible planned fixtures before any report exists',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'crashlab-plan-version-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const campaign=await startCampaign(dir,settings),path=join(dir,campaign.file);
  const manifest=JSON.parse(await readFile(path,'utf8'));
  for(const scenario of ['outage-control','receipt-pretext']){
    manifest.planned=[{scenario,scenario_version:'1.1.0',seed:42}];await writeFile(path,JSON.stringify(manifest));
    await assert.rejects(()=>verifyCampaign(path),/requires scenario version|did not exist/);
  }
});

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
