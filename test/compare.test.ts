import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compareReports, loadReports } from '../src/compare.js';
import { newRun, finishRun, evaluate } from '../src/engine.js';
import { runScripted } from '../src/agents.js';
const run = (agent:'careful'|'reckless',seed=42) => runScripted(newRun('payment-timeout',seed,agent),agent);

test('paired comparison detects duplicate-payment regressions and preserves both verdicts',()=>{
  const result=compareReports([run('careful')],[run('reckless')]);
  assert.equal(result.exit_code,1);assert.equal(result.regressions,1);
  assert.equal(result.cases[0].baseline.verdict,'passed');assert.equal(result.cases[0].candidate.verdict,'failed');
  assert.ok(result.cases[0].observed_new_violations.length);
  assert.equal(compareReports([run('reckless')],[run('careful')]).exit_code,0);
  const unchanged=compareReports([run('reckless')],[run('reckless')]);
  assert.equal(unchanged.exit_code,0);assert.equal(unchanged.cases[0].candidate.verdict,'failed');
});
test('abstention is a work-completion regression and execution failures are inconclusive',()=>{
  const incomplete=newRun('payment-timeout',42,'refusing-agent');finishRun(incomplete);
  assert.equal(compareReports([run('careful')],[incomplete]).regressions,1);
  const broken=run('reckless');broken.execution={adapter:'test',status:'timeout'};
  const result=compareReports([run('careful')],[broken]);
  assert.equal(result.exit_code,2);assert.equal(result.inconclusive,1);assert.ok(result.cases[0].observed_new_violations.length);
  assert.equal(compareReports([newRun('payment-timeout',42,'still-running')],[run('careful')]).inconclusive,1);
});
test('comparison refuses unmatched seeds, duplicate cases, edited outcomes and invalid reports',()=>{
  assert.throws(()=>compareReports([run('careful',42)],[run('careful',43)]),/coverage differs/);
  assert.throws(()=>compareReports([run('careful'),run('careful')],[run('careful')]),/duplicate case/);
  const edited=run('careful');edited.payments[0].amount_cents++;
  assert.throws(()=>compareReports([run('careful')],[edited]),/replayed evidence/);
  assert.throws(()=>compareReports([null as any],[run('careful')]),/invalid report structure/);
  const evaluation={...run('careful'),evaluation:{verdict:'passed'}};
  assert.throws(()=>compareReports([evaluation],[run('careful')]),/Evaluation differs/);
});
test('campaign reader excludes runner summaries and traces; CLI has regression and invalid-input exit codes',t=>{
  const dir=mkdtempSync(join(tmpdir(),'crashlab-compare-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const before=run('careful'),after=run('reckless');
  writeFileSync(join(dir,'summary.json'),JSON.stringify({total:1}));
  writeFileSync(join(dir,'sample.trace.json'),'{}');
  writeFileSync(join(dir,'sample.manifest.json'),JSON.stringify({manifest_version:'1.0.0'}));
  writeFileSync(join(dir,'before.json'),JSON.stringify({...before,evaluation:evaluate(before)}));
  assert.equal(loadReports(dir).length,1);
  const afterPath=join(dir,'after.json');writeFileSync(afterPath,JSON.stringify({runs:[after]}));
  const cli=fileURLToPath(new URL('../dist/cli.js',import.meta.url));
  const invoke=(candidate:string)=>spawnSync(process.execPath,[cli,'compare',join(dir,'before.json'),candidate,'--json'],{encoding:'utf8'});
  const result=invoke(afterPath);assert.equal(result.status,1,result.stderr);assert.equal(JSON.parse(result.stdout).regressions,1);
  assert.equal(invoke(join(dir,'before.json')).status,0);
  writeFileSync(afterPath,'null');assert.equal(invoke(afterPath).status,2);
});
