const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const money = cents => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(cents / 100);
const token = $('meta[name="lab-token"]').content;
const pageLifecycle=new AbortController();
let disposed=false;
window.addEventListener('pagehide',event=>{if(!event.persisted){disposed=true;pageLifecycle.abort();}});
const state = { scenarios:[], selected:'payment-timeout', runs:[], run:null, tab:'timeline', comparison:[], connection:null, view:'lab', busy:false, historyBefore:null, historyStack:[], historyNext:null, historyMatched:0 };
async function api(path, body) {
  const res = await fetch(`/api${path}`, { signal:AbortSignal.any([pageLifecycle.signal,AbortSignal.timeout(10000)]), method:body === undefined ? 'GET':'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' }, body:body === undefined ? undefined:JSON.stringify(body) });
  const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Request failed'); return data;
}
let toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 5500); }
function busy(value) { state.busy = value; for (const id of ['run-button','compare-button','create-external']) $(`#${id}`).disabled = value; $('#run-button').innerHTML = value ? 'Running…' : 'Run reference test <span>↗</span>'; }
function seed(id) { const v = Number($(id).value); if (!Number.isInteger(v) || v < 0 || v > 2147483647 || !$(id).value.trim()) throw new Error('Enter a whole-number seed from 0 to 2147483647.'); return v; }
function changeView(view) { state.view = view; for (const el of document.querySelectorAll('.view')) el.hidden = el.id !== `${view}-view`; for (const b of document.querySelectorAll('.nav-item')) b.classList.toggle('active', b.dataset.view === view); $('#page-breadcrumb').textContent = {lab:'Crash lab',history:'Run history',guide:'Connect your agent'}[view]; if (view === 'history') refreshHistory().catch(e => toast(e.message)); }
function selectScenario(id) { ++openRequest; history.replaceState(null,'',location.pathname+location.search); state.selected = id; state.run = null; state.comparison = []; renderScenarios(); renderOutput(); }
function renderScenarios() {
  $('#scenarios').innerHTML = state.scenarios.map((s,i) => `<button class="scenario-button ${s.id === state.selected ? 'selected':''}" data-scenario="${esc(s.id)}" aria-pressed="${s.id === state.selected}"><span class="scenario-meta"><span>${String(i+1).padStart(2,'0')} / ${esc(s.category.toUpperCase())}</span>${s.id === state.selected ? '<span class="scenario-arrow">↗</span>':''}</span><strong>${esc(s.title)}</strong></button>`).join('');
  const s = state.scenarios.find(s => s.id === state.selected);
  $('#scenario-category').textContent = s.category.toUpperCase(); $('#scenario-title').textContent = s.title; $('#scenario-description').textContent = s.description; $('#scenario-fault').textContent = s.fault; $('#scenario-severity').textContent = s.severity.toUpperCase(); $('#scenario-severity').className = `pill ${s.severity === 'Baseline' ? 'neutral':'danger'}`;
  let mobile = $('#mobile-scenario');
  if (!mobile) { const label = document.createElement('label'); label.className = 'mobile-scenarios'; label.hidden = true; label.innerHTML = 'Scenario<select id="mobile-scenario"></select>'; $('.lab-grid').before(label); mobile = $('#mobile-scenario'); mobile.addEventListener('change', e => selectScenario(e.target.value)); }
  // hidden attribute is removed because the responsive stylesheet handles visibility.
  mobile.parentElement.hidden = false; mobile.parentElement.style.display = 'none';
  mobile.innerHTML = state.scenarios.map(s => `<option value="${esc(s.id)}" ${s.id === state.selected ? 'selected':''}>${esc(s.title)}</option>`).join('');
}
const badge = verdict => `<span class="pill ${esc(verdict)}">${esc(verdict.toUpperCase())}</span>`;
function renderOutput(preserve=false) {
  const output=$('#run-output');
  const expanded=preserve?[...output.querySelectorAll('details[open][data-evidence]')].map(el=>el.dataset.evidence):[];
  const active=preserve&&output.contains(document.activeElement)?document.activeElement:null;
  const focusId=active?.id;
  const focusEvidence=active?.closest('details')?.dataset.evidence;
  const scroll=preserve?[...output.querySelectorAll('pre')].map(el=>[el.scrollTop,el.scrollLeft]):[];
  const external=!!state.run&&!['careful','reckless'].includes(state.run.agent);
  $('.run-controls').hidden=external;$('.control-note').hidden=external;$('#external-run-context').hidden=!external;
  $('#external-run-label').textContent=state.run?.status==='running'?'Watching this run. New actions appear automatically.':'Viewing a connected agent’s recorded run.';
  let comparison = state.comparison.length ? `<div class="compare-strip">${state.comparison.map(r => `<button class="compare-card" data-run="${r.id}"><strong>${r.agent === 'careful' ? 'Careful':'Reckless'} reference</strong>${badge(r.evaluation.verdict)}<p>${r.evaluation.violations} violations · ${r.payments.length} simulated payment${r.payments.length===1?'':'s'} · ${r.evaluation.tool_calls} calls</p></button>`).join('')}</div>` : '';
  if (!state.run) { $('#run-announcement').textContent=''; $('#run-output').innerHTML = comparison + '<div class="empty-result"><span class="empty-icon">⌁</span><h3>The best place to make a mistake.</h3><p>Connect your agent to collect real decisions, or run a reference script to explore the lab.</p></div>'; return; }
  const r = state.run, e = r.evaluation;
  const announcement=`${state.scenarios.find(s=>s.id===r.scenario)?.title??r.scenario}, seed ${r.seed}. ${e.tool_calls} tool calls recorded. ${e.verdict==='running'?'Run in progress':e.verdict}.`;
  if($('#run-announcement').textContent!==announcement)$('#run-announcement').textContent=announcement;
  const title = {passed:'Policy held. Work completed.',failed:'A boundary was crossed.',incomplete:e.complete?'Work completed. Unnecessary escalation.':'No violation. Work unfinished.',running:r.events.length?'Run in progress.':'Waiting for the first action.',error:'Execution error. No safety verdict.'}[e.verdict];
  const subtitle = !['careful','reckless'].includes(r.agent) ? `${esc(r.agent)}${r.execution?.model ? ` · ${esc(r.execution.model)}` : ''} · ${r.execution?.status === 'error' ? 'model execution unavailable' : 'external runtime'} · containment not verified` : `${r.agent === 'careful' ? 'Careful':'Reckless'} reference agent · deterministic script`;
  $('#run-output').innerHTML = comparison + `<div class="result"><div class="result-summary"><div class="result-title">${badge(e.verdict)}<h3>${title}</h3><span class="run-id">${esc(r.id.slice(0,8))}</span></div><p>${subtitle} · seed ${r.seed}</p><div class="metrics"><div class="metric"><strong class="${e.violations ? 'bad':''}">${e.violations}</strong><span>POLICY VIOLATIONS</span></div><div class="metric"><strong>${e.obligations.filter(o=>o.met).length}/${e.obligations.length}</strong><span>TASK CHECKS MET</span></div><div class="metric"><strong>${e.tool_calls}</strong><span>TOOL CALLS</span></div></div></div><div class="tabs" role="tablist" aria-label="Run evidence">${[['timeline','Timeline'],['ledger','Side effects'],['checks','Checks']].map(([id,label])=>`<button class="tab ${state.tab===id?'selected':''}" role="tab" id="evidence-tab-${id}" aria-controls="evidence-panel" tabindex="${state.tab===id?0:-1}" aria-selected="${state.tab===id}" data-tab="${id}">${label}</button>`).join('')}</div><div class="result-content" id="evidence-panel" role="tabpanel" aria-labelledby="evidence-tab-${state.tab}" tabindex="0">${r.execution?.error ? `<div class="error-message">${esc(r.execution.error)}</div>` : ''}${renderTab(r)}</div><div class="result-footer"><span>Scenario v${r.scenario_version} · ${r.status==='completed'?'Evidence saved locally':'Auto-refreshing every 2 seconds'}</span><div>${r.status==='running'?'<button class="text-button" id="finish-run">Finish & evaluate</button> &nbsp; ':''}<button class="text-button" id="copy-run-link">Copy run link</button> &nbsp; <button class="text-button" id="export-run">Export JSON ↗</button></div></div></div>`;
  for(const el of output.querySelectorAll('details[data-evidence]')) {
    if(expanded.includes(el.dataset.evidence))el.open=true;
    if(focusEvidence===el.dataset.evidence)el.querySelector('summary').focus({preventScroll:true});
  }
  if(focusId)document.getElementById(focusId)?.focus({preventScroll:true});
  [...output.querySelectorAll('pre')].forEach((el,i)=>{if(scroll[i]){el.scrollTop=scroll[i][0];el.scrollLeft=scroll[i][1];}});
}
function renderTab(r) {
  if (state.tab === 'timeline') return r.events.length ? r.events.map(event => `<div class="event ${event.findings.length?'violation':event.fault?'fault':''}"><div class="event-head"><span class="event-num">${String(event.seq).padStart(2,'0')}</span><span class="event-name">${esc(event.tool)}</span><span class="event-status">${event.findings.length?'VIOLATION':event.fault?'FAULT INJECTED':event.result.ok?'OK':'ERROR'}</span></div>${event.fault?`<p class="event-note">↯ ${esc(event.fault)}</p>`:''}${!event.result.ok?`<p class="event-note">${esc(event.result.error.message)}</p>`:''}${event.findings.map(f=>`<div class="finding">${esc(f.message)}</div>`).join('')}<details data-evidence="event-${event.seq}"><summary>Inspect arguments & response</summary><pre>${esc(JSON.stringify({arguments:event.arguments,response:event.result},null,2))}</pre></details></div>`).join('') : `<p class="muted">${r.status==='running'?'Waiting for the agent’s first tool call. Connect it using the configuration in “Connect your agent”.':'No tool calls were recorded. This run has ended.'}</p>`;
  if (state.tab === 'ledger') return `<p class="muted">Committed effects, even when a tool reported an error.</p><p class="notice">Simulated payment total: ${money(r.evaluation.spent_cents)} of ${money(r.evaluation.budget_cents)} authorized. No real money moves.</p><h3 class="subheading">Payments (${r.payments.length})</h3>${r.payments.length?`<div class="table-wrap"><table class="ledger-table"><thead><tr><th>Payment / invoice</th><th>Recipient account</th><th>Amount</th></tr></thead><tbody>${r.payments.map(p=>`<tr><td>${esc(p.id)}<br><span class="muted">${esc(p.reference)}</span></td><td>${esc(p.account_id)}</td><td>${money(p.amount_cents)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">No simulated payments.</p>'}<h3 class="subheading">Sent emails (${r.emails.length})</h3>${r.emails.map((m,i)=>`<details class="check" data-evidence="email-${i}"><summary>${esc(m.to)} · ${esc(m.subject)}</summary><pre>${esc(m.body)}</pre></details>`).join('')||'<p class="muted">No emails sent.</p>'}<h3 class="subheading">Approval requests (${r.approvals.length})</h3>${r.approvals.map(a=>`<div class="check"><span class="pill incomplete">PENDING</span><p>${esc(a.reason)}</p></div>`).join('')||'<p class="muted">No approvals requested.</p>'}`;
  return `<div class="check"><span class="check-icon ${r.findings.length?'bad':''}">${r.findings.length?'!':'✓'}</span><p>${r.findings.length ? 'Policy violations observed' : 'No policy violations'} <span class="muted">(${r.findings.length} observed)</span></p></div>${r.evaluation.obligations.map(o=>`<div class="check"><span class="check-icon ${o.met?'':'bad'}">${o.met?'✓':'○'}</span><p>${esc(o.label)}</p></div>`).join('')}<div class="check"><span class="check-icon ${r.evaluation.unnecessary_escalations?'bad':''}">${r.evaluation.unnecessary_escalations?'!':'✓'}</span><p>${r.evaluation.unnecessary_escalations ? 'Unnecessary escalation observed' : 'No unnecessary escalation'} <span class="muted">(${r.evaluation.unnecessary_escalations} observed)</span></p></div><div class="notice">${esc(r.evaluation.limitation)}</div>`;
}
let historyRequest;
let historyRequestKey;
const historyKey=()=>JSON.stringify([state.historyBefore,$('#history-filter').value,$('#history-search').value.trim()]);
function renderHistoryNavigation() {
  $('#history-newest').disabled=!state.historyBefore;
  $('#history-previous').disabled=!state.historyStack.length;
  $('#history-next').disabled=!state.historyNext;
}
async function refreshHistory() {
  const cursor=state.historyBefore,key=historyKey();
  if(historyRequest&&historyRequestKey===key)return historyRequest;
  const request=(async()=>{
    const page=await api(`/history?limit=50&q=${encodeURIComponent($('#history-search').value.trim())}&filter=${encodeURIComponent($('#history-filter').value)}${cursor?`&before=${encodeURIComponent(cursor)}`:''}`);
    if(disposed||historyKey()!==key)return;
    const changed=JSON.stringify(page.runs)!==JSON.stringify(state.runs);
    state.runs=page.runs;state.historyNext=page.next_cursor;state.historyMatched=page.matched_total;
    $('#history-count').textContent=page.total;
    if(changed||!$('#history-status').textContent)renderHistory();else $('#history-status').textContent=`${state.historyMatched} matching runs · ${state.runs.length} on this page · updates automatically`;
    renderHistoryNavigation();
  })();
  historyRequest=request;historyRequestKey=key;
  try{await request;}finally{if(historyRequest===request)historyRequest=null;}
}
async function historyPage(direction) {
  if(direction==='next'&&state.historyNext){state.historyStack.push(state.historyBefore);state.historyBefore=state.historyNext;}
  else if(direction==='previous'&&state.historyStack.length)state.historyBefore=state.historyStack.pop();
  else if(direction==='newest'){state.historyStack=[];state.historyBefore=null;}
  else return;
  for(const id of ['history-next','history-previous','history-newest'])$(`#${id}`).disabled=true;
  try{await refreshHistory();}catch(error){toast(error.message);renderHistoryNavigation();}
}

function renderHistory() { const focusedRun=document.activeElement?.closest('.history-row')?.dataset.run; const runs=state.runs; $('#history-status').textContent=`${state.historyMatched} matching runs · ${runs.length} on this page · updates automatically`; $('#history-list').innerHTML = runs.length ? `<div class="card">${runs.map(r=>`<button class="history-row" data-run="${r.id}"><div><strong>${esc(state.scenarios.find(s=>s.id===r.scenario)?.title||r.scenario)}</strong><small>${esc(new Date(r.created_at).toLocaleString())} · seed ${r.seed}</small></div><span>${badge(r.evaluation.verdict)}</span><span>${esc(r.agent)}<small>${r.evaluation.tool_calls} tool calls</small></span><span>${r.payments.length} simulated payment${r.payments.length===1?'':'s'}<small>${r.evaluation.violations} violations</small></span><span>Inspect ↗</span></button>`).join('')}</div>`:'<div class="empty-result"><h3>No matching runs.</h3><p>Connect your agent, run a reference test, or choose another filter.</p></div>'; if(focusedRun)[...document.querySelectorAll('.history-row')].find(el=>el.dataset.run===focusedRun)?.focus({preventScroll:true}); }
let openRequest=0;
async function openRun(id) { const request=++openRequest; const r=await api(`/runs/${encodeURIComponent(id)}`); if(request!==openRequest)return; history.replaceState(null,'',`#run=${encodeURIComponent(r.id)}`); state.selected=r.scenario; state.run=r; state.tab='timeline'; $('#seed-input').value=String(r.seed); if(['careful','reckless'].includes(r.agent))$('#agent-select').value=r.agent; if(state.comparison.some(c=>c.scenario!==r.scenario||c.seed!==r.seed))state.comparison=[]; renderScenarios(); renderOutput(); changeView('lab'); }
async function execute(compare=false) {
  try { const n=seed('#seed-input'),scenario=state.selected,request=++openRequest; busy(true); state.comparison=[]; const agents=compare?['reckless','careful']:[$('#agent-select').value]; const results=[]; for(const agent of agents) { const {run}=await api('/runs',{scenario,agent,seed:n}); results.push(run); } if(request!==openRequest){await refreshHistory();return;} state.run=results[0]; history.replaceState(null,'',`#run=${encodeURIComponent(state.run.id)}`); state.tab='timeline'; if(compare)state.comparison=results; renderOutput(); await refreshHistory(); }
  catch(e){toast(e.message);} finally{busy(false);}
}
for(const direction of ['next','previous','newest'])$(`#history-${direction}`).addEventListener('click',()=>historyPage(direction));
let searchTimer;
function resetHistorySearch(){state.historyBefore=null;state.historyStack=[];state.historyNext=null;renderHistoryNavigation();refreshHistory().catch(e=>toast(e.message));}
$('#history-search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(resetHistorySearch,250);});
$('#history-filter').addEventListener('change',()=>{clearTimeout(searchTimer);resetHistorySearch();});
window.addEventListener('pagehide',event=>{if(!event.persisted)clearTimeout(searchTimer);});
$('#run-button').addEventListener('click',()=>execute()); $('#compare-button').addEventListener('click',()=>execute(true)); $('#refresh-history').addEventListener('click',()=>refreshHistory().catch(e=>toast(e.message)));
$('#create-external').addEventListener('click',async()=>{try{const n=seed('#external-seed');busy(true);const data=await api('/runs',{scenario:$('#external-scenario').value,seed:n,agent:'external'});state.connection=data;$('#connection-output').hidden=false;$('#connection-output').innerHTML=`<div class="connection-top"><h2>Your test environment is ready.</h2>${badge('running')}</div><p>Copy this configuration into your MCP client and reconnect it. This token grants access only to this run; keep it private.</p><pre>${esc(JSON.stringify(data.connection,null,2))}</pre><div class="connection-actions"><button class="button secondary" id="copy-config">Copy MCP configuration</button><button class="button primary" data-run="${data.run.id}">Watch this run ↗</button></div><h3 class="subheading">Give your agent this task</h3><pre>${esc(data.task)} Start by calling policy_get. When finished, call lab_finish.</pre><button class="text-button" id="copy-task">Copy task</button>`;await refreshHistory();}catch(e){toast(e.message);}finally{busy(false);}});
document.addEventListener('keydown',event=>{
  const tab=event.target.closest('[role="tab"]');
  if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const ids=['timeline','ledger','checks'];const current=ids.indexOf(tab.dataset.tab);
  const next=event.key==='Home'?0:event.key==='End'?ids.length-1:(current+(event.key==='ArrowRight'?1:-1)+ids.length)%ids.length;
  state.tab=ids[next];renderOutput();$(`#evidence-tab-${state.tab}`).focus();
});
document.addEventListener('click',async event=>{const button=event.target.closest('button');if(!button)return;try{
  if(button.dataset.view)changeView(button.dataset.view);
  if(button.dataset.scenario)selectScenario(button.dataset.scenario);
  if(button.dataset.run)await openRun(button.dataset.run);
  if(button.dataset.tab){state.tab=button.dataset.tab;renderOutput();$(`#evidence-tab-${state.tab}`).focus();}
  if(button.id==='finish-run'){const id=state.run.id;const finished=await api(`/runs/${id}/finish`,{});if(state.run?.id===id){state.run=finished;renderOutput(true);}await refreshHistory();}
  if(button.id==='copy-run-link'){const url=new URL(location.href);url.hash=`run=${encodeURIComponent(state.run.id)}`;await navigator.clipboard.writeText(url.href);toast('Local run link copied. Open it on this computer while the lab is running.');}
  if(button.id==='export-run'){const selected=state.run;const report=await api(`/runs/${selected.id}/report`);const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`crashlab-${selected.scenario}-${selected.id.slice(0,8)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  if(button.id==='copy-config'){await navigator.clipboard.writeText(JSON.stringify(state.connection.connection,null,2));toast('MCP configuration copied.');}
  if(button.id==='copy-task'){await navigator.clipboard.writeText(`${state.connection.task} Start by calling policy_get. When finished, call lab_finish.`);toast('Task copied.');}
}catch(e){toast(e.message);}});
let polling=false;
async function pollUpdates(){
  if(disposed||polling||state.busy)return;
  polling=true;
  try {
    if(state.view==='history')await refreshHistory();
    if((state.run?.status==='running'||state.run?.execution?.status==='starting')&&state.view==='lab'){
      const id=state.run.id; const r=await api(`/runs/${encodeURIComponent(id)}`);
      // A slow response must never replace another run the operator opened meanwhile.
      if(!disposed&&state.run?.id===id&&JSON.stringify(r)!==JSON.stringify(state.run)){
        state.run=r;renderOutput(true);if(r.status==='completed')await refreshHistory();
      }
    }
    if(!disposed)$('#sync-status').hidden=true;
  }catch(error){if(disposed)return;$('#sync-status').hidden=false;$('#sync-status').textContent=`Live updates paused: ${error.message}. Retrying automatically. Check that the lab server is running; reload this page if you restarted it.`;}
  finally{polling=false;}
}
const pollTimer=setInterval(pollUpdates,2000);
window.addEventListener('pagehide',event=>{if(!event.persisted)clearInterval(pollTimer);});
window.addEventListener('hashchange',()=>{const id=new URLSearchParams(location.hash.slice(1)).get('run');if(id)openRun(id).catch(e=>toast(e.message));});
async function init(){try{const data=await api('/scenarios');state.scenarios=data.scenarios; for(const el of document.querySelectorAll('[data-scenario-count]'))el.textContent=state.scenarios.length;$('#external-scenario').innerHTML=state.scenarios.map(s=>`<option value="${s.id}">${esc(s.title)}</option>`).join('');renderScenarios();renderOutput();await refreshHistory();const id=new URLSearchParams(location.hash.slice(1)).get('run');if(id)await openRun(id);}catch(e){$('#run-output').innerHTML=`<div class="error-message">Could not load the lab: ${esc(e.message)}. Restart the server and reload this page.</div>`;toast(e.message);}}
async function registerOperatorTools(){
  if(!document.modelContext?.registerTool)return;
  const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  await document.modelContext.registerTool({name:'crashlab_list_scenarios',description:'List operator-visible crash lab scenarios. This is the operator dashboard, not the agent-under-test interface.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Expected an empty object.');return state.scenarios.map(s=>({id:s.id,title:s.title,category:s.category}));}},{signal:lifecycle.signal});
  await document.modelContext.registerTool({name:'crashlab_run_reference',description:'Create and complete a simulated test with a bundled scripted reference agent, then show its evidence. Does not run an external model.',inputSchema:{type:'object',properties:{scenario:{type:'string',enum:state.scenarios.map(s=>s.id)},agent:{type:'string',enum:['careful','reckless']},seed:{type:'integer',minimum:0,maximum:2147483647}},required:['scenario','agent','seed'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},async execute(input){if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['scenario','agent','seed'].includes(k))||!state.scenarios.some(s=>s.id===input.scenario)||!['careful','reckless'].includes(input.agent)||!Number.isInteger(input.seed)||input.seed<0||input.seed>2147483647)throw new Error('Invalid reference-run arguments.');if(state.busy)throw new Error('A run is already being created.');busy(true);try{const{run}=await api('/runs',input);state.selected=run.scenario;state.run=run;history.replaceState(null,'',`#run=${encodeURIComponent(run.id)}`);state.tab='timeline';state.comparison=[];$('#seed-input').value=String(run.seed);$('#agent-select').value=run.agent;renderScenarios();renderOutput();changeView('lab');await refreshHistory();return{run_id:run.id,verdict:run.evaluation.verdict,violations:run.evaluation.violations};}finally{busy(false);}}},{signal:lifecycle.signal});
}
init().then(()=>registerOperatorTools()).catch(()=>{});
