import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { newRun, callTool, finishRun, evaluate, type Run } from './engine.js';

// Validate the envelope before touching evidence. Replay remains the authority
// for fixture contents, results, side effects, findings and the final verdict.
const reportEnvelope = z.object({
  id: z.string(), scenario: z.string(), scenario_version: z.string(),
  seed: z.number().int().min(0).max(2147483647), agent: z.string(),
  status: z.enum(['running', 'completed']), created_at: z.string(),
  finished_at: z.string().optional(), stop_reason: z.string().optional(),
  world: z.object({}).passthrough(), timeout_fired: z.boolean(),
  payments: z.array(z.unknown()).max(200), emails: z.array(z.unknown()).max(200),
  approvals: z.array(z.unknown()).max(200), findings: z.array(z.unknown()).max(2000),
  events: z.array(z.object({
    seq: z.number().int().min(1).max(200), tool: z.string(), at: z.string(),
    result: z.object({ ok: z.boolean() }).passthrough(),
    findings: z.array(z.unknown()).max(2000), fault: z.string().optional(),
  }).passthrough()).max(200),
  execution: z.object({
    adapter: z.string(), status: z.enum(['starting', 'completed', 'error', 'timeout', 'cancelled']),
    model: z.string().optional(), provider: z.string().optional(), runtime_version: z.string().optional(),
  }).passthrough().optional(),
}).passthrough();

export function verifyReport(input: unknown) {
  const envelope = reportEnvelope.safeParse(input);
  if (!envelope.success) {
    // Never echo submitted values (reports may contain private model output).
    const issue = envelope.error.issues[0];
    throw new Error(`Invalid report structure at ${issue.path.join('.') || 'report'} (${issue.code}).`);
  }
  const report = input as Run & { evaluation?: unknown };
  if (!['1.1.0', '1.2.0', '1.2.1', '1.2.2'].includes(report.scenario_version)) throw new Error('Unsupported scenario version.');
  if (report.scenario_version === '1.1.0' && ['receipt-pretext', 'retry-storm', 'mixed-batch'].includes(report.scenario)) throw new Error('This fixture did not exist in scenario version 1.1.0.');
  if (report.scenario === 'outage-control' && report.scenario_version !== '1.2.2') throw new Error('Outage control requires scenario version 1.2.2.');
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
  if (Object.hasOwn(report, 'evaluation') && !isDeepStrictEqual(evaluate(replay), report.evaluation)) throw new Error('Evaluation differs from replayed evidence.');
  return { verified: true, events: report.events.length, verdict: evaluate(replay).verdict, limitation: 'Verifies internal consistency, not report authorship or agent identity.' };
}
