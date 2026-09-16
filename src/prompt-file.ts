import { constants, openSync, fstatSync, readSync, closeSync } from 'node:fs';

export const MAX_PROMPT_BYTES = 64 * 1024;

/** Read a bounded text file before starting any client or campaign. */
export function readSystemPrompt(path: string): string {
  let fd: number;
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK); }
  catch { throw new Error('Cannot open --system-prompt file. Check its path and permissions.'); }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Error('--system-prompt must be a regular file.');
    if (stat.size > MAX_PROMPT_BYTES) throw new Error('--system-prompt exceeds the 64 KiB limit.');
    // The extra byte detects growth after fstat without an unbounded allocation.
    const buffer = Buffer.allocUnsafe(MAX_PROMPT_BYTES + 1);
    let total = 0;
    while (total < buffer.length) {
      const count = readSync(fd, buffer, total, buffer.length - total, null);
      if (!count) break;
      total += count;
    }
    if (total > MAX_PROMPT_BYTES) throw new Error('--system-prompt exceeds the 64 KiB limit.');
    let prompt: string;
    try { prompt = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, total)); }
    catch { throw new Error('--system-prompt must contain valid UTF-8 text.'); }
    if (prompt.includes('\0')) throw new Error('--system-prompt must not contain NUL characters.');
    return prompt;
  } finally { closeSync(fd); }
}
