import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { MAX_EVIDENCE_BYTES, readEvidenceBytes, parseEvidenceJson } from './evidence-file.js';
import { assertReportVersion, verifyReport } from './replay.js';

const MAX_RUNS = 1100;
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** Extract verified saved snapshots. No runner, database or provider is involved. */
export function splitBundle(input: string, destination: string) {
  const original = readEvidenceBytes(input);
  const bundle = parseEvidenceJson(original);
  assertReportVersion(bundle);
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)
      || !Array.isArray((bundle as { runs?: unknown }).runs)) {
    throw new Error('Split requires a multi-run bundle with a runs array, not a single report or campaign directory.');
  }
  const runs = (bundle as { runs: unknown[] }).runs;
  if (!runs.length || runs.length > MAX_RUNS) throw new Error('Bundle must contain 1–1100 runs.');

  // Validate every member before creating the output directory. Compact output
  // avoids whitespace expansion, and each file must fit the existing viewer.
  const reports = runs.map((run, index) => {
    let verification: ReturnType<typeof verifyReport>;
    try { verification = verifyReport(run); }
    catch { throw new Error(`Bundle run ${index + 1} failed consistency verification. No reports were written.`); }
    const serialized = JSON.stringify(run);
    if (!isDeepStrictEqual(JSON.parse(serialized), run)) {
      throw new Error(`Bundle run ${index + 1} cannot be serialized without changing saved values. No reports were written.`);
    }
    const bytes = Buffer.from(serialized + '\n');
    if (bytes.length > MAX_EVIDENCE_BYTES) throw new Error(`Bundle run ${index + 1} exceeds the viewer's 10 MiB limit.`);
    return { filename: `run-${String(index + 1).padStart(4, '0')}.json`, bytes, verification };
  });
  const inventory = {
    extraction_version: '1.0.0',
    source: { filename: 'bundle.json', sha256: sha256(original), bytes: original.length },
    reports: reports.map((report, index) => ({
      index, filename: report.filename, sha256: sha256(report.bytes), bytes: report.bytes.length,
      consistency_verified: report.verification.verified, verdict: report.verification.verdict,
    })),
    limitation: 'Internal consistency only, not authorship, agent identity, execution metadata or campaign completeness. A verified run can have a failed or incomplete verdict. Original bundle claims are preserved, not certified.',
  };

  const directory = resolve(destination);
  try { fs.mkdirSync(directory, { mode: 0o700 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Split output already exists. Choose a new --out directory.');
    throw new Error('Cannot create split output directory. Its parent must exist.');
  }
  const created: string[] = [];
  const write = (name: string, bytes: Buffer) => {
    const path = join(directory, name);
    const fd = fs.openSync(path, 'wx', 0o600);
    created.push(path);
    try { fs.writeFileSync(fd, bytes); }
    finally { fs.closeSync(fd); }
  };
  try {
    write('bundle.json', original);
    for (const report of reports) write(report.filename, report.bytes);
    write('extraction.json', Buffer.from(JSON.stringify(inventory, null, 2) + '\n'));
  } catch {
    // Remove only files this operation created. Never recursively remove an
    // unexpected addition by another writer in the destination directory.
    let cleanupFailed = false;
    for (const path of created.reverse()) {
      try { fs.unlinkSync(path); } catch { cleanupFailed = true; }
    }
    try { fs.rmdirSync(directory); } catch { cleanupFailed = true; }
    throw new Error(cleanupFailed
      ? 'Split failed. Cleanup was incomplete; inspect the output directory before retrying.'
      : 'Split failed while writing. Created output was removed.');
  }
  return inventory;
}
