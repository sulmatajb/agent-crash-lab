import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('documentation gate checks tracked local targets without following remote URLs',t=>{
  const dir=mkdtempSync(join(tmpdir(),'crashlab-docs-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  mkdirSync(join(dir,'scripts'));mkdirSync(join(dir,'docs'));
  copyFileSync(fileURLToPath(new URL('../scripts/check-docs.mjs',import.meta.url)),join(dir,'scripts/check-docs.mjs'));
  execFileSync('git',['init','--quiet'],{cwd:dir});
  writeFileSync(join(dir,'docs','valid file.md'),'# Valid\n');
  writeFileSync(join(dir,'README.md'),'[valid](docs/valid%20file.md#heading)\n[remote](https://example.invalid/no-fetch)\n```md\n[example](not-real.md)\n```\n');
  execFileSync('git',['add','.'],{cwd:dir});
  const run=()=>spawnSync(process.execPath,['scripts/check-docs.mjs'],{cwd:dir,encoding:'utf8'});
  assert.equal(run().status,0);
  writeFileSync(join(dir,'README.md'),'[bad](docs/missing.md)\n');const missing=run();assert.equal(missing.status,1);assert.match(missing.stderr,/docs\/missing.md/);
  writeFileSync(join(dir,'README.md'),'[outside](../private.md)\n');assert.equal(run().status,1);
});
