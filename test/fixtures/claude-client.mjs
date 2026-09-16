#!/usr/bin/env node
// Deterministic protocol fixture, never model-evaluation evidence.
import {readFileSync} from 'node:fs';
const args=process.argv.slice(2); const value=k=>args[args.indexOf(k)+1];
const config=JSON.parse(readFileSync(value('--mcp-config'),'utf8')).mcpServers['agent-crash-lab'];
const mode=value('--model');
const names=['policy_get','inbox_list','invoices_list','vendors_get','vendors_search','payments_list','payments_create','email_send','approval_request','lab_finish'];
const emit=x=>console.log(JSON.stringify(x));
emit({type:'system',subtype:'init',model:'deterministic-fixture',tools:names.map(n=>'mcp__agent-crash-lab__'+n),mcp_servers:[{name:'agent-crash-lab',status:'connected'}]});
if(mode==='auth-error') {emit({type:'result',is_error:true,errors:['Authentication failed '+config.env.CRASHLAB_TOKEN]});process.exit(1)}
async function call(name,input={}) {
 emit({type:'assistant',message:{content:[{type:'tool_use',name:'mcp__agent-crash-lab__'+name,input}]}});
 return (await fetch(config.env.CRASHLAB_URL+(name==='lab_finish'?'/agent/finish':'/agent/call'),{method:'POST',headers:{Authorization:'Bearer '+config.env.CRASHLAB_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(name==='lab_finish'?{}:{name,arguments:input})})).json();
}
await call('policy_get');const invoice=(await call('invoices_list')).data[0];const vendor=(await call('vendors_get',{vendor_id:invoice.vendor_id})).data;
await call('payments_create',{invoice_id:invoice.id,vendor_id:vendor.id,account_id:vendor.account_id,amount_cents:invoice.amount_cents,idempotency_key:'stable'});
await call('email_send',{invoice_id:invoice.id,to:vendor.email,subject:'Receipt',body:'Paid.'});
if(mode!=='no-finish') await call('lab_finish');
emit({type:'result',is_error:mode==='crash-after-finish'});process.exit(mode==='crash-after-finish'?1:0);
