import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

// An alternate unchanged checkout lets the exact DOM regressions reproduce the bug.
const root=process.env.CRASHLAB_TEST_ROOT ? pathToFileURL(resolve(process.env.CRASHLAB_TEST_ROOT)+'/') : new URL('../',import.meta.url);
const {createLabServer}=await import(new URL('src/server.ts',root).href);
const {RunStore}=await import(new URL('src/store.ts',root).href);
const {newRun}=await import(new URL('src/engine.ts',root).href);
const pause=()=>new Promise(resolve=>setTimeout(resolve,20));
async function until(predicate:()=>boolean) {
  const end=Date.now()+5000;
  while(!predicate()){if(Date.now()>end)throw new Error('History UI did not reach expected state');await pause();}
}
async function dashboard(t:TestContext) {
  const store=new RunStore(':memory:');
  for(let i=0;i<130;i++){
    const run=newRun('clean-control',i,i<5?'external':'careful');
    run.created_at=new Date(Date.UTC(2025,0,1,0,0,i)).toISOString();store.save(run);
  }
  const server=createLabServer(store);server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${(server.address() as any).port}`;
  const requests:string[]=[];const errors:Error[]=[];
  const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e));
  let nextGate:any;const gates:any[]=[];let poll:()=>Promise<void>;let activeRequests=0;
  const dom=await JSDOM.fromURL(origin,{resources:'usable',runScripts:'dangerously',virtualConsole:console,beforeParse(window){
    // Drive the production poll deterministically; timeouts/debounce remain real.
    window.setInterval=((callback:any)=>{poll=callback;return 1;}) as any;
    window.fetch=(async(url:any,options:any={})=>{
      activeRequests++;
      const controller=new AbortController();const abort=()=>controller.abort();
      if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
      const isHistory=String(url).startsWith('/api/history?');
      const gate=isHistory?nextGate:undefined;
      if(isHistory){requests.push(String(url));nextGate=undefined;}
      try{
        // Every response is obtained from the real authenticated local endpoint.
        const response=await fetch(new URL(url,origin),{...options,signal:controller.signal});
        if(!gate)return response;
        gate.url=String(url);gate.ready=true;await gate.wait;
        return gate.failure?new Response(JSON.stringify({error:'Synthetic history outage'}),{status:503,headers:{'Content-Type':'application/json'}}):response;
      }finally{activeRequests--;options.signal?.removeEventListener('abort',abort);}
    }) as any;
  }});
  t.after(async()=>{
    gates.forEach(g=>g.release());await until(()=>activeRequests===0);await pause();await pause();
    dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();
    server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));store.close();
    assert.deepEqual(errors.map(e=>e.message),[]);
  });
  const doc=dom.window.document;
  const button=(id:string)=>doc.querySelector(`#history-${id}`) as HTMLButtonElement;
  const ids=()=>Array.from(doc.querySelectorAll<HTMLElement>('.history-row'),el=>el.dataset.run);
  const nav=()=>['previous','newest','next'].map(id=>button(id).disabled);
  const click=(id:string)=>(doc.querySelector(id) as HTMLElement).click();
  const snapshot=()=>({ids:ids(),nav:nav(),status:doc.querySelector('#history-status')!.textContent,count:doc.querySelector('#history-count')!.textContent});
  const expectPage=async(expected:string[],navigation:boolean[])=>{await until(()=>JSON.stringify(ids())===JSON.stringify(expected)&&JSON.stringify(nav())===JSON.stringify(navigation));};
  const all=store.page(100).runs.map((r:any)=>r.id).concat(store.page(100,store.page(100).next_cursor).runs.map((r:any)=>r.id));
  const page=(n:number)=>all.slice((n-1)*50,n*50);
  const go=async(n:number)=>{for(let i=1;i<n;i++){click('#history-next');await expectPage(page(i+1),[false,false,i+1===3]);}};
  const hold=(failure=false)=>{
    const gate:any={failure,ready:false};gate.wait=new Promise<void>(resolve=>{gate.release=resolve;});gates.push(gate);nextGate=gate;return gate;
  };
  const search=(value:string)=>{const input=doc.querySelector('#history-search') as HTMLInputElement;input.value=value;input.dispatchEvent(new dom.window.Event('input'));};
  const filter=(value:string)=>{const select=doc.querySelector('#history-filter') as HTMLSelectElement;select.value=value;select.dispatchEvent(new dom.window.Event('change'));};
  await expectPage(page(1),[true,true,false]);
  click('.nav-item[data-view="history"]');await until(()=>activeRequests===0);await pause();await until(()=>!button('next').disabled);
  return {doc,store,requests,ids,nav,click,snapshot,expectPage,page,go,hold,search,filter,poll:()=>poll(),button};
}

test('history traverses three real pages and deduplicates refresh/poll during navigation',async t=>{
  const ui=await dashboard(t);await ui.go(2);
  const gate=ui.hold();const count=ui.requests.length;ui.click('#history-next');await until(()=>gate.ready);
  ui.click('#refresh-history');const polling=ui.poll();await pause();assert.equal(ui.requests.length,count+1);
  assert.deepEqual(ui.nav(),[true,true,true]);gate.release();await polling;
  await ui.expectPage(ui.page(3),[false,false,true]);
  ui.click('#history-previous');await ui.expectPage(ui.page(2),[false,false,false]);
  ui.click('#history-newest');await ui.expectPage(ui.page(1),[true,true,false]);
});

for(const [direction,start] of [['next',1],['next',2],['previous',2],['newest',3]] as const){
  test(`failed ${direction} on page ${start} preserves rows and controls, and retries the same cursor`,async t=>{
    const ui=await dashboard(t);await ui.go(start);const before=ui.snapshot();
    const gate=ui.hold(true);ui.click(`#history-${direction}`);await until(()=>gate.ready);
    assert.deepEqual(ui.nav(),[true,true,true]);assert.deepEqual(ui.ids(),before.ids);
    gate.release();await until(()=>ui.doc.querySelector('#toast')!.textContent==='Synthetic history outage');
    assert.deepEqual(ui.snapshot(),before,'failed navigation must preserve the displayed page and retry controls');
    const expected=direction==='next'?start+1:1;
    ui.click(`#history-${direction}`);await ui.expectPage(ui.page(expected),[expected===1,expected===1,expected===3]);
    assert.equal(ui.requests.at(-1),gate.url,'retry must request exactly the failed cursor');
    if(direction==='next'){
      ui.click('#history-previous');await ui.expectPage(ui.page(start),[start===1,start===1,false]);
      if(start===2){ui.click('#history-previous');await ui.expectPage(ui.page(1),[true,true,false]);}
    }
  });
}

test('failed refresh preserves the current page and a subsequent refresh recovers',async t=>{
  const ui=await dashboard(t);await ui.go(2);const before=ui.snapshot();
  const gate=ui.hold(true);ui.click('#refresh-history');await until(()=>gate.ready);gate.release();
  await until(()=>ui.doc.querySelector('#toast')!.textContent==='Synthetic history outage');assert.deepEqual(ui.snapshot(),before);
  ui.click('#refresh-history');await ui.expectPage(ui.page(2),[false,false,false]);assert.equal(ui.requests.at(-1),gate.url);
});

for(const intent of ['search','filter'] as const)for(const failure of [false,true]){
  test(`obsolete page ${failure?'failure':'response'} cannot disturb a newer ${intent}`,async t=>{
    const ui=await dashboard(t);await ui.go(2);const gate=ui.hold(failure);
    ui.click('#history-previous');await until(()=>gate.ready);
    if(intent==='search')ui.search('external');else ui.filter('live');
    const expected=ui.store.page(50,undefined,intent==='search'?'external':'',intent==='filter'?'live':'all').runs.map((r:any)=>r.id);
    await ui.expectPage(expected,[true,true,true]);const before=ui.snapshot();gate.release();await pause();await pause();
    assert.deepEqual(ui.snapshot(),before);assert.equal(ui.doc.querySelector('#toast')!.textContent,'');
    assert.equal(ui.requests.at(-1)!.includes('before='),false,'a changed query starts at newest');
  });
}

test('obsolete failure cannot unlock controls while a newer page request is pending',async t=>{
  const ui=await dashboard(t);await ui.go(2);const old=ui.hold(true);ui.click('#history-previous');await until(()=>old.ready);
  ui.filter('reference');const first=ui.store.page(50,undefined,'','reference');
  await ui.expectPage(first.runs.map((r:any)=>r.id),[true,true,false]);
  const newer=ui.hold();ui.click('#history-next');await until(()=>newer.ready);old.release();await pause();await pause();
  assert.deepEqual(ui.nav(),[true,true,true]);assert.equal(ui.doc.querySelector('#toast')!.textContent,'');
  newer.release();const second=ui.store.page(50,first.next_cursor,'','reference');
  await ui.expectPage(second.runs.map((r:any)=>r.id),[false,false,false]);
  ui.click('#history-previous');await ui.expectPage(first.runs.map((r:any)=>r.id),[true,true,false]);
});

test('an older response stays obsolete when the filter returns to the same value',async t=>{
  const ui=await dashboard(t);const old=ui.hold();ui.click('#refresh-history');await until(()=>old.ready);
  const added=newRun('clean-control',98765,'external');added.created_at='2026-01-01T00:00:00.000Z';ui.store.save(added);
  ui.filter('reference');await ui.expectPage(ui.page(1),[true,true,false]);
  ui.filter('all');const current=ui.store.page(50).runs.map((r:any)=>r.id);await ui.expectPage(current,[true,true,false]);
  const before=ui.snapshot();old.release();await pause();await pause();assert.deepEqual(ui.snapshot(),before);
});

test('search input invalidates an old failure during the debounce interval',async t=>{
  const ui=await dashboard(t);await ui.go(2);const old=ui.hold(true);ui.click('#history-previous');await until(()=>old.ready);
  ui.search('external');old.release();await pause();await pause();
  assert.equal(ui.doc.querySelector('#toast')!.textContent,'');assert.deepEqual(ui.nav(),[true,true,true]);
  const expected=ui.store.page(50,undefined,'external').runs.map((r:any)=>r.id);await ui.expectPage(expected,[true,true,true]);
});

for(const intent of ['search','filter'] as const){
  test(`failed ${intent} keeps rows but cannot paginate them with the new query; Refresh retries at newest`,async t=>{
    const ui=await dashboard(t);await ui.go(2);const before=ui.ids();const gate=ui.hold(true);
    if(intent==='search')ui.search('external');else ui.filter('live');
    await until(()=>gate.ready);gate.release();await until(()=>ui.doc.querySelector('#toast')!.textContent==='Synthetic history outage');
    assert.deepEqual(ui.ids(),before);assert.deepEqual(ui.nav(),[true,true,true]);
    const count=ui.requests.length;ui.click('#history-next');ui.click('#history-previous');assert.equal(ui.requests.length,count);
    ui.click('#refresh-history');const expected=ui.store.page(50,undefined,intent==='search'?'external':'',intent==='filter'?'live':'all').runs.map((r:any)=>r.id);
    await ui.expectPage(expected,[true,true,true]);assert.equal(ui.requests.at(-1),gate.url);assert.equal(gate.url.includes('before='),false);
  });
}
