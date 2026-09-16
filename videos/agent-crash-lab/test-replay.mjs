import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('./replay/index.html',import.meta.url),'utf8');
const report=JSON.parse(readFileSync(new URL('./live-run.json',import.meta.url),'utf8'));
let tick,cleared=0;
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){w.setInterval=f=>{tick=f;return 1};w.clearInterval=()=>{cleared++}}});
const w=dom.window,d=w.document,click=id=>d.getElementById(id).click();
assert.equal(d.getElementById('tool').textContent,report.events[0].tool);
for(let i=0;i<8;i++){
 d.querySelector(`[data-step="${i}"]`).click();
 assert.deepEqual(JSON.parse(d.getElementById('args').textContent),report.events[i].arguments);
 assert.deepEqual(JSON.parse(d.getElementById('response').textContent),report.events[i].result);
 assert.equal(d.querySelectorAll('[aria-current="true"]').length,1);
}
assert.equal(d.getElementById('next').disabled,true);
click('play');assert.equal(d.getElementById('scrub').value,'0');
for(let i=0;i<7;i++)tick();
assert.equal(d.getElementById('tool').textContent,'email_send');assert.equal(d.getElementById('play').textContent,'Play replay');assert.ok(cleared>0);
const slider=d.getElementById('scrub');slider.value='5';slider.dispatchEvent(new w.Event('input'));assert.match(d.getElementById('status').textContent,/TIMEOUT/);
click('next');assert.equal(d.getElementById('tool').textContent,'payments_list');
assert.deepEqual(JSON.parse(readFileSync(new URL('./replay/report.json',import.meta.url),'utf8')),report);
w.close();console.log('Replay checked: all eight exact arguments/responses, selection, scrub, forward navigation, replay restart, auto-stop and report download.');
