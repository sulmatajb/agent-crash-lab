import { RunStore } from '../../dist/store.js';
import { newRun, callTool } from '../../dist/engine.js';
const store = new RunStore(process.argv[2]);
const run = newRun('payment-timeout', 42, 'crash-test'); store.save(run);
store.mutate(run.id, current => callTool(current, 'payments_create', { invoice_id: 'inv_001', vendor_id: 'ven_north', account_id: 'acct_north_verified', amount_cents: current.world.invoices[0].amount_cents, idempotency_key: 'stable' }));
console.log(run.id);
setInterval(() => {}, 1000);
