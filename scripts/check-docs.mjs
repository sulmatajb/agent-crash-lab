import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = execFileSync('git', ['ls-files', '-z', '*.md'], {cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const broken = [];
let checked = 0;
for (const file of files) {
  const content = readFileSync(resolve(root,file),'utf8').replace(/```[^\n]*\n[\s\S]*?```/g,'');
  const links = [...content.matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g)].map(m => m[1]);
  links.push(...[...content.matchAll(/^\s*\[[^\]\n]+\]:\s*(\S+)/gm)].map(m=>m[1]));
  for (let link of links) {
    link = link.startsWith('<') ? link.slice(1,link.indexOf('>')) : link.split(/\s+["']/)[0];
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(link)) continue;
    try { link=decodeURIComponent(link.split(/[?#]/)[0]); } catch { broken.push(`${file}: invalid URL encoding: ${link}`);continue; }
    if (!link) continue;
    const target=resolve(dirname(resolve(root,file)),link);
    checked++;
    if(relative(root,target).startsWith('..') || !existsSync(target) || !(statSync(target).isFile()||statSync(target).isDirectory())) broken.push(`${file}: missing or outside-repository target: ${link}`);
  }
}
if(broken.length){console.error(broken.join('\n'));process.exitCode=1;}
else console.log(`Checked ${checked} local link targets in ${files.length} tracked Markdown files. External URLs and heading anchors are not checked.`);
