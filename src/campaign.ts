import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { evaluate, newRun, toolDefinitions, type Run } from './engine.js';
import type { ScenarioId } from './scenarios.js';

const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
type Settings={adapter:'claude-code'|'hermes'|'hermes-probe';scenarios:ScenarioId[];seed:number;repetitions:number;timeoutMs:number;maxTurns:number;model?:string;provider?:string;systemPrompt?:string;task:string};
export async function startCampaign(out:string,settings:Settings) {
  if(!Number.isSafeInteger(settings.seed)||settings.seed<0||!Number.isInteger(settings.repetitions)||settings.repetitions<1||settings.repetitions>100||settings.seed+settings.repetitions-1>2147483647||!Number.isInteger(settings.maxTurns)||settings.maxTurns<1||settings.maxTurns>100||!Number.isInteger(settings.timeoutMs)||settings.timeoutMs<1||settings.timeoutMs>900000)throw new Error('Invalid campaign bounds.');
  const id=randomUUID(),file=`${id}.manifest.json`;
  const labVersion=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version as string;
  const planned=settings.scenarios.flatMap(scenario=>Array.from({length:settings.repetitions},(_,i)=>({scenario,scenario_version:newRun(scenario,settings.seed+i,settings.adapter).scenario_version,seed:settings.seed+i})));
  const configuration={adapter:settings.adapter,lab_version:labVersion,requested_model:settings.model??null,requested_provider:settings.provider??null,timeout_ms:settings.timeoutMs,max_turns:settings.maxTurns,task_sha256:hash(settings.task),system_prompt_sha256:hash(settings.systemPrompt??''),tool_names:[...Object.keys(toolDefinitions),'lab_finish'].sort()};
  const reports:{id:string;file:string;sha256:string;scenario:ScenarioId;scenario_version:string;seed:number;verdict:string;execution:string;observed_model?:string;runtime_version?:string}[]=[];
  const manifest={manifest_version:'1.0.0',campaign_id:id,created_at:new Date().toISOString(),finished_at:undefined as string|undefined,status:'running',configuration,configuration_sha256:hash(JSON.stringify(configuration)),planned,reports,limitation:'Configuration records requested settings and prompt hashes, not raw prompts, credentials or inherited client defaults. Runtime/model labels are client-reported. File hashes detect changes relative to this manifest; they do not authenticate its author. A running manifest left behind may indicate interruption.'};
  const save=async()=>{await writeFile(join(out,`${file}.tmp`),JSON.stringify(manifest,null,2),{mode:0o600});await rename(join(out,`${file}.tmp`),join(out,file));};
  await save();
  return {id,file,async record(report:Run){
    if(reports.some(r=>r.id===report.id))throw new Error('Report already recorded in campaign.');
    reports.push({id:report.id,file:`${report.id}.json`,sha256:hash(JSON.stringify(report,null,2)),scenario:report.scenario,scenario_version:report.scenario_version,seed:report.seed,verdict:evaluate(report).verdict,execution:report.execution?.status??'unsupervised',observed_model:report.execution?.model,runtime_version:report.execution?.runtime_version});
    await save();
  },async finish(cancelled:boolean){manifest.status=cancelled?'cancelled':reports.some(r=>r.execution!=='completed')||reports.length!==planned.length?'stopped':'completed';manifest.finished_at=new Date().toISOString();await save();}};
}

export async function verifyCampaign(path:string) {
  const {dirname}=await import('node:path');
  const {lstat}=await import('node:fs/promises');
  const {verifyReport}=await import('./replay.js');
  const boundedRead=async(file:string)=>{const stat=await lstat(file);if(!stat.isFile()||stat.size>10*1024*1024)throw new Error('Expected a regular file of at most 10 MiB.');return readFile(file,'utf8');};
  const manifest=JSON.parse(await boundedRead(path));
  if(manifest?.manifest_version!=='1.0.0'||typeof manifest.campaign_id!=='string'||!['running','completed','stopped','cancelled'].includes(manifest.status)||!Array.isArray(manifest.planned)||!Array.isArray(manifest.reports)||manifest.reports.length>1100||!manifest.planned.length||manifest.planned.length>1100)throw new Error('Invalid campaign manifest.');
  if(hash(JSON.stringify(manifest.configuration))!==manifest.configuration_sha256)throw new Error('Configuration fingerprint differs from manifest.');
  const caseKey=(r:{scenario:string;scenario_version:string;seed:number})=>`${r.scenario}@${r.scenario_version}:${r.seed}`;
  for(const entry of manifest.planned){if(!entry||!['1.1.0','1.2.0','1.2.1','1.2.2'].includes(entry.scenario_version))throw new Error('Invalid planned scenario version.');newRun(entry.scenario,entry.seed,'manifest-validation');}
  const planned=new Set<string>(manifest.planned.map(caseKey));
  if(planned.size!==manifest.planned.length)throw new Error('Duplicate planned campaign case.');
  const seen=new Set<string>();
  for(const entry of manifest.reports){
    if(!entry||typeof entry.file!=='string'||!/^[a-f0-9-]{36}\.json$/.test(entry.file)||entry.file!==`${entry.id}.json`)throw new Error('Invalid campaign report filename.');
    const raw=await boundedRead(join(dirname(path),entry.file));
    if(hash(raw)!==entry.sha256)throw new Error(`Report digest differs: ${entry.id}`);
    const report=JSON.parse(raw);
    if(report.id!==entry.id||report.campaign_id!==manifest.campaign_id||caseKey(report)!==caseKey(entry)||!planned.has(caseKey(report))||seen.has(caseKey(report)))throw new Error('Campaign report identity or coverage mismatch.');
    if(!Array.isArray(report.events)||report.events.length>10000)throw new Error('Invalid report event count.');
    const verified=verifyReport(report);
    if(entry.observed_model!==report.execution?.model||entry.runtime_version!==report.execution?.runtime_version||verified.verdict!==entry.verdict||(report.execution?.status??'unsupervised')!==entry.execution)throw new Error('Campaign report outcome mismatch.');
    if(manifest.status==='completed'&&(report.status!=='completed'||report.execution?.status!=='completed'))throw new Error('Completed campaign contains an unfinished execution.');
    seen.add(caseKey(report));
  }
  if(manifest.status==='completed'&&seen.size!==planned.size)throw new Error('Completed campaign is missing planned reports.');
  return {verified:true,campaign_id:manifest.campaign_id,status:manifest.status,planned:planned.size,recorded:seen.size,missing:planned.size-seen.size,limitation:'Checks file digests, report replay and recorded coverage; does not authenticate the manifest or establish agent safety.'};
}
