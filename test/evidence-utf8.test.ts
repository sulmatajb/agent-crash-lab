import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { newRun } from '../src/engine.js';
import { runScripted } from '../src/agents.js';
import { readEvidenceJson } from '../src/evidence-file.js';
import { loadReports, compareReports } from '../src/compare.js';
import { startCampaign, verifyCampaign } from '../src/campaign.js';
import { verifyReport } from '../src/replay.js';

const malformed = [
  ['lone continuation', [0x80]],
  ['overlong sequence', [0xc0, 0xaf]],
  ['truncated sequence', [0xe2, 0x82]],
  ['surrogate encoding', [0xed, 0xa0, 0x80]],
  ['out of Unicode range', [0xf4, 0x90, 0x80, 0x80]],
  ['illegal leading byte', [0xff]],
] as const;
const sample = (agent='synthetic-\ufffd') => runScripted(newRun('clean-control',42,agent),'careful');
const replaceMarker = (raw:string, bytes:readonly number[]) => {
  const marker=raw.indexOf('\ufffd');assert.ok(marker>=0);
  return Buffer.concat([Buffer.from(raw.slice(0,marker)),Buffer.from(bytes),Buffer.from(raw.slice(marker+1))]);
};
const cli = (...args:string[]) => spawnSync(process.execPath,[fileURLToPath(new URL('../dist/cli.js',import.meta.url)),...args],{encoding:'utf8',timeout:10000});

for(const [name,bytes] of malformed) {
  test(`saved report readers reject ${name} without replacing or echoing evidence`, async t => {
    const dir=mkdtempSync(join(tmpdir(),'crashlab-utf8-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
    const report=sample(),raw=JSON.stringify(report),path=join(dir,'report.json');
    writeFileSync(path,replaceMarker(raw,bytes));
    assert.throws(()=>readEvidenceJson(path),{message:'Evidence is not valid UTF-8.'});
    assert.throws(()=>loadReports(path),{message:'Report is not valid UTF-8.'});
    assert.throws(()=>loadReports(dir),{message:'Report is not valid UTF-8.'});
    writeFileSync(path,replaceMarker(JSON.stringify({runs:[report]}),bytes));
    assert.throws(()=>loadReports(path),{message:'Report is not valid UTF-8.'});
  });
}

for(const agent of ['Café 日本語 😀','literal \ufffd replacement','e\u0301 / \u2028 / \u2029']) {
  test(`valid Unicode survives stored evidence readers: ${agent}`, t => {
    const dir=mkdtempSync(join(tmpdir(),'crashlab-valid-utf8-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
    const report=sample(agent),path=join(dir,'report.json');writeFileSync(path,JSON.stringify(report));
    assert.deepEqual(readEvidenceJson(path),report);assert.equal(verifyReport(readEvidenceJson(path)).verified,true);
    assert.deepEqual(loadReports(path),[report]);assert.equal(compareReports(loadReports(path),loadReports(path)).cases[0].candidate.agent,agent);
    writeFileSync(path,JSON.stringify({runs:[report]}));assert.deepEqual(loadReports(dir),[report]);
  });
}

test('multibyte character across a read chunk boundary is valid', t => {
  const dir=mkdtempSync(join(tmpdir(),'crashlab-utf8-boundary-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const path=join(dir,'report.json'),report=sample('é-😀');const raw=JSON.stringify(report);const start=Buffer.byteLength(raw.slice(0,raw.indexOf('é')));
  writeFileSync(path,' '.repeat(65535-start)+raw);
  assert.deepEqual(readEvidenceJson(path),report);assert.deepEqual(loadReports(path),[report]);
});

test('BOM and malformed JSON retain JSON rejection rather than encoding normalization', t => {
  const dir=mkdtempSync(join(tmpdir(),'crashlab-utf8-json-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const path=join(dir,'report.json');
  for(const raw of ['\ufeff'+JSON.stringify(sample()),'{"private":"synthetic-secret",']) {
    writeFileSync(path,raw);assert.throws(()=>readEvidenceJson(path),{message:'Evidence is not valid JSON.'});assert.throws(()=>loadReports(path),{message:'Report is not valid JSON.'});
  }
});

for(const [name,bytes] of malformed) {
  test(`campaign verifier rejects ${name} in both report and manifest`, async t => {
    const dir=mkdtempSync(join(tmpdir(),'crashlab-campaign-utf8-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
    const campaign=await startCampaign(dir,{adapter:'claude-code',scenarios:['clean-control'],seed:42,repetitions:1,timeoutMs:5000,maxTurns:10,task:'synthetic'});
    const report=sample();report.campaign_id=campaign.id;report.execution={adapter:'claude-code',status:'completed'};
    const path=join(dir,`${report.id}.json`),raw=JSON.stringify(report,null,2),manifest=join(dir,campaign.file);
    writeFileSync(path,raw);await campaign.record(report);await campaign.finish(false);assert.equal((await verifyCampaign(manifest)).verified,true);
    // The recorded digest belongs to the original valid U+FFFD bytes. A lossy
    // decoder would recreate exactly that text from a lone continuation byte.
    writeFileSync(path,replaceMarker(raw,bytes));await assert.rejects(verifyCampaign(manifest),{message:'Campaign evidence is not valid UTF-8.'});
    writeFileSync(path,raw);const manifestData=JSON.parse(readFileSync(manifest,'utf8'));manifestData.note='synthetic-\ufffd';
    const manifestRaw=JSON.stringify(manifestData);writeFileSync(manifest,manifestRaw);assert.equal((await verifyCampaign(manifest)).verified,true);
    writeFileSync(manifest,replaceMarker(manifestRaw,bytes));await assert.rejects(verifyCampaign(manifest),{message:'Campaign evidence is not valid UTF-8.'});
  });
}

test('campaign verifier preserves BOM and malformed JSON rejection', async t => {
  const dir=mkdtempSync(join(tmpdir(),'crashlab-campaign-json-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const path=join(dir,'campaign.manifest.json');
  for(const raw of ['\ufeff{}','{"private":"synthetic-secret",']) {writeFileSync(path,raw);await assert.rejects(verifyCampaign(path),{message:'Campaign evidence is not valid JSON.'});}
});

test('CLI verify and compare reject bad bytes before output, preserving source and existing output', t => {
  const dir=mkdtempSync(join(tmpdir(),'crashlab-cli-utf8-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const path=join(dir,'report.json'),raw=replaceMarker(JSON.stringify(sample()),[0x80]),output=join(dir,'comparison.json');
  writeFileSync(path,raw);
  for(const args of [['verify',path],['compare',path,path,'--json','--out',output]]) {
    const result=cli(...args);assert.equal(result.status,2);assert.equal(result.stdout,'');assert.match(result.stderr,/not valid UTF-8/);assert.doesNotMatch(result.stderr,/synthetic/);assert.deepEqual(readFileSync(path),raw);
  }
  assert.equal(existsSync(output),false);writeFileSync(output,'preserve this result');
  assert.equal(cli('compare',path,path,'--out',output).status,2);assert.equal(readFileSync(output,'utf8'),'preserve this result');
  writeFileSync(path,JSON.stringify(sample()));assert.equal(cli('verify',path).status,0);assert.equal(cli('compare',path,path,'--json').status,0);
});

test('CLI verify-campaign and directory comparison reject corrupt bytes with matching decoded digest', async t => {
  const dir=mkdtempSync(join(tmpdir(),'crashlab-cli-campaign-utf8-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const campaign=await startCampaign(dir,{adapter:'claude-code',scenarios:['clean-control'],seed:42,repetitions:1,timeoutMs:5000,maxTurns:10,task:'synthetic'});
  const report=sample();report.campaign_id=campaign.id;report.execution={adapter:'claude-code',status:'completed'};
  const path=join(dir,`${report.id}.json`),raw=JSON.stringify(report,null,2),manifest=join(dir,campaign.file);
  writeFileSync(path,raw);await campaign.record(report);await campaign.finish(false);
  assert.equal(cli('verify-campaign',manifest).status,0);assert.equal(cli('compare',dir,dir).status,0);
  writeFileSync(path,replaceMarker(raw,[0x80]));
  for(const args of [['verify-campaign',manifest],['compare',dir,dir,'--json']]) {const result=cli(...args);assert.equal(result.status,2);assert.equal(result.stdout,'');assert.match(result.stderr,/not valid UTF-8/);assert.doesNotMatch(result.stderr,/synthetic/);}
});
