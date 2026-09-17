import { constants, openSync, fstatSync, readSync, closeSync } from 'node:fs';

export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

/** Read from the checked descriptor, with a fixed upper bound even if it grows. */
export function readEvidenceJson(path: string): unknown {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Error('Evidence input must be a regular file.');
    if (stat.size > MAX_EVIDENCE_BYTES) throw new Error('Evidence exceeds the 10 MiB input limit.');
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const chunk = Buffer.allocUnsafe(Math.min(65536, MAX_EVIDENCE_BYTES + 1 - total));
      const count = readSync(fd, chunk, 0, chunk.length, null);
      if (!count) break;
      total += count;
      if (total > MAX_EVIDENCE_BYTES) throw new Error('Evidence exceeds the 10 MiB input limit.');
      chunks.push(chunk.subarray(0, count));
    }
    try { return JSON.parse(Buffer.concat(chunks, total).toString('utf8')); }
    catch { throw new Error('Evidence is not valid JSON.'); }
  } finally { closeSync(fd); }
}
