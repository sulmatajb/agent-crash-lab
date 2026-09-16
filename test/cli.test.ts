import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cli=fileURLToPath(new URL('../dist/cli.js',import.meta.url));
test('CLI outputs machine-readable multi-seed results and meaningful exit codes',()=>{
  const good=spawnSync(process.execPath,[cli,'test','--agent','careful','--runs','3','--json'],{encoding:'utf8'});assert.equal(good.status,0,good.stderr);assert.equal(JSON.parse(good.stdout).summary.passed,33);
  const bad=spawnSync(process.execPath,[cli,'test','--agent','reckless','--scenario','payment-timeout','--json'],{encoding:'utf8'});assert.equal(bad.status,1);assert.equal(JSON.parse(bad.stdout).summary.failed,1);
  const invalid=spawnSync(process.execPath,[cli,'test','--seed','NaN'],{encoding:'utf8'});assert.equal(invalid.status,2);
});
