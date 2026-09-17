import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {RunStore} from '../dist/store.js';
import {newRun} from '../dist/engine.js';
const count=Number(process.argv[2]??10000);
if(!Number.isInteger(count)||count<100||count>100000)throw new Error('Run count must be 100–100000.');
const dir=mkdtempSync(join(tmpdir(),'crashlab-search-benchmark-'));
const store=new RunStore(join(dir,'runs.sqlite'));
try {
  for(let i=0;i<count;i++)store.save(newRun(i%2?'clean-control':'payment-timeout',i,i===0?'needle-oldest':'external'));
  const timings=[];
  for(let i=0;i<100;i++){
    const start=performance.now();const page=store.page(50,undefined,i%2?'needle-oldest':'payment');
    if(i%2&&page.matched_total!==1)throw new Error('Oldest run missing from search.');
    timings.push(performance.now()-start);
  }
  timings.sort((a,b)=>a-b);
  console.log(JSON.stringify({kind:'local-synthetic-search-benchmark',node:process.versions.node,platform:process.platform,runs:count,queries:100,p50_ms:timings[49],p95_ms:timings[94],p99_ms:timings[98],limitation:'In-process SQLite query timings on synthetic local data, not HTTP latency, concurrent load or production scale.'},null,2));
}finally{store.close();rmSync(dir,{recursive:true,force:true});}
