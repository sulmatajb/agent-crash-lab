import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
if (args.length > 1 || (args.length && args[0] !== '--write')) throw new Error('Usage: node scripts/dependency-licenses.mjs [--write]');
const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
if (lock.lockfileVersion !== 3 || !lock.packages) throw new Error('Expected an npm v3 lockfile with package metadata.');
const entries = Object.entries(lock.packages).filter(([path]) => path).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
for (const [path, entry] of entries) {
  if (!entry.version || typeof entry.license !== 'string' || !entry.license.trim()) throw new Error(`Missing version or declared license: ${path}`);
}
const cell = value => String(value).replaceAll('|', '\\|').replace(/[\r\n]/g, ' ');
const sections = [false, true].map(dev => {
  const group = entries.filter(([, entry]) => Boolean(entry.dev) === dev);
  const counts = new Map();
  for (const [, entry] of group) counts.set(entry.license, (counts.get(entry.license) ?? 0) + 1);
  const summary = [...counts].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([license, count]) => `${count} ${license}`).join(', ');
  return `## ${dev ? 'Development' : 'Production'} dependencies\n\n${group.length} lockfile entries: ${summary}.\n\n| Package path | Version | Declared license |\n| --- | --- | --- |\n${group.map(([path, entry]) => `| ${cell(path.replace(/^node_modules\//, ''))} | ${cell(entry.version)} | ${cell(entry.license)} |`).join('\n')}\n`;
});
const output = `# Dependency license inventory\n\nGenerated from the committed package-lock.json by \`npm run licenses:update\`. CI runs \`npm run check:licenses\` and fails if this inventory differs or a package lacks a declared license. Recheck licenses and notices when updating dependencies; regenerating this list is not approval of new terms.\n\nThis inventory records declarations, not a legal compatibility assessment or proof that all required notices are present. It includes optional packages for other platforms, whether or not installed here. Production means not marked dev-only by npm; development entries include build and test tools. Package paths distinguish nested versions. Dependencies retain their own licenses.\n\nStandalone video assets and tools invoked outside the root lockfile, including HyperFrames and its registry components, are outside this inventory. See [third-party notices](THIRD-PARTY-NOTICES.md) and the [publication audit](PUBLICATION-AUDIT.md).\n\n${sections.join('\n')}`;
const target = resolve(root, 'docs/DEPENDENCY-LICENSES.md');
if (args[0] === '--write') {
  writeFileSync(target, output);
  console.log(`Updated license inventory for ${entries.length} lockfile entries.`);
} else if (readFileSync(target, 'utf8') !== output) {
  console.error('Dependency license inventory is stale. Review dependency changes, then run npm run licenses:update.');
  process.exitCode = 1;
} else console.log(`License inventory matches ${entries.length} lockfile entries.`);
