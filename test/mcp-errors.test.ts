import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type RequestListener } from 'node:http';
import { once } from 'node:events';
import { requestLab } from '../src/mcp.js';

async function fixture(t:any,listener:RequestListener){
  const server=createServer(listener);server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
  return `http://127.0.0.1:${(server.address() as any).port}`;
}
test('HTTP and malformed responses produce structured errors without private response contents',async t=>{
  for(const [status,body,code] of [[401,'private-token','LAB_AUTHORIZATION'],[503,'private-token','LAB_HTTP_ERROR'],[200,'private-token','LAB_INVALID_RESPONSE'],[200,'{"unexpected":"private-token"}','LAB_INVALID_RESPONSE']] as const){
    const origin=await fixture(t,(_,res)=>{res.writeHead(status);res.end(body);});
    const result=await requestLab(origin,'private-token','/agent/call',{});
    assert.equal(result.ok,false);assert.equal(result.error.code,code);assert.equal(result.error.retryable,false);
    assert.match(result.error.message,/outcome is unknown/);assert.doesNotMatch(JSON.stringify(result),/private-token/);
  }
});
test('a lost response after a write never triggers an automatic retry',async t=>{
  let writes=0;
  const origin=await fixture(t,(req)=>{writes++;req.socket.destroy();});
  const result=await requestLab(origin,'token','/agent/call',{name:'payments_create',arguments:{idempotency_key:'stable-key'}});
  assert.equal(writes,1);assert.equal(result.error.code,'LAB_CONNECTION_FAILED');
  assert.match(result.error.message,/original payment idempotency key/);
});
test('transport bounds response bytes and time, and refuses redirects',async t=>{
  const large=await fixture(t,(_,res)=>res.end('x'.repeat(1024*1024+1)));
  assert.equal((await requestLab(large,'token','/agent/call',{})).error.code,'LAB_RESPONSE_TOO_LARGE');
  const hanging=await fixture(t,()=>{});
  assert.equal((await requestLab(hanging,'token','/agent/call',{},50)).error.code,'LAB_TIMEOUT');
  let forwarded=0;
  const destination=await fixture(t,(_,res)=>{forwarded++;res.end('{}');});
  const redirect=await fixture(t,(_,res)=>{res.writeHead(302,{Location:destination});res.end();});
  assert.equal((await requestLab(redirect,'token','/agent/call',{})).ok,false);assert.equal(forwarded,0);
});
test('valid business faults stay distinct from transport failures; finish needs confirmation',async t=>{
  const fault={ok:false,error:{code:'TIMEOUT',message:'Payment committed before response timeout',retryable:true}};
  const origin=await fixture(t,(_,res)=>res.end(JSON.stringify(fault)));
  assert.deepEqual(await requestLab(origin,'token','/agent/call',{}),fault);
  assert.equal((await requestLab(origin,'token','/agent/finish',{})).error.code,'LAB_INVALID_RESPONSE');
});
