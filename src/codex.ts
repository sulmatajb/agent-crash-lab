import { spawn, execFile } from 'node:child_process';
import { promisify, isDeepStrictEqual } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { startCampaign } from './campaign.js';
import { createLabServer } from './server.js';
import { RunStore } from './store.js';
import { newRun, evaluate, finishRun, toolDefinitions } from './engine.js';
import { scenarios, advancedScenarioIds, task } from './scenarios.js';
import { verifyReport } from './replay.js';
import type { CampaignOptions } from './runner.js';

const toolNames = [...Object.keys(toolDefinitions), 'lab_finish'].sort();
const serverName = 'agent-crash-lab';
const capture = promisify(execFile);
export type CodexOptions = Omit<CampaignOptions, 'maxTurns'> & { command?: string; maxToolCalls: number };

/** Local help/version inspection only; does not log in or make an inference request. */
export async function inspectCodex(command = 'codex') {
  try {
    const options = { timeout: 5000, maxBuffer: 128 * 1024, encoding: 'utf8' as const };
    const { stdout: version } = await capture(command, ['--version'], options);
    const { stdout: help } = await capture(command, ['exec', '--help'], options);
    for (const flag of ['--ignore-user-config', '--ignore-rules', '--ephemeral', '--json', '--skip-git-repo-check']) {
      if (!help.includes(flag)) throw new Error('Unsupported Codex CLI');
    }
    if (!/^codex-cli \d+\.\d+\.\d+(?:[^\r\n]*)?\s*$/.test(version)) throw new Error('Unrecognized Codex CLI version');
    return version.trim();
  } catch {
    throw new Error('Codex CLI needs exec --ignore-user-config, --ignore-rules, --ephemeral and --json. Check your installation and --codex-command; the adapter was checked with codex-cli 0.158.0.');
  }
}

/** Exported so the exact launch configuration can be checked without inference. */
export function codexArgs(model: string, prompt: string, systemPrompt?: string) {
  const args = ['exec', '--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '--json', '--color', 'never', '--sandbox', 'read-only', '--model', model];
  const config = (key: string, value: unknown) => args.push('-c', `${key}=${JSON.stringify(value)}`);
  config('approval_policy', 'never');
  config('web_search', 'disabled');
  config('project_doc_max_bytes', 0);
  for (const name of ['shell_tool', 'unified_exec', 'apply_patch_freeform', 'js_repl', 'code_mode', 'apps', 'plugins', 'memories', 'multi_agent', 'multi_agent_v2', 'search_tool', 'tool_search', 'view_image', 'hooks', 'plugin_hooks', 'goals', 'default_mode_request_user_input', 'image_generation', 'computer_use', 'browser_use']) config(`features.${name}`, false);
  config('features.skip_host_skill_discovery', true);
  config('skills.include_instructions', false);
  config('suppress_unstable_features_warning', true);
  config('tools.experimental_request_user_input.enabled', false);
  config('tools.update_plan.enabled', false);
  config(`mcp_servers.${serverName}.command`, process.execPath);
  config(`mcp_servers.${serverName}.args`, [fileURLToPath(new URL('../dist/cli.js', import.meta.url)), 'mcp']);
  config(`mcp_servers.${serverName}.env_vars`, ['CRASHLAB_URL', 'CRASHLAB_TOKEN']);
  config(`mcp_servers.${serverName}.required`, true);
  config(`mcp_servers.${serverName}.default_tools_approval_mode`, 'approve');
  config(`mcp_servers.${serverName}.enabled_tools`, toolNames);
  config(`mcp_servers.${serverName}.supports_parallel_tool_calls`, false);
  if (systemPrompt !== undefined) config('developer_instructions', systemPrompt);
  args.push(prompt);
  return args;
}

type ProcessOptions = { command: string; args: string[]; cwd: string; env?: NodeJS.ProcessEnv; timeoutMs: number; signal?: AbortSignal; maxBytes?: number; onRecord?: (record: any) => string | undefined };
export async function runCodexProcess(options: ProcessOptions) {
  const start = Date.now();
  if (options.signal?.aborted) return { code: null, status: 'cancelled' as const, records: [] as any[], duration_ms: 0 };
  return new Promise<{ code: number | null; status: 'completed' | 'error' | 'timeout' | 'cancelled'; records: any[]; duration_ms: number; error?: string }>(resolveResult => {
    const child = spawn(options.command, options.args, { cwd: options.cwd, env: options.env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let status: 'completed' | 'error' | 'timeout' | 'cancelled' = 'completed', pending = '', bytes = 0, error: string | undefined;
    const records: any[] = []; let escalation: NodeJS.Timeout | undefined;
    const stop = () => {
      try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM'); else child.kill(); } catch {}
      if (!escalation) escalation = setTimeout(() => { try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch {} }, 1000);
    };
    const fail = (message: string) => { if (status === 'completed') { status = 'error'; error = message; } stop(); };
    const parse = (line: string) => {
      if (!line.trim() || status !== 'completed') return;
      try {
        const record = JSON.parse(line);
        if (!record || typeof record !== 'object' || typeof record.type !== 'string') return fail('Codex returned an invalid event.');
        records.push(record); const problem = options.onRecord?.(record); if (problem) fail(problem);
      } catch { fail('Codex returned malformed stream JSON.'); }
    };
    const timer = setTimeout(() => { if (status === 'completed') { status = 'timeout'; error = 'Agent exceeded the execution timeout.'; } stop(); }, options.timeoutMs);
    const abort = () => { status = 'cancelled'; error = 'Cancelled by operator.'; stop(); };
    options.signal?.addEventListener('abort', abort, { once: true });
    child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk: string) => {
      bytes += Buffer.byteLength(chunk); if (bytes > (options.maxBytes ?? 2_000_000)) return fail('Agent exceeded the output limit.');
      pending += chunk; const lines = pending.split('\n'); pending = lines.pop()!; for (const line of lines) parse(line);
    });
    // Never retain provider stderr: it may contain credentials or private context.
    child.stderr.on('data', chunk => { bytes += chunk.length; if (bytes > (options.maxBytes ?? 2_000_000)) fail('Agent exceeded the output limit.'); });
    child.on('error', () => { status = 'error'; error = 'Could not launch Codex. Check --codex-command and the Codex CLI installation.'; });
    child.on('close', code => { parse(pending); clearTimeout(timer); clearTimeout(escalation); options.signal?.removeEventListener('abort', abort); resolveResult({ code, status, records, duration_ms: Date.now() - start, error }); });
    if (options.signal?.aborted) abort();
  });
}

export async function evaluateCodex(options: CodexOptions) {
  if (!options.model || !options.model.trim()) throw new Error('evaluate-codex requires --model with the exact model you intend to evaluate.');
  if (options.provider !== undefined) throw new Error('--provider is supported by the Hermes runner only.');
  if (!Number.isInteger(options.maxToolCalls) || options.maxToolCalls < 1 || options.maxToolCalls > 100) throw new Error('--max-tool-calls must be 1–100.');
  const selected = options.scenario === 'all' ? scenarios : options.scenario === 'advanced' ? scenarios.filter(s => (advancedScenarioIds as readonly string[]).includes(s.id)) : scenarios.filter(s => s.id === options.scenario);
  if (!selected.length) throw new Error('Unknown scenario');
  const runtimeVersion = await inspectCodex(options.command);
  const out = resolve(options.out); await mkdir(out, { recursive: true, mode: 0o700 });
  const prompt = `${task} Start by calling policy_get. When finished, call lab_finish.`;
  const campaignRecord = await startCampaign(out, { ...options, adapter: 'codex-cli', scenarios: selected.map(s => s.id), maxTurns: null, task: prompt });
  const store = new RunStore(resolve(options.db)); const server = createLabServer(store);
  const reports: any[] = [];
  const summary = () => ({ mode: 'live-codex', campaign_id: campaignRecord.id, manifest: campaignRecord.file, total: reports.length, passed: reports.filter(r => r.verdict === 'passed').length, failed: reports.filter(r => r.verdict === 'failed').length, incomplete: reports.filter(r => r.verdict === 'incomplete').length, execution_errors: reports.filter(r => r.execution !== 'completed').length, cancelled: Boolean(options.signal?.aborted), reports });
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    campaign: for (let repeat = 0; repeat < options.repetitions; repeat++) for (const scenario of selected) {
      if (options.signal?.aborted) break campaign;
      const run = newRun(scenario.id, options.seed + repeat, 'codex-cli'); run.campaign_id = campaignRecord.id;
      run.execution = { adapter: 'codex-cli', status: 'starting', runtime_version: runtimeVersion }; store.save(run);
      const token = randomBytes(32).toString('hex'); store.authorize(token, run);
      let dir: string | undefined;
      options.log?.(`RUN ${scenario.id} seed=${run.seed}`);
      const sensitive = [token, ...Object.entries(process.env).filter(([k]) => /TOKEN|API_KEY|SECRET/i.test(k)).map(([, v]) => v!).filter(v => v && v.length >= 8)];
      const redact = (value: unknown): string => sensitive.reduce((s, secret) => s.split(secret).join('[REDACTED]'), String(value));
      try {
        dir = await mkdtemp(join(tmpdir(), 'crashlab-codex-'));
        const calls = new Set<string>();
        const onRecord = (r: any): string | undefined => {
          if (r.type === 'error' || r.type === 'turn.failed') return 'Codex reported an execution failure. Check authentication with codex login status.';
          if (!['item.started', 'item.updated', 'item.completed'].includes(r.type)) return;
          const item = r.item;
          if (!item || typeof item.id !== 'string') return 'Codex returned an invalid item.';
          if (item.type !== 'mcp_tool_call') {
            if (!['agent_message', 'reasoning', 'todo_list', 'error'].includes(item.type)) return 'Codex used an unexpected tool or item type.';
            return;
          }
          if (item.server !== serverName || !toolNames.includes(item.tool)) return 'Codex used a tool outside the lab.';
          calls.add(item.id);
          if (calls.size > options.maxToolCalls) return 'Agent exceeded --max-tool-calls.';
          // Codex marks an MCP isError result as failed even when transport succeeded.
          // Retain it for comparison with the authoritative scenario result below.
          if (r.type === 'item.completed' && (item.error || !item.result || !['completed', 'failed'].includes(item.status))) return 'Codex reported an unsuccessful MCP transport call.';
        };
        const result = await runCodexProcess({ command: options.command ?? 'codex', args: codexArgs(options.model, prompt, options.systemPrompt), cwd: dir, env: { ...process.env, CRASHLAB_URL: url, CRASHLAB_TOKEN: token, CRASHLAB_RESOURCES: '0' }, timeoutMs: options.timeoutMs, signal: options.signal, onRecord });
        const toolCalls = result.records.filter(r => r.type === 'item.completed' && r.item?.type === 'mcp_tool_call').map(r => r.item);
        let error = result.error;
        if (!error && (result.code !== 0 || !result.records.some(r => r.type === 'thread.started') || !result.records.some(r => r.type === 'turn.completed'))) error = 'Codex exited without a completed turn.';
        if (!error && (new Set(toolCalls.map(c => c.id)).size !== toolCalls.length || toolCalls.length !== calls.size)) error = 'Codex tool-call evidence is missing or duplicated.';
        const current = store.get(run.id)!;
        const businessCalls = toolCalls.filter(c => c.tool !== 'lab_finish');
        const labResult = (c: any): unknown => {
          try { return c.result?.content?.length === 1 && c.result.content[0].type === 'text' ? JSON.parse(c.result.content[0].text) : undefined; } catch { return undefined; }
        };
        if (!error && (businessCalls.length !== current.events.length || businessCalls.some((c, i) => c.tool !== current.events[i].tool || !isDeepStrictEqual(c.arguments, current.events[i].arguments) || !isDeepStrictEqual(labResult(c), current.events[i].result) || c.status !== (current.events[i].result.ok ? 'completed' : 'failed')))) error = 'Codex tool-call evidence differs from recorded lab events.';
        if (!error && (current.status !== 'completed' || toolCalls[0]?.tool !== 'policy_get' || toolCalls.at(-1)?.tool !== 'lab_finish' || toolCalls.filter(c => c.tool === 'lab_finish').length !== 1 || toolCalls.at(-1)?.status !== 'completed' || (labResult(toolCalls.at(-1)) as any)?.status !== 'completed')) error = 'Agent did not complete the policy-first, lab_finish-last protocol.';
        store.mutate(run.id, r => {
          r.execution = { adapter: 'codex-cli', status: result.status !== 'completed' ? result.status : error ? 'error' : 'completed', runtime_version: runtimeVersion, duration_ms: result.duration_ms, exit_code: result.code, error, transport: 'Codex CLI → stdio MCP → local simulation' };
          finishRun(r, error ? 'Codex execution failed' : 'Supervised Codex run finished');
        });
        await writeFile(join(out, `${run.id}.trace.json`), redact(JSON.stringify({ tool_calls: toolCalls.map(c => ({ name: c.tool, input: c.arguments })), configured_tools: toolNames, verified_tool_surface: false, limitation: 'Codex exec JSONL does not attest the complete tool catalog or resolved model. Only observed lab calls are cross-checked against recorded events; the requested model is in the campaign manifest.' }, null, 2)), { mode: 0o600 });
      } catch {
        store.mutate(run.id, r => { r.execution = { adapter: 'codex-cli', status: 'error', runtime_version: runtimeVersion, error: 'Codex runner failed before evidence could be completed.' }; finishRun(r, 'Codex runner failed'); });
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
