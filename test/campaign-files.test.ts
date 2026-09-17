import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { startCampaign, verifyCampaign } from '../src/campaign.js';
import { newRun, finishRun } from '../src/engine.js';

const settings = {adapter:'claude-code' as const, scenarios:['clean-control' as const], seed:42, repetitions:1, timeoutMs:5000, maxTurns:10, task:'Synthetic task'};
const hash = (raw:string) => createHash('sha256').update(raw).digest('hex');
async function fixture(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'crashlab-campaign-files-'));
  t.after(() => rm(dir, {recursive:true, force:true}));
  return dir;
}

test('campaign parse errors never echo private content from manifest or report', async t => {
  const dir = await fixture(t), campaign = await startCampaign(dir, settings), path = join(dir, campaign.file);
  const report = newRun('clean-control',42,'test'); report.campaign_id = campaign.id;
  await campaign.record(report);
  const manifest = JSON.parse(await readFile(path,'utf8'));
  const raw = '{"credential":"DO-NOT-PRINT-THIS",';
  manifest.reports[0].sha256 = hash(raw);
  await writeFile(join(dir,manifest.reports[0].file),raw);
  await writeFile(path,JSON.stringify(manifest));
  await assert.rejects(() => verifyCampaign(path), {message:'Campaign evidence is not valid JSON.'});
  await writeFile(path,raw);
  await assert.rejects(() => verifyCampaign(path), {message:'Campaign evidence is not valid JSON.'});
});

test('campaign verification bounds all evidence, not just each file', async t => {
  const dir = await fixture(t), campaign = await startCampaign(dir, {...settings,repetitions:7});
  for (let i=0;i<7;i++) {
    const report = newRun('clean-control',42+i,'test'); report.campaign_id = campaign.id;
    report.execution = {adapter:'claude-code',status:'completed'}; finishRun(report);
    await campaign.record(report);
    await writeFile(join(dir,`${report.id}.json`),JSON.stringify(report,null,2));
  }
  await campaign.finish(false);
  const path = join(dir,campaign.file), manifest = JSON.parse(await readFile(path,'utf8'));
  assert.equal((await verifyCampaign(path)).recorded,7);
  for (const entry of manifest.reports) {
    const file = join(dir,entry.file);
    const raw = (await readFile(file,'utf8')).padEnd(10*1024*1024,' ');
    entry.sha256 = hash(raw); await writeFile(file,raw);
  }
  await writeFile(path,JSON.stringify(manifest));
  await assert.rejects(() => verifyCampaign(path), /64 MiB aggregate/);
});

test('campaign verifier rejects oversized files and symlinked reports', {skip:process.platform==='win32'}, async t => {
  const dir = await fixture(t), campaign = await startCampaign(dir,settings), path = join(dir,campaign.file);
  const report = newRun('clean-control',42,'test');report.campaign_id = campaign.id;await campaign.record(report);
  const reportPath = join(dir,`${report.id}.json`), target = join(dir,'target.json');
  await writeFile(target,JSON.stringify(report,null,2));await symlink(target,reportPath);
  await assert.rejects(() => verifyCampaign(path), /ELOOP|symbolic link/);
  await rm(reportPath);await writeFile(reportPath,' '.repeat(10*1024*1024+1));
  await assert.rejects(() => verifyCampaign(path), /10 MiB/);
});

test('CLI campaign verifier rejects a named pipe without waiting for a writer', {skip:process.platform==='win32'}, async t => {
  const dir = await fixture(t), path = join(dir,'pipe.manifest.json');
  assert.equal(spawnSync('mkfifo',[path]).status,0);
  const result = spawnSync(process.execPath,[new URL('../dist/cli.js',import.meta.url).pathname,'verify-campaign',path],{encoding:'utf8',timeout:3000});
  assert.equal(result.error,undefined);assert.equal(result.status,2);assert.match(result.stderr,/regular evidence file/);
});
