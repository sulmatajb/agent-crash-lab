import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';
import { RunStore } from './store.js';
import { callTool, evaluate, finishRun, newRun } from './engine.js';
import { runScripted } from './agents.js';
import { verifyReport } from './replay.js';
import { compareReports } from './compare.js';
import { scenarios, policy, task, type ScenarioId } from './scenarios.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const cliPath = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const scenarioSchema = z.enum(scenarios.map(s => s.id) as [ScenarioId, ...ScenarioId[]]);
const runSchema = z.object({ scenario: scenarioSchema, agent: z.enum(['careful', 'reckless', 'external']), seed: z.number().int().min(0).max(2147483647).default(42) }).strict();
const equal = (a: string, b: string) => Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
class RequestInputError extends Error {}

async function body(req: IncomingMessage, limit = 65536, report = false) {
  const chunks: Buffer[] = []; let bytes = 0;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > limit) throw new RequestInputError(report ? 'Report exceeds the 10 MiB limit.' : 'Request body exceeds the 64 KiB limit.'); chunks.push(Buffer.from(chunk)); }
  try {
    const bytes = Buffer.concat(chunks);
    const text = report ? new TextDecoder('utf-8', { fatal:true }).decode(bytes) : bytes.toString('utf8');
    return JSON.parse(report ? text : text || '{}');
  } catch { throw new RequestInputError(report ? 'Report must be valid UTF-8 JSON.' : 'Request body must be valid JSON.'); }
}
function send(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value));
}
export function createLabServer(store: RunStore, adminToken = randomBytes(32).toString('hex')) {
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const origin = `http://127.0.0.1:${port}`;
      if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) return send(res, 403, { error: 'Invalid Host header' });
      if (req.headers.origin && ![origin, `http://localhost:${port}`].includes(req.headers.origin)) return send(res, 403, { error: 'Cross-origin requests are not allowed' });
      const url = new URL(req.url ?? '/', origin);
      if (req.method === 'GET' && ['/','/app.js','/style.css','/favicon.svg'].includes(url.pathname)) {
        const path = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        let content = await readFile(resolve(publicDir, path));
        if (path === 'index.html') content = Buffer.from(content.toString().replace('__ADMIN_TOKEN__', adminToken));
        res.writeHead(200, { 'Content-Type': path.endsWith('.html') ? 'text/html; charset=utf-8' : path.endsWith('.js') ? 'text/javascript; charset=utf-8' : path.endsWith('.svg') ? 'image/svg+xml' : 'text/css; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(content);
      }
      if (url.pathname === '/health' && req.method === 'GET') return send(res, 200, { ok: true, version: '0.3.2' });
      const bearer = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
      if (url.pathname.startsWith('/agent/')) {
        const run = store.resolve(bearer);
        if (!run) return send(res, 401, { error: 'Invalid run capability' });
        if (url.pathname === '/agent/task' && req.method === 'GET') return send(res, 200, { task, policy, run_id: run.id, status: run.status });
        if (url.pathname === '/agent/call' && req.method === 'POST') {
          const input = z.object({ name: z.string().min(1).max(100), arguments: z.record(z.unknown()).default({}) }).strict().parse(await body(req));
          // Body parsing yields. Reload now so simultaneous requests cannot overwrite each other's effects.
          const result = store.mutate(run.id, current => callTool(current, input.name, input.arguments)); return send(res, 200, result);
        }
        if (url.pathname === '/agent/finish' && req.method === 'POST') { store.mutate(run.id, current => finishRun(current)); return send(res, 200, { status: 'completed' }); }
        return send(res, 404, { error: 'Agent endpoint not found' });
      }
      if (!url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
      if (!equal(bearer, adminToken)) return send(res, 401, { error: 'Admin authorization required' });
      if (url.pathname === '/api/reports/compare' && req.method === 'POST') {
        const input = await body(req, 10 * 1024 * 1024, true);
        if (!input || typeof input !== 'object' || Array.isArray(input) ||
            Object.keys(input).length !== 2 || !('baseline' in input) || !('candidate' in input)) {
          throw new RequestInputError('Choose one baseline report and one candidate report.');
        }
        for (const side of ['baseline', 'candidate'] as const) {
          try { verifyReport(input[side]); }
          catch { throw new RequestInputError(`${side === 'baseline' ? 'Baseline' : 'Candidate'} report could not be verified. Choose a single supported report with consistent evidence.`); }
        }
        const { baseline, candidate } = input;
        if (baseline.scenario !== candidate.scenario || baseline.scenario_version !== candidate.scenario_version || baseline.seed !== candidate.seed) {
          throw new RequestInputError('Reports must have the same scenario, scenario version and seed. Choose a matching pair.');
        }
        try {
          const comparison = compareReports([baseline], [candidate]);
          // Supplied identities remain untrusted snapshots. Never touch the store.
          return send(res, 200, { comparison, baseline:{ ...baseline, evaluation:evaluate(baseline) }, candidate:{ ...candidate, evaluation:evaluate(candidate) } });
        } catch {
          throw new RequestInputError('Reports could not be compared. Choose two supported single reports with consistent evidence.');
        }
      }
      if (url.pathname === '/api/reports/review' && req.method === 'POST') {
        const input = await body(req, 10 * 1024 * 1024, true);
        try {
          const verification = verifyReport(input);
          // Replay validates simulation consistency only. Never save, authorize,
          // finish or attach this supplied identity to the local run store.
          return send(res, 200, { report:{ ...input, evaluation:evaluate(input) }, verification });
        } catch {
          throw new RequestInputError('Report could not be verified. Choose a single supported Crash Lab report with consistent evidence.');
        }
      }
      if (url.pathname === '/api/scenarios' && req.method === 'GET') return send(res, 200, { scenarios, policy, task });
      if (url.pathname === '/api/history' && req.method === 'GET') {
        const query = z.object({ limit:z.coerce.number().int().min(1).max(100).default(50), before:z.string().uuid().optional(), q:z.string().max(200).default(''), filter:z.enum(['all','reference','live','attention','running']).default('all') }).strict().parse(Object.fromEntries(url.searchParams));
        if (query.before && !store.get(query.before)) return send(res, 404, { error:'History cursor not found. Return to newest runs.' });
        const page = store.page(query.limit, query.before, query.q, query.filter);
        return send(res, 200, { ...page, runs:page.runs.map(r => ({ ...r, world:undefined, events:undefined, evaluation:evaluate(r) })) });
      }
      if (url.pathname === '/api/runs' && req.method === 'GET') return send(res, 200, store.list().map(r => ({ ...r, world: undefined, events: undefined, evaluation: evaluate(r) })));
      if (url.pathname === '/api/runs' && req.method === 'POST') {
        const input = runSchema.parse(await body(req));
        const run = newRun(input.scenario, input.seed, input.agent); store.save(run);
        if (input.agent === 'external') {
          const token = randomBytes(32).toString('hex'); store.authorize(token, run);
          return send(res, 201, { run: { ...run, evaluation: evaluate(run) }, connection: { mcpServers: { 'agent-crash-lab': { command: process.execPath, args: [cliPath, 'mcp'], env: { CRASHLAB_URL: origin, CRASHLAB_TOKEN: token } } } }, task });
        }
        runScripted(run, input.agent, r => store.save(r));
        return send(res, 201, { run: { ...run, evaluation: evaluate(run) } });
      }
      const match = url.pathname.match(/^\/api\/runs\/([a-f0-9-]+)(\/finish|\/report)?$/);
      if (match) {
        const run = store.get(match[1]); if (!run) return send(res, 404, { error: 'Run not found' });
        if (match[2] === '/finish' && req.method === 'POST') { const finished = store.mutate(run.id, current => { finishRun(current, 'Finished by operator'); return current; }); return send(res, 200, { ...finished, evaluation: evaluate(finished) }); }
        if (req.method === 'GET') {
          if (match[2] === '/report') res.setHeader('Content-Disposition', `attachment; filename="crashlab-${run.scenario}-${run.id.slice(0, 8)}.json"`);
          return send(res, 200, { ...run, evaluation: evaluate(run), report_version: '1.0.0', containment: 'External agent not contained by this MCP server. Lab tools simulate all effects.' });
        }
      }
      send(res, 404, { error: 'Endpoint not found' });
    } catch (err) {
      if (!res.destroyed) {
        // Parser excerpts, rejected keys and storage errors can contain private input.
        const invalid = err instanceof RequestInputError || err instanceof z.ZodError;
        const message = err instanceof RequestInputError ? err.message : err instanceof z.ZodError
          ? 'Invalid request fields. Check required fields, allowed values and types.'
          : 'The lab could not complete this request. Check the local server and database; inspect the run before retrying a write.';
        send(res, invalid ? 400 : 500, { error: message, code: invalid ? 'INVALID_REQUEST' : 'INTERNAL_ERROR' });
      }
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  return server;
}
