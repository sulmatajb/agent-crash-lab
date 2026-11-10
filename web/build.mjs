// Builds the zero-install browser demo from the same engine source the CLI uses.
// Usage: node web/build.mjs (fetches a pinned esbuild through npx; no new dependency)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
execFileSync('npx', ['--yes', 'esbuild@0.28.2', 'web/entry.ts', '--bundle', '--minify', '--format=iife', '--target=es2022', '--alias:node:crypto=./web/crypto-shim.ts', '--outfile=web/engine.bundle.js'], { stdio: 'inherit' });
const engine = readFileSync('web/engine.bundle.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const body = readFileSync('web/play.template.html', 'utf8').replace('/*ENGINE*/', () => engine);
mkdirSync('docs/play', { recursive: true });
writeFileSync('web/play.fragment.html', body);
writeFileSync('docs/play/index.html', `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="description" content="Play the agent: work an invoice inbox with the Agent Crash Lab tools and get graded by the same evaluator.">\n</head>\n<body>\n${body}\n</body>\n</html>\n`);
console.log('built docs/play/index.html', body.length, 'bytes');
