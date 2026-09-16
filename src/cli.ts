#!/usr/bin/env node
import { resolve } from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { newRun, evaluate } from './engine.js';
import { scenarios, type ScenarioId } from './scenarios.js';
import { runScripted } from './agents.js';

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    port: { type: 'string', default: '4310' }, db: { type: 'string', default: '.crashlab/runs.sqlite' },
    agent: { type: 'string', default: 'careful' }, scenario: { type: 'string', default: 'all' },
    seed: { type: 'string', default: '42' }, runs: { type: 'string', default: '1' },
    json: { type: 'boolean', default: false }, out: { type: 'string' }, help: { type: 'boolean', short: 'h' },
    'claude-command': { type: 'string' }, 'hermes-python': { type: 'string' }, 'hermes-profile': { type: 'string' }, model: { type: 'string' }, provider: { type: 'string' },
    timeout: { type: 'string', default: '180' }, 'max-turns': { type: 'string', default: '30' },
    'system-prompt': { type: 'string' }, worlds: { type: 'string', default: '100' }, concurrency: { type: 'string', default: '16' }
  } });
  const command = positionals[0] ?? 'help';
  if (command === 'help' || values.help) {
    console.log('Live-agent commands:\n  doctor             Inspect Hermes installation/configuration without inference\n  probe              Verify actual Hermes MCP discovery/call; no model inference\n  evaluate-claude    Launch isolated Claude Code (all/advanced/scenario ID)\n  evaluate           Launch and supervise Hermes against the selected scenarios\n  stress             Load-test HTTP, MCP, persistence and ledger invariants\n  compare BEFORE AFTER Compare verified reports or campaign directories\n  verify REPORT.json Replay exported evidence and check its consistency\n\nHermes options: --hermes-python PATH --hermes-profile DIR --model ID --provider NAME\n  --timeout 180 --max-turns 30 --system-prompt FILE --out DIRECTORY\nStress options: --worlds 100 --concurrency 16 --out REPORT.json\n');
    console.log(`Agent Crash Lab 0.3.2\n\nUsage: agent-crash-lab <command> [options]\n\n  start              Start the local dashboard (http://127.0.0.1:4310)\n  demo               Seed a careful/reckless comparison and start dashboard\n  test               Run scripted reference agents headlessly\n  mcp                Start the stdio MCP bridge for an external run\n  scenarios          List the vendor-payment scenarios\n\nOptions:\n  --port 4310        Local server port\n  --db PATH          SQLite store (default .crashlab/runs.sqlite)\n  --agent NAME       careful | reckless (test only)\n  --scenario ID      Scenario ID or all (test/evaluate)\n  --seed 42          Seed from 0 to 2147483647\n  --runs 1           Repetitions, incrementing seeds (max 100)\n  --json             Print machine-readable test results\n  --out PATH         Save full JSON evidence\n\nTest exits: 0 all passed; 1 failed/incomplete; 2 usage/runtime error.\nReference agents are deterministic scripts, not language models.\nConnect your own agent from the dashboard; no model keys are needed by the lab.`); return;
  }
  if (command === 'mcp') { const { startMcp } = await import('./mcp.js'); await startMcp(); return; }
  if (command === 'scenarios') { for (const s of scenarios) console.log(`${s.id.padEnd(20)} ${s.title}`); return; }
  if (command === 'doctor') { const { hermesDoctor } = await import('./runner.js'); console.log(JSON.stringify(await hermesDoctor(values['hermes-python'], values['hermes-profile']), null, 2)); return; }
  if (command === 'stress') { const { stressLab } = await import('./stress.js'); console.log(JSON.stringify(await stressLab({ worlds: Number(values.worlds), concurrency: Number(values.concurrency), out: values.out }), null, 2)); return; }
  if (command === 'compare') {
    if (positionals.length !== 3) throw new Error('Usage: agent-crash-lab compare BASELINE CANDIDATE [--json] [--out comparison.json]');
    const { loadReports, compareReports } = await import('./compare.js');
    const result = compareReports(loadReports(positionals[1]), loadReports(positionals[2]));
    if (values.out) writeFileSync(resolve(values.out), JSON.stringify(result, null, 2));
    if (values.json) console.log(JSON.stringify(result, null, 2));
    else {
      for (const row of result.cases) console.log(`${row.status.toUpperCase().padEnd(14)} ${row.case} ${row.baseline.verdict} → ${row.candidate.verdict}${row.reasons.length ? `\n  ${row.reasons.join('\n  ')}` : ''}`);
      console.log(`\n${result.total} paired cases · ${result.regressions} regressions · ${result.inconclusive} inconclusive\n${result.limitation}`);
    }
    process.exitCode = result.exit_code; return;
  }
  if (command === 'verify') { if (!positionals[1]) throw new Error('Usage: agent-crash-lab verify REPORT.json'); const { verifyReport } = await import('./replay.js'); console.log(JSON.stringify(verifyReport(JSON.parse(readFileSync(positionals[1], 'utf8'))), null, 2)); return; }
  const seed = Number(values.seed), repetitions = Number(values.runs);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 2147483647) throw new Error('Invalid --seed');
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100 || seed + repetitions - 1 > 2147483647) throw new Error('Invalid --runs or seed range');
  if (command === 'evaluate' || command === 'probe' || command === 'evaluate-claude') {
    const timeout = Number(values.timeout), maxTurns = Number(values['max-turns']);
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 900 || !Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 100) throw new Error('Timeout must be 1–900 seconds and max-turns 1–100.');
    const { evaluateHermes } = await import('./runner.js'); const controller = new AbortController();
    const cancel = () => controller.abort(); process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
    try {
      const runner = command === 'evaluate-claude' ? (await import('./claude.js')).evaluateClaude : evaluateHermes;
      const summary = await runner({ command: values['claude-command'], python: values['hermes-python'], profile: values['hermes-profile'], scenario: command === 'probe' && values.scenario === 'all' ? 'clean-control' : values.scenario!, seed, repetitions, timeoutMs: timeout * 1000, maxTurns, out: values.out ?? '.crashlab/evaluations', db: values.db!, probe: command === 'probe', model: values.model, provider: values.provider, systemPrompt: values['system-prompt'] ? readFileSync(values['system-prompt'], 'utf8') : undefined, signal: controller.signal, log: values.json ? undefined : line => console.error(line) });
      console.log(JSON.stringify(summary, null, 2));
      process.exitCode = summary.cancelled ? 130 : summary.execution_errors ? 2 : command === 'probe' || summary.passed === summary.total ? 0 : 1;
    } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
    return;
  }
  if (command === 'test') {
    if (!['careful', 'reckless'].includes(values.agent!)) throw new Error('--agent must be careful or reckless. External agent setup is available in the dashboard.');
    const selected = values.scenario === 'all' ? scenarios : scenarios.filter(s => s.id === values.scenario);
    if (!selected.length) throw new Error('Unknown --scenario. Use the scenarios command.');
    const results = [];
    for (let i = 0; i < repetitions; i++) for (const s of selected) {
      const run = runScripted(newRun(s.id as ScenarioId, seed + i, values.agent!), values.agent as 'careful' | 'reckless');
      results.push({ ...run, evaluation: evaluate(run) });
    }
    const summary = { total: results.length, passed: results.filter(r => r.evaluation.verdict === 'passed').length, failed: results.filter(r => r.evaluation.verdict === 'failed').length, incomplete: results.filter(r => r.evaluation.verdict === 'incomplete').length };
    if (values.out) writeFileSync(resolve(values.out), JSON.stringify({ report_version: '1.0.0', summary, runs: results }, null, 2));
    if (values.json) console.log(JSON.stringify({ summary, runs: results }));
    else { for (const r of results) console.log(`${r.evaluation.verdict.toUpperCase().padEnd(10)} ${r.scenario.padEnd(20)} seed=${r.seed} violations=${r.evaluation.violations}`); console.log(`\n${summary.passed}/${summary.total} passed · ${summary.failed} failed · ${summary.incomplete} incomplete`); }
    process.exitCode = summary.passed === summary.total ? 0 : 1; return;
  }
  if (!['start', 'demo'].includes(command)) throw new Error(`Unknown command: ${command}`);
  const port = Number(values.port); if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid --port');
  const { RunStore } = await import('./store.js');
  const { createLabServer } = await import('./server.js');
  const store = new RunStore(resolve(values.db!));
  if (command === 'demo' && !store.list().length) for (const agent of ['reckless', 'careful'] as const) { const r = runScripted(newRun('payment-timeout', seed, agent), agent); store.save(r); }
  const server = createLabServer(store);
  server.on('error', error => { console.error(error.message); store.close(); process.exitCode = 2; });
  server.listen(port, '127.0.0.1', () => { const addr = server.address(); console.log(`\n  AGENT CRASH LAB\n  http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : port}\n\n  Synthetic money. Real evidence.\n  Data: ${resolve(values.db!)}\n  Ctrl+C to stop.\n`); });
  const stop = () => server.close(() => { store.close(); process.exit(0); });
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
main().catch(error => { console.error(`Crash Lab: ${error.message}`); process.exitCode = 2; });
