import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cli=fileURLToPath(new URL('../dist/cli.js',import.meta.url));

test('unsupported command options fail without running tools or creating artifacts', t => {
  const dir=mkdtempSync(join(tmpdir(),'crashlab-options-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const cases=[
    ['test','--model','private-model-setting'],
    ['test','--system-prompt','private-prompt-path'],
    ['evaluate-claude','--agent','careful'],
    ['evaluate','--claude-command','private-executable'],
    ['probe','--claude-command','private-executable'],
    ['start','--scenario','payment-timeout'],
    ['demo','--runs','10'],
    ['doctor','--system-prompt','private-prompt-path'],
    ['mcp','--db','private-database'],
    ['scenarios','--json'],
    ['stress','--model','private-model-setting'],
    ['compare','before','after','--scenario','payment-timeout'],
    ['verify','missing.json','--seed','9'],
    ['verify-campaign','missing.json','--runs','2'],
  ];
  for(const args of cases) {
    const result=spawnSync(process.execPath,[cli,...args],{cwd:dir,encoding:'utf8',timeout:3000});
    assert.equal(result.error,undefined,args.join(' '));assert.equal(result.status,2,args.join(' '));
    assert.match(result.stderr,/is not supported by/);assert.doesNotMatch(result.stderr,/private-/);
    assert.equal(result.stdout,'');assert.deepEqual(readdirSync(dir),[]);
  }
});

test('default options are not mistaken for explicitly supplied incompatible flags', () => {
  const result=spawnSync(process.execPath,[cli,'test','--scenario=clean-control','--seed=9','--json'],{encoding:'utf8',timeout:3000});
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).runs[0].seed,9);
  const help=spawnSync(process.execPath,[cli,'evaluate','--help'],{encoding:'utf8',timeout:3000});
  assert.equal(help.status,0);assert.match(help.stdout,/Live-agent commands/);
});
