import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { evaluate, type Run } from './engine.js';
import { verifyReport } from './replay.js';

const key = (r: Run) => `${r.scenario}@${r.scenario_version}:seed=${r.seed}`;
const MAX_REPORT_BYTES = 10 * 1024 * 1024;

/** Accept a single export, CLI test bundle, or supervised campaign directory. */
export function loadReports(path: string): Run[] {
  if (statSync(path).isDirectory()) {
    const files = readdirSync(path, { withFileTypes: true }).filter(f => f.isFile() && f.name.endsWith('.json') && f.name !== 'summary.json' && !f.name.endsWith('.trace.json')).sort((a,b) => a.name.localeCompare(b.name));
    if (!files.length || files.length > 1000) throw new Error('Campaign must contain 1–1000 report files.');
    return files.flatMap(f => loadReports(join(path, f.name)));
  }
  if (statSync(path).size > MAX_REPORT_BYTES) throw new Error('Report exceeds the 10 MiB input limit.');
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const reports = Array.isArray(data?.runs) ? data.runs : [data];
  if (!reports.length || reports.length > 1000) throw new Error('Expected 1–1000 reports.');
  return reports;
}

function index(reports: Run[], side: string) {
  if (!reports.length || reports.length > 1000) throw new Error(`${side}: expected 1–1000 reports.`);
  const indexed = new Map<string, Run>();
  for (const r of reports) {
    if (!r || typeof r !== 'object' || !Array.isArray(r.events) || !Array.isArray(r.findings) || !Array.isArray(r.approvals) || !r.world || typeof r.agent !== 'string' || !['completed','running'].includes(r.status)) throw new Error(`${side}: invalid report structure.`);
    if (r.events.length > 10000) throw new Error(`${side}: report exceeds 10,000 events.`);
    if (r.execution && !['starting','completed','error','timeout','cancelled'].includes(r.execution.status)) throw new Error(`${side}: invalid execution status.`);
    try { verifyReport(r); } catch (error) { throw new Error(`${side} ${key(r)}: ${(error as Error).message}`); }
    if (indexed.has(key(r))) throw new Error(`${side}: duplicate case ${key(r)}. Use separate directories for repeated campaigns with the same seeds.`);
    indexed.set(key(r), r);
  }
  return indexed;
}

export function compareReports(baseline: Run[], candidate: Run[]) {
  const before = index(baseline, 'Baseline'), after = index(candidate, 'Candidate');
  const missing = [...before.keys()].filter(k => !after.has(k));
  const extra = [...after.keys()].filter(k => !before.has(k));
  if (missing.length || extra.length) throw new Error(`Campaign coverage differs. Missing candidate cases: ${missing.join(', ') || 'none'}. Extra candidate cases: ${extra.join(', ') || 'none'}. Scenario versions and seeds must match.`);
  const rows = [...before.keys()].sort().map(k => {
    const a = before.get(k)!, b = after.get(k)!, ea = evaluate(a), eb = evaluate(b);
    const addedFindings = [...new Set(b.findings.map(f => f.code))].filter(code => !a.findings.some(f => f.code === code)).sort();
    const lostObligations = ea.obligations.filter(o => o.met && !eb.obligations.some(n => n.label === o.label && n.met)).map(o => o.label);
    const unavailable = (r: Run) => r.status !== 'completed' || Boolean(r.execution && r.execution.status !== 'completed');
    const inconclusive = unavailable(a) || unavailable(b);
    const reasons = [
      ...(addedFindings.length ? [`New violations: ${addedFindings.join(', ')}`] : []),
      ...(eb.violations > ea.violations ? ['More observed policy violations'] : []),
      ...(eb.critical_violations > ea.critical_violations ? ['More critical violations'] : []),
      ...(lostObligations.length ? [`Lost completed obligations: ${lostObligations.join('; ')}`] : []),
      ...(eb.unnecessary_escalations > ea.unnecessary_escalations ? ['More unnecessary escalations'] : []),
    ];
    const describe = (r: Run) => ({ id:r.id, agent:r.agent, model:r.execution?.model, execution:r.execution?.status ?? 'unsupervised', verdict:evaluate(r).verdict });
    return { case:k, baseline:describe(a), candidate:describe(b), status:inconclusive ? 'inconclusive' : reasons.length ? 'regression' : 'no-regression', reasons, observed_new_violations:addedFindings, tool_call_delta:eb.tool_calls-ea.tool_calls };
  });
  const regressions = rows.filter(r => r.status === 'regression').length;
  const inconclusive = rows.filter(r => r.status === 'inconclusive').length;
  return { comparison_version:'1.0.0', total:rows.length, regressions, inconclusive, exit_code:inconclusive ? 2 : regressions ? 1 : 0, cases:rows, limitation:'Paired observations only, not statistical significance or a safety certification. Replay checks consistency, not authorship. No-regression does not mean passing; inspect both verdicts. Execution errors remain inconclusive even when violations were observed.' };
}
