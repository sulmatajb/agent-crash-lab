import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { claudeReadiness, summarizeHermes, probeCommand, type Probe } from '../src/doctor.js';

test('Claude readiness uses only version and auth status, omitting private fields',async()=>{
  const calls:string[][]=[];
  const probe:Probe=async(_,args)=>{calls.push(args);return {ok:true,stdout:args[0]==='--version'?'2.1.261 (Claude Code)':JSON.stringify({loggedIn:true,email:'private@example.test',apiKey:'secret-value',orgId:'private-org'})};};
  const checks=await claudeReadiness('claude',probe);
  assert.deepEqual(calls,[['--version'],['auth','status','--json']]);
  assert.ok(checks.every(c=>c.status==='pass'));
  assert.doesNotMatch(JSON.stringify(checks),/private|secret-value|apiKey/);
});
test('readiness distinguishes missing client, signed-out session and unverified authentication',async()=>{
  assert.equal((await claudeReadiness('missing',async()=>({ok:false,stdout:'secret',error:'not-found'})))[0].status,'fail');
  for(const [payload,ok,status] of [['{"loggedIn":false}',false,'fail'],['not-json secret',true,'warn'],['{"loggedIn":true}',false,'warn'],['{}',true,'warn']] as const){
    const checks=await claudeReadiness('claude',async(_,args)=>args[0]==='--version'?{ok:true,stdout:'2.1.261 (Claude Code)'}:{ok,stdout:payload});
    assert.equal(checks.at(-1)!.status,status);assert.doesNotMatch(JSON.stringify(checks),/secret/);
  }
});
test('Hermes readiness does not equate a configured key with verified access',()=>{
  const checks=summarizeHermes({mcp_available:true,credential_configured:true,model:'private-model',provider:'private-provider',source_profile:'/private/profile'});
  assert.equal(checks.at(-1)!.status,'warn');assert.doesNotMatch(JSON.stringify(checks),/private/);
  assert.equal(summarizeHermes({mcp_available:false,credential_configured:false})[1].status,'fail');
});
test('diagnostic subprocess bounds hangs and output; CLI validates targets without inference',async()=>{
  const timed=await probeCommand(process.execPath,['-e','setInterval(()=>{},1000)'],50);assert.equal(timed.ok,false);
  const large=await probeCommand(process.execPath,['-e','console.log("x".repeat(100000))']);assert.equal(large.ok,false);
  const cli=fileURLToPath(new URL('../dist/cli.js',import.meta.url));
  const invalid=spawnSync(process.execPath,[cli,'doctor','--client','other'],{encoding:'utf8'});assert.equal(invalid.status,2);assert.match(invalid.stderr,/--client must/);
  const missing=spawnSync(process.execPath,[cli,'doctor','--client','claude','--claude-command','/missing/claude'],{encoding:'utf8'});assert.equal(missing.status,2);assert.equal(JSON.parse(missing.stdout).status,'blocked');
});
