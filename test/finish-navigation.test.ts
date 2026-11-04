import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

// Run the same regressions against an unchanged checkout without editing it.
const root=process.env.CRASHLAB_TEST_ROOT ? pathToFileURL(resolve(process.env.CRASHLAB_TEST_ROOT)+'/') : new URL('../',import.meta.url);
const {createLabServer}=await import(new URL('src/server.ts',root).href);
const {RunStore}=await import(new URL('src/store.ts',root).href);
const {newRun}=await import(new URL('src/engine.ts',root).href);
const pause=()=>new Promise(resolve=>setTimeout(resolve,20));
async function until(predicate:()=>boolean) {
  const end=Date.now()+5000;
  while(!predicate()){if(Date.now()>end)throw new Error('Finish UI did not reach expected state');await pause();}
}
type Gate={path:string;failure:boolean;ready:boolean;used:boolean;returned:boolean;wait:Promise<void>;release:()=>void};
async function dashboard(t:TestContext) {
  const store=new RunStore(':memory:');
  const a=newRun('clean-control',111,'external'),b=newRun('payment-timeout',222,'external');store.save(a);store.save(b);
  const server=createLabServer(store);server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${(server.address() as any).port}`;
  const errors:Error[]=[];const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e));
  const gates:Gate[]=[];let poll:()=>Promise<void>;let active=0;let dom:JSDOM|undefined;
  t.after(async()=>{
    try {
      gates.forEach(g=>g.release());await until(()=>active===0);await pause();await until(()=>active===0);
    } finally {
      if(dom){dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();}
      server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));store.close();
    }
    assert.deepEqual(errors.map(e=>e.message),[]);
  });
  dom=await JSDOM.fromURL(`${origin}/#run=${a.id}`,{resources:'usable',runScripts:'dangerously',virtualConsole:console,beforeParse(window){
    window.setInterval=((callback:any)=>{poll=callback;return 1;}) as any;
    window.fetch=(async(url:any,options:any={})=>{
      active++;
      const gate=gates.find(g=>!g.used&&g.path===String(url));if(gate)gate.used=true;
      const controller=new AbortController();const abort=()=>controller.abort();
      if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
      try {
        // Real authenticated local requests and immutable response snapshots. A
        // failed response simulates losing the acknowledgment after server commit.
        const response=await fetch(new URL(url,origin),{...options,signal:controller.signal});
        const body=await response.text();
        if(gate){gate.ready=true;await gate.wait;}
        return gate?.failure ? new Response(JSON.stringify({error:'Synthetic finish outage'}),{status:503,headers:{'Content-Type':'application/json'}})
          : new Response(body,{status:response.status,headers:response.headers});
      } finally {
        active--;if(gate)gate.returned=true;options.signal?.removeEventListener('abort',abort);
      }
    }) as any;
  }});
  const doc=dom.window.document;
  const click=(selector:string)=>{const el=doc.querySelector(selector) as HTMLElement;assert.ok(el,selector);el.click();};
  const hold=(path:string,failure=false)=>{
    let release!:()=>void;const wait=new Promise<void>(r=>{release=r;});
    const gate={path,failure,ready:false,used:false,returned:false,wait,release};gates.push(gate);return gate;
  };
  const deliver=async(gate:Gate)=>{gate.release();await until(()=>gate.returned);await pause();};
  const output=()=>doc.querySelector('#run-output')!.textContent!;
  const hash=()=>dom!.window.location.hash;
  const navigate=(id:string)=>{dom!.window.location.hash=`run=${id}`;};
  const assertRun=(run:typeof a)=>{
    assert.equal(hash(),`#run=${run.id}`);
    assert.equal(doc.querySelector('.run-id')?.textContent,run.id.slice(0,8));
    assert.match(doc.querySelector('.result-summary > p')!.textContent!,new RegExp(`seed ${run.seed}$`));
    assert.equal((doc.querySelector('#seed-input') as HTMLInputElement).value,String(run.seed));
    assert.equal(doc.querySelector('.scenario-button.selected')?.getAttribute('data-scenario'),run.scenario);
  };
  await until(()=>doc.querySelector('.run-id')?.textContent===a.id.slice(0,8));await until(()=>active===0);
  return {doc,store,a,b,click,hold,deliver,output,hash,navigate,assertRun,poll:()=>poll()};
}

for(const order of ['finish-first','open-first'] as const){
  test(`newer run navigation survives an old finish response (${order})`,async t=>{
    const ui=await dashboard(t);const finish=ui.hold(`/api/runs/${ui.a.id}/finish`);
    ui.click('#finish-run');await until(()=>finish.ready);
    const open=ui.hold(`/api/runs/${ui.b.id}`);ui.navigate(ui.b.id);await until(()=>open.ready);
    await ui.deliver(order==='finish-first'?finish:open);await ui.deliver(order==='finish-first'?open:finish);
    ui.assertRun(ui.b);assert.ok(ui.doc.querySelector('#finish-run'));
    assert.equal(ui.store.get(ui.a.id)!.status,'completed');assert.equal(ui.store.get(ui.b.id)!.status,'running');
  });
  test(`reopening the same run preserves its newer snapshot (${order})`,async t=>{
    const ui=await dashboard(t);const finish=ui.hold(`/api/runs/${ui.a.id}/finish`);
    ui.click('#finish-run');await until(()=>finish.ready);
    ui.store.mutate(ui.a.id,(run:any)=>{run.execution={adapter:'claude-code',status:'completed',model:'newer-snapshot'};});
    const open=ui.hold(`/api/runs/${ui.a.id}`);ui.click(`[data-run="${ui.a.id}"]`);await until(()=>open.ready);
    await ui.deliver(order==='finish-first'?finish:open);await ui.deliver(order==='finish-first'?open:finish);
    ui.assertRun(ui.a);assert.match(ui.output(),/newer-snapshot/);assert.equal(ui.doc.querySelector('#finish-run'),null);
  });
}

test('selecting a scenario during finish keeps the new scenario empty',async t=>{
  const ui=await dashboard(t);const finish=ui.hold(`/api/runs/${ui.a.id}/finish`);
  ui.click('#finish-run');await until(()=>finish.ready);ui.click('[data-scenario="payment-timeout"]');await ui.deliver(finish);
  assert.equal(ui.hash(),'');assert.equal(ui.doc.querySelector('.result-title'),null);
  assert.equal(ui.doc.querySelector('.scenario-button.selected')?.getAttribute('data-scenario'),'payment-timeout');
  assert.equal(ui.store.get(ui.a.id)!.status,'completed');
});

test('a new reference run can finish loading after the old finish response',async t=>{
  const ui=await dashboard(t);const finish=ui.hold(`/api/runs/${ui.a.id}/finish`);
  ui.click('#finish-run');await until(()=>finish.ready);ui.click('[data-scenario="clean-control"]');
  const create=ui.hold('/api/runs');ui.click('#run-button');await until(()=>create.ready);
  await ui.deliver(finish);await ui.deliver(create);
  const run=ui.store.list().find((r:any)=>r.id!==ui.a.id&&r.id!==ui.b.id)!;
  ui.assertRun(run);assert.equal(ui.doc.querySelector('#finish-run'),null);
});

for(const when of ['before-click','during-finish'] as const){
  test(`current finish rejects a stale same-run poll started ${when}`,async t=>{
    const ui=await dashboard(t);const stale=ui.hold(`/api/runs/${ui.a.id}`);
    // The first ordering captures a running snapshot before the finish click.
    let polling:Promise<void>;
    if(when==='before-click'){polling=ui.poll();await until(()=>stale.ready);}
    const finish=ui.hold(`/api/runs/${ui.a.id}/finish`);ui.click('#finish-run');await until(()=>finish.ready);
    if(when==='during-finish'){
      // GET includes report metadata absent from finish, so applying this stale
      // response would rerender even though both snapshots are completed.
      polling=ui.poll();await until(()=>stale.ready);
    }
    await ui.deliver(finish);ui.assertRun(ui.a);assert.equal(ui.doc.querySelector('#finish-run'),null);
    const result=ui.doc.querySelector('.result')!;await ui.deliver(stale);await polling!;
    assert.equal(ui.doc.querySelector('.result'),result,'a poll from the finished generation must not render');
    assert.equal(ui.doc.querySelector('#finish-run'),null);assert.equal(ui.store.get(ui.a.id)!.status,'completed');
  });
}

test('a failed current finish keeps the action retryable and retry observes server completion',async t=>{
  const ui=await dashboard(t);const finish=ui.hold(`/api/runs/${ui.a.id}/finish`,true);
  ui.click('#finish-run');await until(()=>finish.ready);await ui.deliver(finish);
  assert.equal(ui.doc.querySelector('#toast')!.textContent,'Synthetic finish outage');assert.ok(ui.doc.querySelector('#finish-run'));
  assert.equal(ui.store.get(ui.a.id)!.status,'completed','the lost acknowledgment does not undo the server commit');
  ui.click('#finish-run');await until(()=>!ui.doc.querySelector('#finish-run'));ui.assertRun(ui.a);
});

test('an obsolete finish failure does not show an error over a newer run',async t=>{
  const ui=await dashboard(t);const finish=ui.hold(`/api/runs/${ui.a.id}/finish`,true);
  ui.click('#finish-run');await until(()=>finish.ready);ui.navigate(ui.b.id);
  await until(()=>ui.doc.querySelector('.run-id')?.textContent===ui.b.id.slice(0,8));await ui.deliver(finish);
  ui.assertRun(ui.b);assert.equal(ui.doc.querySelector('#toast')!.textContent,'');
});
