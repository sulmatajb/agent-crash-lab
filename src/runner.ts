import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { createLabServer } from './server.js';
import { RunStore } from './store.js';
import { newRun, evaluate, finishRun, toolDefinitions, type Run } from './engine.js';
import { scenarios, task, type ScenarioId } from './scenarios.js';

const adapter = fileURLToPath(new URL('../adapters/hermes.py', import.meta.url));
export const defaultHermesPython = join(homedir(), '.hermes/hermes-agent/venv/bin/python');
export const defaultHermesProfile = join(homedir(), '.hermes');
export type AdapterResult = { code: number | null; timedOut: boolean; cancelled: boolean; records: any[]; duration_ms: number };

export async function runAdapter(command: string, args: string[], request: unknown, timeoutMs: number, signal?: AbortSignal): Promise<AdapterResult> {
  const start = performance.now();
  if (signal?.aborted) return { code:null, timedOut:false, cancelled:true, records:[], duration_ms:0 };
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    const records: any[] = []; let pending = '', bytes = 0, timedOut = false, cancelled = false;
    let escalation: NodeJS.Timeout | undefined;
    let stopping = false;
    const kill = () => {
      if (stopping) return;
      stopping = true;
      try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM'); else child.kill('SIGTERM'); } catch {}
      escalation = setTimeout(() => { try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch {} }, 1000);
    };
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
    const abort = () => { cancelled = true; kill(); }; signal?.addEventListener('abort', abort, { once: true });
    const parse = (line: string) => { if (line.startsWith('CRASHLAB:')) { try { records.push(JSON.parse(line.slice(9))); } catch {} } };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      bytes += Buffer.byteLength(chunk); if (bytes > 2_000_000) { timedOut = true; kill(); return; }
      pending += chunk.toString();
      const lines = pending.split('\n'); pending = lines.pop()!;
      for (const line of lines) parse(line);
    });
    // Drain library logs, but don't persist arbitrary provider output or secrets.
    child.stderr.on('data', chunk => { bytes += Buffer.byteLength(chunk); if (bytes > 2_000_000) { timedOut = true; kill(); } });
    child.stdin.on('error', () => {});
    const clean = () => { clearTimeout(timer); clearTimeout(escalation); signal?.removeEventListener('abort', abort); };
    child.on('error', error => { clean(); reject(error); });
    child.on('close', code => { if (!timedOut && !cancelled) parse(pending); clean(); resolveResult({ code, timedOut, cancelled, records, duration_ms: Math.round(performance.now() - start) }); });
    child.stdin.end(JSON.stringify(request));
    if (signal?.aborted) abort();
  });
}

export async function hermesDoctor(python = defaultHermesPython, profile = defaultHermesProfile) {
  const result = await runAdapter(python, [adapter], { mode: 'doctor', profile }, 15000);
  const record = result.records.find(r => r.kind === 'doctor');
  if (!record) throw new Error(result.records.find(r => r.kind === 'error')?.message ?? 'Hermes doctor could not run; check --hermes-python and its installed dependencies.');
  return record;
}

export type CampaignOptions = { python?: string; profile?: string; scenario: string; seed: number; repetitions: number; timeoutMs: number; maxTurns: number; out: string; db: string; probe?: boolean; model?: string; provider?: string; systemPrompt?: string; signal?: AbortSignal; log?: (line: string) => void };
export async function evaluateHermes(options: CampaignOptions) {
  const selected = options.scenario === 'all' ? scenarios : scenarios.filter(s => s.id === options.scenario);
  if (!selected.length) throw new Error('Unknown scenario');
  const out = resolve(options.out); await mkdir(out, { recursive: true, mode: 0o700 });
  const store = new RunStore(resolve(options.db));
  const server = createLabServer(store);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const runs: (Run & { evaluation: ReturnType<typeof evaluate> })[] = [];
  try {
    campaign: for (let repeat = 0; repeat < options.repetitions; repeat++) for (const scenario of selected) {
      if (options.signal?.aborted) break campaign;
      const run = newRun(scenario.id as ScenarioId, options.seed + repeat, options.probe ? 'hermes-transport-probe' : 'hermes');
      run.execution = { adapter: 'hermes', status: 'starting', model: options.model, provider: options.provider };
      store.save(run);
      const token = randomBytes(32).toString('hex'); store.authorize(token, run);
      const home = await mkdtemp(join(tmpdir(), 'crashlab-hermes-'));
      options.log?.(`${options.probe ? 'PROBE' : 'RUN'} ${scenario.id} seed=${run.seed}`);
      try {
        const result = await runAdapter(options.python ?? defaultHermesPython, [adapter], {
          mode: options.probe ? 'probe' : 'evaluate', profile: options.profile ?? defaultHermesProfile,
          home, node: process.execPath, cli: fileURLToPath(new URL('../dist/cli.js', import.meta.url)),
          url, token, tools: Object.keys(toolDefinitions), task: `${task} Start with policy_get. When done, call lab_finish.`,
          model: options.model, provider: options.provider, max_turns: options.maxTurns, system_prompt: options.systemPrompt
        }, options.timeoutMs, options.signal);
        const ready = result.records.find(r => r.kind === 'ready');
        const runtime = result.records.find(r => r.kind === 'runtime');
        const final = result.records.find(r => r.kind === (options.probe ? 'probe' : 'result'));
        const error = result.records.find(r => r.kind === 'error');
        store.mutate(run.id, current => {
          current.execution = { adapter: 'hermes', status: result.cancelled ? 'cancelled' : result.timedOut ? 'timeout' : result.code !== 0 || !final ? 'error' : 'completed',
            model: runtime?.model ?? ready?.model, provider: runtime?.provider ?? ready?.provider, runtime_version: ready?.hermes_version, final_response: final?.final_response, duration_ms: result.duration_ms, exit_code: result.code,
            error: error?.message ?? (result.timedOut ? 'Agent exceeded execution time/output bound.' : !final ? 'Adapter did not return a completion record.' : undefined),
            tool_surface: ready?.tools, configuration_sha256: ready?.configuration_sha256, transport: ready?.transport, usage: final?.usage };
          finishRun(current, options.probe ? 'Transport probe only; no model evaluated' : 'Supervised Hermes run finished');
        });
      } catch (error) {
        store.mutate(run.id, current => { current.execution = { adapter: 'hermes', status: 'error', error: (error as Error).message }; finishRun(current, 'Adapter launch failed'); });
      } finally { await rm(home, { recursive: true, force: true }); }
      const current = store.get(run.id)!;
      const report = { ...current, evaluation: evaluate(current) };
      runs.push(report);
      await writeFile(join(out, `${current.id}.json`), JSON.stringify(report, null, 2), { mode: 0o600 });
      options.log?.(`${options.probe ? (current.execution?.status === 'completed' ? 'CONNECTED' : 'ERROR') : report.evaluation.verdict.toUpperCase()} ${scenario.id} · ${report.events.length} tool calls`);
      // Authentication/configuration failures must not burn through the entire suite.
      if (current.execution?.status === 'error') break campaign;
    }
  } finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); store.close(); }
  const summary = { mode: options.probe ? 'transport-probe-no-model' : 'live-hermes', total: runs.length, passed: runs.filter(r => r.evaluation.verdict === 'passed').length, failed: runs.filter(r => r.evaluation.verdict === 'failed').length, incomplete: runs.filter(r => r.evaluation.verdict === 'incomplete').length, execution_errors: runs.filter(r => r.execution?.status !== 'completed').length, cancelled: Boolean(options.signal?.aborted), reports: runs.map(r => ({ id: r.id, scenario: r.scenario, verdict: r.evaluation.verdict, execution: r.execution })) };
  await writeFile(join(out, 'summary.json'), JSON.stringify(summary, null, 2), { mode: 0o600 });
  return summary;
}
