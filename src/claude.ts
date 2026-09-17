import { startCampaign } from './campaign.js';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { isDeepStrictEqual } from 'node:util';
import { createLabServer } from './server.js';
import { RunStore } from './store.js';
import { newRun, evaluate, finishRun, toolDefinitions } from './engine.js';
import { scenarios, advancedScenarioIds, task } from './scenarios.js';
import { verifyReport } from './replay.js';
import type { CampaignOptions } from './runner.js';

export type ClaudeProcessOptions = { command: string; args: string[]; cwd: string; timeoutMs: number; signal?: AbortSignal; maxBytes?: number; onInit?: (record: any) => boolean };
export async function runClaudeProcess(options: ClaudeProcessOptions) {
  const start = Date.now();
  if (options.signal?.aborted) return { code: null, status: 'cancelled' as const, records: [] as any[], duration_ms: 0 };
  return new Promise<{ code: number | null; status: 'completed' | 'error' | 'timeout' | 'cancelled'; records: any[]; duration_ms: number; error?: string }>(resolveResult => {
    const child = spawn(options.command, options.args, { cwd: options.cwd, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let status: 'completed' | 'error' | 'timeout' | 'cancelled' = 'completed', pending = '', bytes = 0, error: string | undefined;
    const records: any[] = []; let escalation: NodeJS.Timeout | undefined;
    const stop = () => { try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM'); else child.kill(); } catch {} if (!escalation) escalation = setTimeout(() => { try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch {} }, 1000); };
    const fail = (message: string) => { if (status === 'completed') { status = 'error'; error = message; } stop(); };
    const parse = (line: string) => {
      if (!line.trim() || status !== 'completed') return;
      try { const record = JSON.parse(line); records.push(record); if (record.type === 'system' && record.subtype === 'init' && options.onInit && !options.onInit(record)) fail('Claude exposed unexpected tools or MCP servers.'); }
      catch { fail('Claude returned malformed stream JSON.'); }
    };
    const timer = setTimeout(() => { status = 'timeout'; error = 'Agent exceeded the execution timeout.'; stop(); }, options.timeoutMs);
    const abort = () => { status = 'cancelled'; error = 'Cancelled by operator.'; stop(); };
    options.signal?.addEventListener('abort', abort, { once: true });
    child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk: string) => {
      bytes += Buffer.byteLength(chunk); if (bytes > (options.maxBytes ?? 2_000_000)) return fail('Agent exceeded the output limit.');
      pending += chunk; const lines = pending.split('\n'); pending = lines.pop()!; for (const line of lines) parse(line);
    });
    // Provider stderr can contain credentials. Drain it without persisting it.
    child.stderr.on('data', () => {});
    child.on('error', () => { status = 'error'; error = 'Could not launch Claude. Check --claude-command and the Claude Code installation.'; });
    child.on('close', code => { parse(pending); clearTimeout(timer); clearTimeout(escalation); options.signal?.removeEventListener('abort', abort); resolveResult({ code, status, records, duration_ms: Date.now() - start, error }); });
    if (options.signal?.aborted) abort();
  });
}

export async function evaluateClaude(options: CampaignOptions & { command?: string }) {
  if (options.provider !== undefined) throw new Error('--provider is supported by the Hermes runner only. Configure the provider in your Claude Code client; use --model to select its model.');
  if (!Number.isInteger(options.repetitions) || options.repetitions < 1 || options.repetitions > 100 || !Number.isInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 900000) throw new Error('Invalid campaign bounds.');
  const selected = options.scenario === 'all' ? scenarios : options.scenario === 'advanced' ? scenarios.filter(s => (advancedScenarioIds as readonly string[]).includes(s.id)) : scenarios.filter(s => s.id === options.scenario);
  if (!selected.length) throw new Error('Unknown scenario');
  const out = resolve(options.out); await mkdir(out, { recursive: true, mode: 0o700 });
  const prompt = `${task} Start by calling policy_get. When finished, call lab_finish.`;
  const campaignRecord = await startCampaign(out,{...options,adapter:'claude-code',scenarios:selected.map(s=>s.id),task:prompt});
  const store = new RunStore(resolve(options.db)); const server = createLabServer(store);
  const reports: any[] = [];
  const expected = [...Object.keys(toolDefinitions), 'lab_finish'].map(n => `mcp__agent-crash-lab__${n}`).sort();
  const summary = () => ({ mode: 'live-claude', campaign_id:campaignRecord.id, manifest:campaignRecord.file, total: reports.length, passed: reports.filter(r => r.verdict === 'passed').length, failed: reports.filter(r => r.verdict === 'failed').length, incomplete: reports.filter(r => r.verdict === 'incomplete').length, execution_errors: reports.filter(r => r.execution !== 'completed').length, cancelled: Boolean(options.signal?.aborted), reports });
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    campaign: for (let repeat = 0; repeat < options.repetitions; repeat++) for (const scenario of selected) {
      if (options.signal?.aborted) break campaign;
      const run = newRun(scenario.id, options.seed + repeat, 'claude-code');
      run.campaign_id = campaignRecord.id;
      run.execution = { adapter: 'claude-code', status: 'starting', model: options.model }; store.save(run);
      const token = randomBytes(32).toString('hex'); store.authorize(token, run);
      let dir: string | undefined;
      options.log?.(`RUN ${scenario.id} seed=${run.seed}`);
      const sensitive = [token, ...Object.entries(process.env).filter(([k]) => /TOKEN|API_KEY|SECRET/i.test(k)).map(([,v]) => v!).filter(v => v && v.length >= 8)];
      const redact = (value: unknown): string => sensitive.reduce((s, secret) => s.split(secret).join('[REDACTED]'), String(value));
      try {
        dir = await mkdtemp(join(tmpdir(), 'crashlab-claude-'));
        const config = { mcpServers: { 'agent-crash-lab': { command: process.execPath, args: [fileURLToPath(new URL('../dist/cli.js', import.meta.url)), 'mcp'], env: { CRASHLAB_URL: url, CRASHLAB_TOKEN: token } } } };
        await writeFile(join(dir, 'mcp.json'), JSON.stringify(config), { mode: 0o600 });
        const args = ['-p', prompt, '--tools', '', '--mcp-config', join(dir, 'mcp.json'), '--strict-mcp-config', '--setting-sources', 'local', '--permission-mode', 'dontAsk', '--allowedTools', 'mcp__agent-crash-lab', '--max-turns', String(options.maxTurns), '--output-format', 'stream-json', '--verbose'];
        if (options.model) args.push('--model', options.model);
        if (options.systemPrompt) args.push('--append-system-prompt', options.systemPrompt);
        const validInit = (r: any) => isDeepStrictEqual([...(r.tools ?? [])].sort(), expected) && r.mcp_servers?.length === 1 && r.mcp_servers[0].name === 'agent-crash-lab' && r.mcp_servers[0].status === 'connected' && !(r.plugins?.length);
        const result = await runClaudeProcess({ command: options.command ?? 'claude', args, cwd: dir, timeoutMs: options.timeoutMs, signal: options.signal, onInit: validInit });
        const init = result.records.find(r => r.type === 'system' && r.subtype === 'init');
        const final = [...result.records].reverse().find(r => r.type === 'result');
        const toolCalls = result.records.filter(r => r.type === 'assistant').flatMap(r => r.message?.content ?? []).filter(r => r.type === 'tool_use');
        let error = result.error;
        if (!error && (!init || !validInit(init))) error = 'Claude did not confirm the isolated lab tool connection.';
        if (!error && (result.code !== 0 || !final || final.is_error)) error = redact(JSON.stringify(final?.errors ?? final?.result ?? 'Claude exited without a successful result. Check authentication with claude auth login.')).slice(0, 2000);
        const current = store.get(run.id)!;
        // Argument comparison is structural, independent of JSON key ordering.
        const remaining = [...current.events];
        for (const c of toolCalls.filter(c => c.name !== 'mcp__agent-crash-lab__lab_finish')) {
          const index = remaining.findIndex(e => e.tool === c.name.replace('mcp__agent-crash-lab__', '') && isDeepStrictEqual(e.arguments, c.input));
          if (index < 0) { error ??= 'Model trace differs from recorded tool events.'; break; } remaining.splice(index, 1);
        }
        if (remaining.length) error ??= 'Recorded events are missing from the model trace.';
        if (!error && (current.status !== 'completed' || toolCalls[0]?.name !== expected.find(n => n.endsWith('__policy_get')) || toolCalls.at(-1)?.name !== 'mcp__agent-crash-lab__lab_finish')) error = 'Agent did not complete the policy-first, lab_finish-last protocol.';
        store.mutate(run.id, r => {
          r.execution = { adapter: 'claude-code', status: result.status !== 'completed' ? result.status : error ? 'error' : 'completed', model: init?.model ?? options.model, runtime_version: init?.claude_code_version, duration_ms: result.duration_ms, exit_code: result.code, error, tool_surface: init?.tools, transport: 'Claude Code → stdio MCP → local simulation' };
          finishRun(r, error ? 'Claude execution failed' : 'Supervised Claude run finished');
        });
        // Persist only tool-call evidence, not raw provider output or usage-cost telemetry.
        await writeFile(join(out, `${run.id}.trace.json`), redact(JSON.stringify({ tool_calls: toolCalls.map(c => ({ name: c.name, input: c.input })), verified_tool_surface: Boolean(init && validInit(init)) }, null, 2)), { mode: 0o600 });
      } catch (e) {
        store.mutate(run.id, r => { r.execution = { adapter: 'claude-code', status: 'error', error: redact((e as Error).message) }; finishRun(r, 'Claude runner failed'); });
      } finally { if (dir) await rm(dir, { recursive: true, force: true }); }
      const current = store.get(run.id)!; const report = { ...current, evaluation: evaluate(current), report_version: '1.0.0' };
      verifyReport(report);
      await writeFile(join(out, `${run.id}.json`), JSON.stringify(report, null, 2), { mode: 0o600 });
      await campaignRecord.record(report);
      reports.push({ id: run.id, scenario: scenario.id, seed: run.seed, verdict: report.evaluation.verdict, execution: current.execution?.status, error: current.execution?.error, tool_calls: current.events.length });
      await writeFile(join(out, 'summary.json'), JSON.stringify(summary(), null, 2), { mode: 0o600 });
      options.log?.(`${report.evaluation.verdict.toUpperCase()} ${scenario.id} · ${current.events.length} tool calls`);
      if (current.execution?.status !== 'completed') break campaign;
    }
  } finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); store.close(); await campaignRecord.finish(Boolean(options.signal?.aborted)); }
  await writeFile(join(out, 'summary.json'), JSON.stringify(summary(), null, 2), { mode: 0o600 });
  return summary();
}
