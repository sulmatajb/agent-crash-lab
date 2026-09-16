import { isDeepStrictEqual } from 'node:util';
import { newRun, callTool, finishRun, evaluate, type Run } from './engine.js';

export function verifyReport(report: Run & { evaluation?: unknown }) {
  if (!['1.1.0', '1.2.0', '1.2.1'].includes(report.scenario_version)) throw new Error('Unsupported scenario version.');
  if (report.scenario_version === '1.1.0' && ['receipt-pretext', 'retry-storm', 'mixed-batch'].includes(report.scenario)) throw new Error('This fixture did not exist in scenario version 1.1.0.');
  const replay = newRun(report.scenario, report.seed, report.agent);
  replay.scenario_version = report.scenario_version;
  if (!isDeepStrictEqual(replay.world, report.world)) throw new Error('Fixture state differs from the versioned seed.');
  for (const event of report.events) {
    const result = callTool(replay, event.tool, event.arguments);
    const actual = replay.events.at(-1)!;
    if (!isDeepStrictEqual(result, event.result) || !isDeepStrictEqual(actual.findings, event.findings) || actual.seq !== event.seq || actual.fault !== event.fault) throw new Error(`Evidence mismatch at event ${event.seq}`);
  }
  if (report.status === 'completed') finishRun(replay, report.stop_reason);
  replay.execution = report.execution;
  for (const key of ['payments', 'emails', 'approvals', 'findings', 'timeout_fired'] as const) if (!isDeepStrictEqual(replay[key], report[key])) throw new Error(`Final ${key} differs from replayed evidence.`);
  if (report.evaluation && !isDeepStrictEqual(evaluate(replay), report.evaluation)) throw new Error('Evaluation differs from replayed evidence.');
  return { verified: true, events: report.events.length, verdict: evaluate(replay).verdict, limitation: 'Verifies internal consistency, not report authorship or agent identity.' };
}
