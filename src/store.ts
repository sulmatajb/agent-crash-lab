import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import type { Run } from './engine.js';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export class RunStore {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS capabilities (hash TEXT PRIMARY KEY, run_id TEXT NOT NULL);');
  }
  save(run: Run) { this.db.prepare('INSERT INTO runs (id, created_at, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(run.id, run.created_at, JSON.stringify(run)); }
  get(id: string): Run | undefined { const row = this.db.prepare('SELECT data FROM runs WHERE id=?').get(id); return row ? JSON.parse(row.data as string) : undefined; }
  mutate<T>(id: string, change: (run: Run) => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const run = this.get(id); if (!run) throw new Error('Run not found'); const result = change(run); this.save(run); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  list(): Run[] { return this.db.prepare('SELECT data FROM runs ORDER BY created_at DESC, rowid DESC LIMIT 250').all().map(row => JSON.parse(row.data as string)); }
  authorize(token: string, run: Run) { this.db.prepare('INSERT INTO capabilities (hash, run_id) VALUES (?, ?)').run(hash(token), run.id); }
  resolve(token: string): Run | undefined { const row = this.db.prepare('SELECT run_id FROM capabilities WHERE hash=?').get(hash(token)); return row ? this.get(row.run_id as string) : undefined; }
  close() { this.db.close(); }
}
