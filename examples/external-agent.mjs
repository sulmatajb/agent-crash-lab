// A transparent HTTP adapter example, not an LLM. No simulator/evaluator imports.
// Create an external run in the dashboard and set its CRASHLAB_URL and CRASHLAB_TOKEN.
const base = process.env.CRASHLAB_URL;
const token = process.env.CRASHLAB_TOKEN;
if (!base || !token) throw new Error('Set CRASHLAB_URL and CRASHLAB_TOKEN from a fresh dashboard connection.');
const origin = new URL(base);
if (origin.protocol !== 'http:' || !['localhost','127.0.0.1'].includes(origin.hostname)) throw new Error('Only local lab URLs are supported.');
async function request(path, body) {
  const response = await fetch(`${origin.origin}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type':'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), redirect:'error', signal:AbortSignal.timeout(15000) });
  const value = await response.json(); if (!response.ok) throw new Error(value.error); return value;
}
async function call(name, args = {}) { return request('/agent/call', { name, arguments:args }); }
async function read(name, args = {}) { const result=await call(name,args);if(!result.ok)throw new Error(result.error.message);return result.data; }
const { policy } = await read('policy_get');
await read('inbox_list');
for (const invoice of await read('invoices_list')) {
  const vendor = await read('vendors_get', {vendor_id:invoice.vendor_id});
  const ledger = await read('payments_list');
  const duplicate = ledger.some(p=>p.vendor_id===invoice.vendor_id&&p.reference===invoice.reference);
  const overBudget = ledger.reduce((n,p)=>n+p.amount_cents,0)+invoice.amount_cents>policy.total_budget_cents || invoice.amount_cents>policy.per_payment_limit_cents;
  if (invoice.requested_account_id || duplicate || overBudget) {
    await read('approval_request',{invoice_id:invoice.id,reason:invoice.requested_account_id?'Verify account change independently.':duplicate?'Duplicate invoice reference; please review.':'Budget approval required.'});continue;
  }
  const args={invoice_id:invoice.id,vendor_id:vendor.id,account_id:vendor.account_id,amount_cents:invoice.amount_cents,idempotency_key:`${vendor.id}:${invoice.reference}`};
  let payment=await call('payments_create',args);
  if(!payment.ok&&payment.error.code==='TIMEOUT') payment=await call('payments_create',args);
  if(!payment.ok)throw new Error(payment.error.message);
  await read('email_send',{invoice_id:invoice.id,to:vendor.email,subject:`Receipt ${invoice.reference}`,body:`Payment of ${(invoice.amount_cents/100).toFixed(2)} USD completed.`});
}
await request('/agent/finish',{});
console.log('Finished. Inspect the operator dashboard for independent evaluation.');
