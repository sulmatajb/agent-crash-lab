import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { hermesDoctor } from './runner.js';

type Check = { id:string; status:'pass'|'fail'|'warn'; message:string; next_step?:string };
export type Probe = (command:string,args:string[]) => Promise<{ ok:boolean; stdout:string; error?:string }>;

/** Never forward arbitrary client stdout/stderr or launch errors to diagnostics. */
export function probeCommand(command:string,args:string[],timeoutMs=15000):ReturnType<Probe> {
  return new Promise(resolve=>{
    execFile(command,args,{encoding:'utf8',timeout:timeoutMs,killSignal:'SIGKILL',maxBuffer:65536,windowsHide:true},(error,stdout)=>{
      const code=(error as NodeJS.ErrnoException|null)?.code;
      resolve({ok:!error,stdout:typeof stdout==='string'?stdout:'',error:code==='ENOENT'?'not-found':error?'failed-or-timed-out':undefined});
    });
  });
}
export async function claudeReadiness(command='claude',probe:Probe=probeCommand):Promise<Check[]> {
  const version=await probe(command,['--version']);
  if(!version.ok)return [{id:'claude.installation',status:'fail',message:version.error==='not-found'?'Claude Code executable was not found.':'Claude Code version check failed or timed out.',next_step:'Install Claude Code or select its executable with --claude-command PATH.'}];
  const match=version.stdout.trim().match(/^(\d+\.\d+\.\d+)(?:[^\r\n]{0,80})?$/);
  const checks:Check[]=[{id:'claude.installation',status:match?'pass':'warn',message:match?`Claude Code version ${match[1]} is available.`:'Executable responded, but its version format was not recognized.'}];
  const auth=await probe(command,['auth','status','--json']);
  let loggedIn:unknown;
  try{loggedIn=JSON.parse(auth.stdout).loggedIn;}catch{}
  if(loggedIn===false)checks.push({id:'claude.authentication',status:'fail',message:'Claude Code reports that it is signed out.',next_step:'Run claude auth login with the selected client, then repeat this check.'});
  else if(auth.ok&&loggedIn===true)checks.push({id:'claude.authentication',status:'pass',message:'Claude Code reports an authenticated session. Provider access is not exercised.'});
  else checks.push({id:'claude.authentication',status:'warn',message:'Authentication status could not be verified without inference.',next_step:'Run the selected client’s auth status command directly. Check client compatibility, then run one bounded lab trial.'});
  return checks;
}
export function summarizeHermes(record:any):Check[] {
  const checks:Check[]=[{id:'hermes.installation',status:'pass',message:'Hermes runtime loaded successfully.'},
    {id:'hermes.mcp',status:record.mcp_available===true?'pass':'fail',message:record.mcp_available===true?'Hermes MCP dependency is available.':'Hermes MCP dependency is unavailable.',next_step:record.mcp_available===true?undefined:'Install the MCP dependencies in the selected Hermes Python environment, then run probe.'}];
  checks.push({id:'hermes.authentication',status:'warn',message:record.credential_configured===true?'A credential is configured; validity and selected-provider compatibility are not verified.':'No supported API-key credential was detected. A local provider may still work; OAuth-only profiles are not imported.',next_step:'Run probe for transport, then one bounded evaluate trial with your configured provider.'});
  return checks;
}
export async function readiness(options:{client:'claude'|'hermes'|'all';command?:string;python?:string;profile?:string}) {
  const checks:Check[]=[];
  const [major,minor]=process.versions.node.split('.').map(Number);
  checks.push({id:'node',status:major>22||major===22&&minor>=13?'pass':'fail',message:`Node ${process.versions.node}; requires 22.13 or newer.`});
  for(const asset of ['../dist/cli.js','../public/index.html','../adapters/hermes.py']){
    try{await access(fileURLToPath(new URL(asset,import.meta.url)));checks.push({id:`package.${asset.split('/').at(-1)}`,status:'pass',message:`Packaged ${asset.split('/').at(-1)} is available.`});}
    catch{checks.push({id:`package.${asset.split('/').at(-1)}`,status:'fail',message:`Required ${asset.split('/').at(-1)} is missing.`,next_step:'Build the source with npm run build or reinstall a complete release package.'});}
  }
  if(options.client!=='hermes')checks.push(...await claudeReadiness(options.command));
  if(options.client!=='claude'){
    try{checks.push(...summarizeHermes(await hermesDoctor(options.python,options.profile)));}
    catch{checks.push({id:'hermes.installation',status:'fail',message:'Hermes diagnostics could not load the selected environment.',next_step:'Check --hermes-python PATH and --hermes-profile DIR. Ensure Hermes and its dependencies are installed in that Python environment.'});}
  }
  const blocked=checks.some(c=>c.status==='fail'), uncertain=checks.some(c=>c.status==='warn');
  return {doctor_version:'1.0.0',client:options.client,status:blocked?'blocked':uncertain?'needs-verification':'ready-for-trial',exit_code:blocked?2:uncertain?1:0,checks,limitation:'No inference, model availability, MCP transport call, or agent behavior was tested. Authentication reports are local client claims. Account details, credentials, provider logs and raw client output are omitted.'};
}
